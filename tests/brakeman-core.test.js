// Unit tests for assets/js/brakeman-core.js. Run with: node --test tests/
//
// The fixtures are real Brakeman 8 JSON reports of the same small app, before
// and after a change: the SQL injection was fixed, an XSS was introduced and a
// comment shifted every controller warning down by one line.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../assets/js/brakeman-core.js');

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const baselineReport = fixture('baseline-report.json');
const currentReport = fixture('current-report.json');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    data
  };
}

const byType = (warnings, type) => warnings.find(w => w.warning_type === type);

test('isBrakemanReport accepts reports with warnings or only ignored warnings', () => {
  assert.equal(core.isBrakemanReport(currentReport), true);
  assert.equal(core.isBrakemanReport({ scan_info: {}, ignored_warnings: [] }), true);
  assert.equal(core.isBrakemanReport(fixture('brakeman.ignore')), false, 'an ignore file is not a report');
  assert.equal(core.isBrakemanReport({ scan_info: {} }), false);
  assert.equal(core.isBrakemanReport([]), false);
  assert.equal(core.isBrakemanReport(null), false);
});

test('normalizeReport exposes location, user input, CWE and documentation link', () => {
  const warnings = core.normalizeReport(currentReport);
  assert.equal(warnings.length, 6);

  const redirect = byType(warnings, 'Redirect');
  assert.equal(redirect.location, 'UsersController#show');
  assert.equal(redirect.user_input, 'params[:url]');
  assert.deepEqual(redirect.cwe_ids, [601]);
  assert.equal(redirect.link, 'https://brakemanscanner.org/docs/warning_types/redirect/');
  assert.equal(redirect.key, redirect.fingerprint);

  assert.equal(byType(warnings, 'Cross-Site Request Forgery').location, 'ApplicationController');
  assert.equal(byType(warnings, 'Cross-Site Scripting').location, 'Template: users/search');
  assert.equal(byType(warnings, 'Unmaintained Dependency').location, '');
});

test('normalizeWarning survives malformed input and keeps line 0', () => {
  const w = core.normalizeWarning({ line: 0, confidence: 'Critical', cwe_id: ['89', 'x', 89], location: 'oops' }, false);
  assert.equal(w.line, '0');
  assert.equal(w.confidence, 'weak');
  assert.deepEqual(w.cwe_ids, [89]);
  assert.equal(w.location, '');
  assert.equal(w.fingerprint, '');
  assert.match(w.key, /^nofp\|/);
});

test('safeExternalUrl only lets https links through', () => {
  assert.equal(core.safeExternalUrl('https://brakemanscanner.org/docs/'), 'https://brakemanscanner.org/docs/');
  assert.equal(core.safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(core.safeExternalUrl('http://example.com'), '');
  assert.equal(core.safeExternalUrl('not a url'), '');
  assert.equal(core.safeExternalUrl(42), '');
});

test('cweInfo maps CWE ids to OWASP Top 10:2025 categories', () => {
  assert.deepEqual(core.cweInfo(89).owasp, { id: 'A05:2025', title: 'Injection' });
  assert.deepEqual(core.cweInfo(601).owasp, { id: 'A01:2025', title: 'Broken Access Control' });
  assert.equal(core.cweInfo(1104).owasp.id, 'A03:2025');
  assert.equal(core.cweInfo(89).url, 'https://cwe.mitre.org/data/definitions/89.html');
  assert.equal(core.cweInfo(123456).owasp, null);
});

test('compareReports matches warnings by fingerprint even when lines moved', () => {
  const current = core.normalizeReport(currentReport);
  const baseline = core.normalizeReport(baselineReport);
  const diff = core.compareReports(current, baseline);

  assert.deepEqual(diff.added.map(w => w.warning_type), ['Cross-Site Scripting']);
  assert.deepEqual(diff.fixed.map(w => w.warning_type), ['SQL Injection']);
  assert.equal(diff.unchanged.length, 5);

  // Command injection moved from line 10 to 11 but is still the same warning
  const baselineLine = byType(baseline, 'Command Injection').line;
  const currentLine = byType(current, 'Command Injection').line;
  assert.notEqual(baselineLine, currentLine);
  assert.ok(diff.unchanged.some(w => w.warning_type === 'Command Injection'));
});

test('compareReports does not report a warning muted since the baseline as fixed', () => {
  const baseline = core.normalizeReport(baselineReport);
  const csrf = baselineReport.warnings.find(w => w.warning_type === 'Cross-Site Request Forgery');
  const muted = {
    warnings: currentReport.warnings.filter(w => w !== csrf && w.fingerprint !== csrf.fingerprint),
    ignored_warnings: [{ ...csrf, note: 'API only' }]
  };
  const diff = core.compareReports(core.normalizeReport(muted), baseline);
  assert.ok(!diff.fixed.some(w => w.fingerprint === csrf.fingerprint));
});

test('matchesFilters combines comparison, confidence, triage and search filters', () => {
  const current = core.normalizeReport(currentReport);
  const baseline = core.normalizeReport(baselineReport);
  const diff = core.compareReports(current, baseline);
  diff.added.forEach(w => { w.diff = 'new'; });
  diff.unchanged.forEach(w => { w.diff = 'unchanged'; });
  diff.fixed.forEach(w => { w.diff = 'fixed'; });
  const all = [...current, ...diff.fixed];

  const visible = (filters, status = () => 'untriaged') =>
    all.filter(w => core.matchesFilters(w, { confidence: 'all', triage: 'all', diff: 'current', search: '', ...filters }, status(w)))
      .map(w => w.warning_type);

  assert.equal(visible({}).length, 6, 'fixed warnings are hidden from the current view');
  assert.deepEqual(visible({ diff: 'new' }), ['Cross-Site Scripting']);
  assert.deepEqual(visible({ diff: 'fixed' }), ['SQL Injection']);
  // Every warning of the fixture has High confidence
  assert.deepEqual(visible({ confidence: 'high', diff: 'new' }), ['Cross-Site Scripting']);
  assert.deepEqual(visible({ confidence: 'weak' }), []);
  assert.deepEqual(visible({ confidence: 'ignored' }), []);

  // Search covers location, user input and OWASP categories
  assert.deepEqual(visible({ search: 'userscontroller#show' }), ['Redirect']);
  assert.deepEqual(visible({ search: 'params[:dir]' }), ['Command Injection']);
  assert.deepEqual(visible({ search: 'a01:2025' }).sort(), ['Cross-Site Request Forgery', 'Redirect'].sort());

  const status = w => (w.warning_type === 'Redirect' ? 'false_positive' : 'untriaged');
  assert.deepEqual(visible({ triage: 'false_positive' }, status), ['Redirect']);
  assert.equal(visible({ triage: 'untriaged' }, status).length, 5);
});

test('highlightUserInput marks the user input and escapes the rest', () => {
  assert.equal(
    core.highlightUserInput('system("ls #{params[:dir]}") <b>', 'params[:dir]'),
    'system(&quot;ls #{<mark class="user-input-mark">params[:dir]</mark>}&quot;) &lt;b&gt;'
  );
  assert.equal(core.highlightUserInput('<x>', ''), '&lt;x&gt;');
  assert.equal(core.highlightUserInput('a', '<script>'), 'a');
});

test('createTriageStore persists decisions and tolerates corrupted or failing storage', () => {
  const storage = memoryStorage();
  const store = core.createTriageStore(storage, 'triage');
  assert.deepEqual(store.get('fp1'), { status: 'untriaged', note: '' });

  assert.equal(store.set('fp1', { status: 'false_positive' }), true);
  assert.equal(store.set('fp1', { note: 'Admin only' }), true);
  assert.deepEqual(core.createTriageStore(storage, 'triage').get('fp1'), { status: 'false_positive', note: 'Admin only' });

  // Unknown statuses from a tampered storage are dropped
  storage.setItem('triage', JSON.stringify({ version: 1, entries: { a: { status: 'pwned' }, b: { status: 'to_fix' } } }));
  const reloaded = core.createTriageStore(storage, 'triage');
  assert.equal(reloaded.get('a').status, 'untriaged');
  assert.equal(reloaded.get('b').status, 'to_fix');

  storage.setItem('triage', '{not json');
  assert.equal(core.createTriageStore(storage, 'triage').get('b').status, 'untriaged');

  // Resetting a warning to untriaged without note removes the entry
  const clean = core.createTriageStore(storage, 'clean');
  clean.set('x', { status: 'to_fix' });
  clean.set('x', { status: 'untriaged' });
  assert.equal(storage.getItem('clean'), null);

  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const failingStore = core.createTriageStore(failing, 'triage');
  assert.equal(failingStore.set('fp', { status: 'to_fix' }), false);
  assert.equal(failingStore.get('fp').status, 'to_fix', 'the decision is kept in memory');

  assert.equal(core.createTriageStore(null, 'triage').persistent, false);
});

test('createTriageStore never writes report content to the storage', () => {
  const storage = memoryStorage();
  const store = core.createTriageStore(storage, 'triage');
  const noFingerprint = core.normalizeWarning({ warning_type: 'SQL Injection', file: 'app/secret.rb', code: 'User.where(x)' }, false);

  store.set(noFingerprint.key, { status: 'false_positive', note: 'checked' });
  assert.equal(store.get(noFingerprint.key).status, 'false_positive', 'kept in memory');
  assert.equal(storage.getItem('triage'), null);

  store.set('abc123', { status: 'to_fix' });
  const saved = storage.getItem('triage');
  assert.ok(saved.includes('abc123'));
  assert.ok(!saved.includes('app/secret.rb'));
});

test('buildIgnoreFile keeps existing ignored warnings and adds ignorable triage decisions', () => {
  const report = {
    ...currentReport,
    ignored_warnings: [{ ...currentReport.warnings.find(w => w.warning_type === 'Unmaintained Dependency'), note: 'Upgrade planned in Q4' }],
    warnings: currentReport.warnings.filter(w => w.warning_type !== 'Unmaintained Dependency')
  };
  const warnings = core.normalizeReport(report);
  const decisions = {
    [byType(warnings, 'Cross-Site Request Forgery').key]: { status: 'false_positive', note: 'JSON API with token auth' },
    [byType(warnings, 'Redirect').key]: { status: 'accepted_risk', note: '' },
    [byType(warnings, 'Command Injection').key]: { status: 'to_fix', note: 'Sprint 12' }
  };
  const getTriage = key => decisions[key] || { status: 'untriaged', note: '' };

  const { file, count, skipped } = core.buildIgnoreFile(warnings, getTriage, '8.0.6');
  assert.equal(count, 3);
  assert.equal(skipped, 0);
  assert.equal(file.brakeman_version, '8.0.6');

  const notes = Object.fromEntries(file.ignored_warnings.map(w => [w.warning_type, w.note]));
  assert.deepEqual(notes, {
    'Unmaintained Dependency': 'Upgrade planned in Q4',
    'Cross-Site Request Forgery': 'False positive: JSON API with token auth',
    'Redirect': 'Accepted risk'
  });

  // Sorted by fingerprint and shaped like Brakeman's own entries
  const fingerprints = file.ignored_warnings.map(w => w.fingerprint);
  assert.deepEqual(fingerprints, [...fingerprints].sort());
  assert.deepEqual(Object.keys(file.ignored_warnings[0]), [
    'warning_type', 'warning_code', 'fingerprint', 'check_name', 'message', 'file', 'line',
    'link', 'code', 'render_path', 'location', 'user_input', 'confidence', 'cwe_id', 'note'
  ]);

  assert.ok(core.serializeIgnoreFile(file).endsWith('}\n'));
});

// ignored-report.json was produced by Brakeman with fixtures/brakeman.ignore in
// config/: the CSRF warning is ignored, but Brakeman does not copy its note.
test('the JSON report has no note for ignored warnings: applyIgnoreNotes restores them', () => {
  const warnings = core.normalizeReport(fixture('ignored-report.json'));
  const csrf = warnings.find(w => w.is_ignored);
  assert.equal(csrf.warning_type, 'Cross-Site Request Forgery');
  assert.equal(csrf.note, '');

  const entries = core.parseIgnoreFile(fixture('brakeman.ignore'));
  assert.equal(core.applyIgnoreNotes(warnings, entries), 1);
  assert.equal(csrf.note, 'False positive: API only');

  assert.equal(core.parseIgnoreFile(currentReport), null, 'a report is not an ignore file');
  assert.equal(core.parseIgnoreFile({ ignored_warnings: [{ note: 'no fingerprint' }] }).length, 0);
});

test('buildIgnoreFile never loses the notes or entries of the existing ignore file', () => {
  const warnings = core.normalizeReport(fixture('ignored-report.json'));
  const redirect = byType(warnings, 'Redirect');
  const getTriage = key => (key === redirect.key ? { status: 'false_positive', note: 'Internal URL' } : { status: 'untriaged', note: '' });

  // Without the ignore file, the ignored CSRF warning is exported with an empty note
  const blind = core.buildIgnoreFile(warnings, getTriage, '8.0.6');
  assert.equal(blind.missingNotes, 1);
  assert.equal(blind.added, 1);

  const existing = core.parseIgnoreFile(fixture('brakeman.ignore'));
  const obsolete = { fingerprint: '0000', warning_type: 'Old', note: 'Removed code' };
  const merged = core.buildIgnoreFile(warnings, getTriage, '8.0.6', [...existing, obsolete]);
  assert.equal(merged.missingNotes, 0);
  assert.equal(merged.added, 1);
  assert.equal(merged.count, 3);
  const notes = Object.fromEntries(merged.file.ignored_warnings.map(w => [w.fingerprint, w.note]));
  assert.deepEqual(notes, {
    '0000': 'Removed code',
    [existing[0].fingerprint]: 'False positive: API only',
    [redirect.fingerprint]: 'False positive: Internal URL'
  });
});

test('buildIgnoreFile skips warnings without fingerprint and fixed warnings', () => {
  const noFingerprint = core.normalizeWarning({ warning_type: 'SQL Injection', file: 'a.rb' }, false);
  const fixed = core.normalizeWarning({ warning_type: 'Redirect', fingerprint: 'abc' }, false);
  fixed.diff = 'fixed';
  const { count, skipped } = core.buildIgnoreFile([noFingerprint, fixed], () => ({ status: 'false_positive', note: '' }));
  assert.equal(count, 0);
  assert.equal(skipped, 1);
});

test('calculateSecurityScore deducts points by confidence', () => {
  assert.deepEqual(core.calculateSecurityScore([]), { score: 100, grade: 'A+', label: 'Excellent posture' });
  const warnings = core.normalizeReport(currentReport);
  const { score, grade } = core.calculateSecurityScore(warnings);
  assert.ok(score >= 0 && score < 100);
  assert.equal(typeof grade, 'string');
});

test('parseReportDate reads Brakeman timestamps in every browser', () => {
  const date = core.parseReportDate('2026-09-24 07:29:36 +0000');
  assert.equal(date.toISOString(), '2026-09-24T07:29:36.000Z');
  assert.equal(core.parseReportDate('2026-09-15T09:42:18+02:00').toISOString(), '2026-09-15T07:42:18.000Z');
  assert.equal(core.parseReportDate('garbage'), null);
  assert.equal(core.parseReportDate(undefined), null);
});
