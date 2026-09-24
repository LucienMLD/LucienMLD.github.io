/*
 * Brakeman Report Visualizer — pure logic.
 *
 * No DOM access here: everything is a plain function over report data so it can
 * be unit tested with `node --test tests/`. The browser gets it as
 * window.BrakemanCore, Node gets it through module.exports.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BrakemanCore = api;
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  const CONFIDENCE_LEVELS = ['high', 'medium', 'weak'];

  // "ignorable" statuses end up in the exported config/brakeman.ignore
  const TRIAGE_STATUSES = {
    untriaged: { label: 'Untriaged', ignorable: false },
    to_fix: { label: 'To fix', ignorable: false },
    false_positive: { label: 'False positive', ignorable: true },
    accepted_risk: { label: 'Accepted risk', ignorable: true }
  };

  // Confidence says how sure Brakeman is, severity is the impact assessed by the
  // reviewer. The Security Index uses the severity when one was set.
  const SEVERITIES = {
    critical: { label: 'Critical', weight: 15 },
    high: { label: 'High', weight: 10 },
    medium: { label: 'Medium', weight: 4 },
    low: { label: 'Low', weight: 1 }
  };

  const CONFIDENCE_WEIGHTS = { high: 10, medium: 4, weak: 1 };

  const SORT_ORDERS = ['report', 'severity', 'file', 'type'];

  // Key order of a warning in Brakeman's own output (Brakeman::Warning#to_hash)
  const IGNORE_FILE_KEYS = [
    'warning_type', 'warning_code', 'fingerprint', 'check_name', 'message', 'file', 'line',
    'link', 'code', 'render_path', 'location', 'user_input', 'confidence', 'cwe_id'
  ];

  // OWASP Top 10:2025 categories for the CWE ids Brakeman reports
  const OWASP_2025 = {
    A01: 'Broken Access Control',
    A02: 'Security Misconfiguration',
    A03: 'Software Supply Chain Failures',
    A04: 'Cryptographic Failures',
    A05: 'Injection',
    A07: 'Authentication Failures',
    A08: 'Software or Data Integrity Failures'
  };

  const CWE_TO_OWASP = {
    22: 'A01', 200: 'A01', 285: 'A01', 352: 'A01', 601: 'A01', 639: 'A01', 862: 'A01', 918: 'A01',
    16: 'A02', 614: 'A02', 942: 'A02', 1004: 'A02',
    937: 'A03', 1035: 'A03', 1104: 'A03', 1395: 'A03',
    326: 'A04', 327: 'A04', 328: 'A04', 330: 'A04', 338: 'A04',
    20: 'A05', 74: 'A05', 77: 'A05', 78: 'A05', 79: 'A05', 88: 'A05', 89: 'A05', 94: 'A05',
    95: 'A05', 470: 'A05',
    287: 'A07', 295: 'A07', 384: 'A07', 521: 'A07', 798: 'A07',
    502: 'A08', 565: 'A08', 915: 'A08'
  };

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // A report may only contain ignored warnings (muted through config/brakeman.ignore).
  // Without a warnings array, scan_info tells a report from a brakeman.ignore file,
  // which also holds an ignored_warnings array.
  function isBrakemanReport(parsed) {
    if (!isPlainObject(parsed)) return false;
    return Array.isArray(parsed.warnings) || (Array.isArray(parsed.ignored_warnings) && isPlainObject(parsed.scan_info));
  }

  function toText(value, fallback) {
    return (value !== null && value !== undefined) ? String(value).trim() : fallback;
  }

  // Report files are untrusted: only https links are ever turned into href attributes
  function safeExternalUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  // Human readable location: "UsersController#show", "ApplicationController", "Template: users/show"
  function formatLocation(location) {
    if (!isPlainObject(location)) return '';
    const text = value => (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : '';

    if (location.type === 'template') {
      const template = text(location.template);
      return template ? `Template: ${template}` : '';
    }
    const klass = text(location.class) || text(location.controller) || text(location.model);
    const method = text(location.method);
    if (klass && method) return `${klass}#${method}`;
    return klass || method;
  }

  function normalizeCweIds(value) {
    const list = Array.isArray(value) ? value : [value];
    return list
      .map(id => parseInt(id, 10))
      .filter((id, i, all) => Number.isInteger(id) && id > 0 && all.indexOf(id) === i);
  }

  function cweInfo(id) {
    const code = CWE_TO_OWASP[id];
    return {
      id,
      label: `CWE-${id}`,
      url: `https://cwe.mitre.org/data/definitions/${id}.html`,
      owasp: code ? { id: `${code}:2025`, title: OWASP_2025[code] } : null
    };
  }

  // Stable identity of a warning across scans. Brakeman fingerprints ignore line
  // numbers, so a warning that only moved in the file is still matched.
  const FALLBACK_KEY_PREFIX = 'nofp|';

  function warningKey(w) {
    if (w.fingerprint) return w.fingerprint;
    return FALLBACK_KEY_PREFIX + [w.warning_type, w.file, w.message, w.code || ''].join('|');
  }

  // Folder used by the folder filter: "app/controllers", "app/views/users" is
  // grouped under "app/views", "lib", or the file itself at the root ("Gemfile.lock")
  function folderOf(file) {
    const parts = String(file || '').split('/').filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    if (parts[0] === 'app' && parts.length > 2) return `${parts[0]}/${parts[1]}`;
    return parts[0];
  }

  function normalizeWarning(w, isIgnored) {
    let code = null;
    if (w.code !== null && w.code !== undefined) {
      code = typeof w.code === 'object' ? JSON.stringify(w.code) : String(w.code).trim();
    }

    const rawConf = String(w.confidence || '').toLowerCase().trim();
    const confidence = CONFIDENCE_LEVELS.includes(rawConf) ? rawConf : 'weak';

    const normalized = {
      warning_type: toText(w.warning_type, 'Warning'),
      message: toText(w.message, 'No description provided'),
      file: toText(w.file, 'Unknown file'),
      // Line 0 is a valid value, hence the explicit null checks in toText
      line: toText(w.line, 'N/A'),
      code,
      confidence,
      check_name: typeof w.check_name === 'string' ? w.check_name.trim() : '',
      location: formatLocation(w.location),
      folder: folderOf(w.file),
      user_input: (typeof w.user_input === 'string' && w.user_input.trim()) ? w.user_input.trim() : '',
      cwe_ids: normalizeCweIds(w.cwe_id),
      link: safeExternalUrl(w.link),
      is_ignored: isIgnored,
      // Brakeman stores the justification written in brakeman.ignore under "note"
      note: isIgnored ? toText(w.note, '') : '',
      fingerprint: typeof w.fingerprint === 'string' ? w.fingerprint.trim() : '',
      // Kept untouched to rebuild config/brakeman.ignore entries exactly as Brakeman wrote them
      raw: w
    };
    normalized.key = warningKey(normalized);
    return normalized;
  }

  function normalizeReport(report) {
    if (!isPlainObject(report)) return [];
    const toRawList = list => (Array.isArray(list) ? list : []).filter(isPlainObject);
    return [
      ...toRawList(report.warnings).map(w => normalizeWarning(w, false)),
      ...toRawList(report.ignored_warnings).map(w => normalizeWarning(w, true))
    ];
  }

  function warningWeight(w, severity) {
    if (severity && SEVERITIES[severity]) return SEVERITIES[severity].weight;
    return CONFIDENCE_WEIGHTS[w.confidence] || CONFIDENCE_WEIGHTS.weak;
  }

  // Scores active warnings. With getTriage, warnings triaged as false positive
  // are not scored (like ignored ones) and a severity set by the reviewer
  // replaces the confidence-based weight.
  function calculateSecurityScore(warnings, getTriage) {
    let totalDeductions = 0;
    let falsePositives = 0;
    (warnings || []).forEach(w => {
      const entry = getTriage ? getTriage(w.key) : null;
      if (entry && entry.status === 'false_positive') {
        falsePositives++;
        return;
      }
      totalDeductions += warningWeight(w, entry && entry.severity);
    });

    const score = Math.max(0, 100 - totalDeductions);

    let grade = 'F';
    let label = 'Critical issues present';
    if (score >= 95) { grade = 'A+'; label = 'Excellent posture'; }
    else if (score >= 90) { grade = 'A'; label = 'Very secure'; }
    else if (score >= 80) { grade = 'B'; label = 'Minor warnings'; }
    else if (score >= 70) { grade = 'C'; label = 'Action required'; }
    else if (score >= 50) { grade = 'D'; label = 'Vulnerable profile'; }

    return { score, grade, label, falsePositives };
  }

  // Splits current warnings into new / unchanged and lists the baseline warnings
  // that disappeared. Ignored warnings take part in the match: a warning that was
  // muted since the baseline is still there, it is not fixed.
  function compareReports(currentWarnings, baselineWarnings) {
    const baselineKeys = new Set(baselineWarnings.map(w => w.key));
    const currentKeys = new Set(currentWarnings.map(w => w.key));

    return {
      added: currentWarnings.filter(w => !baselineKeys.has(w.key)),
      unchanged: currentWarnings.filter(w => baselineKeys.has(w.key)),
      fixed: baselineWarnings.filter(w => !currentKeys.has(w.key))
    };
  }

  // filters: { confidence: 'all'|'high'|'medium'|'weak'|'ignored',
  //            triage: 'all'|<status>, diff: 'current'|'new'|'unchanged'|'fixed', search: string }
  // w.diff is 'new', 'unchanged' or 'fixed' once a baseline is loaded.
  function matchesFilters(w, filters, triageStatus) {
    const isFixed = w.diff === 'fixed';

    if (filters.diff === 'fixed') {
      if (!isFixed) return false;
    } else {
      if (isFixed) return false;
      if ((filters.diff === 'new' || filters.diff === 'unchanged') && w.diff !== filters.diff) return false;
    }

    if (filters.confidence === 'ignored') {
      if (!w.is_ignored) return false;
    } else if (filters.confidence && filters.confidence !== 'all') {
      if (w.is_ignored || w.confidence !== filters.confidence) return false;
    }

    if (filters.type && filters.type !== 'all' && w.warning_type !== filters.type) return false;
    if (filters.folder && filters.folder !== 'all' && w.folder !== filters.folder) return false;

    // Only active warnings of the current report can be triaged
    if (filters.triage && filters.triage !== 'all') {
      if (w.is_ignored || isFixed || triageStatus !== filters.triage) return false;
    }

    const term = (filters.search || '').toLowerCase().trim();
    if (term) {
      const cwes = w.cwe_ids.map(id => {
        const info = cweInfo(id);
        return info.owasp ? `${info.label} ${info.owasp.id} ${info.owasp.title}` : info.label;
      }).join(' ');
      const haystack = [
        w.warning_type, w.message, w.file, w.code || '', w.note, w.location, w.user_input, w.check_name, cwes
      ].join(' ').toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    return true;
  }

  function lineNumber(w) {
    const line = parseInt(w.line, 10);
    return Number.isInteger(line) ? line : 0;
  }

  // Returns a sorted copy. 'report' keeps Brakeman's order, 'severity' puts the
  // heaviest warnings first (reviewer severity, else confidence), 'file' sorts by
  // path then line, 'type' by warning type. Ties keep the report order.
  function sortWarnings(warnings, order, getTriage) {
    const indexed = warnings.map((w, index) => ({ w, index }));
    const byReport = (a, b) => a.index - b.index;
    const compare = {
      severity: (a, b) => {
        const weight = item => warningWeight(item.w, getTriage ? getTriage(item.w.key).severity : '');
        return weight(b) - weight(a);
      },
      file: (a, b) => a.w.file.localeCompare(b.w.file) || lineNumber(a.w) - lineNumber(b.w),
      type: (a, b) => a.w.warning_type.localeCompare(b.w.warning_type)
    }[order];

    indexed.sort((a, b) => (compare ? compare(a, b) : 0) || byReport(a, b));
    return indexed.map(item => item.w);
  }

  // Link to the warning's file in the reviewer's editor or repository.
  // settings.mode: 'vscode' with settings.root = local clone path,
  //                'web' with settings.root = https URL of the files (…/blob/main).
  // Report paths are untrusted: absolute paths and ".." segments get no link.
  function buildCodeLink(w, settings) {
    if (!settings || !settings.root || !w.file) return null;
    const segments = w.file.split('/');
    if (w.file.startsWith('/') || segments.some(part => part === '..' || part === '')) return null;
    const line = lineNumber(w);

    if (settings.mode === 'vscode') {
      const root = String(settings.root).trim().replace(/\\/g, '/').replace(/\/+$/, '');
      if (!root) return null;
      const path = `${root.startsWith('/') ? '' : '/'}${root}/${w.file}`;
      return { href: `vscode://file${encodeURI(path)}${line ? `:${line}` : ''}`, label: 'Open in VS Code' };
    }

    if (settings.mode === 'web') {
      const base = safeExternalUrl(settings.root);
      if (!base) return null;
      const path = segments.map(encodeURIComponent).join('/');
      return { href: `${base.replace(/\/+$/, '')}/${path}${line ? `#L${line}` : ''}`, label: 'View in repository' };
    }

    return null;
  }

  const FILTER_DEFAULTS = {
    confidence: 'all', type: 'all', folder: 'all', triage: 'all', diff: 'current', sort: 'report', search: ''
  };

  // Filters live in the URL fragment (#type=SQL+Injection&sort=file) so a view
  // can be bookmarked. The fragment is never sent to any server.
  function serializeFilters(filters) {
    const params = new URLSearchParams();
    Object.keys(FILTER_DEFAULTS).forEach(key => {
      const value = typeof filters[key] === 'string' ? filters[key].trim() : '';
      if (value && value !== FILTER_DEFAULTS[key]) params.set(key, value);
    });
    return params.toString();
  }

  // Only known keys and values are kept; type and folder are checked by the
  // caller against the loaded report.
  function parseFilters(hash) {
    const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    const allowed = {
      confidence: ['all', 'high', 'medium', 'weak', 'ignored'],
      triage: ['all', ...Object.keys(TRIAGE_STATUSES)],
      diff: ['current', 'new', 'unchanged', 'fixed'],
      sort: SORT_ORDERS
    };
    const filters = { ...FILTER_DEFAULTS };
    Object.keys(FILTER_DEFAULTS).forEach(key => {
      const value = params.get(key);
      if (value === null) return;
      if (allowed[key] && !allowed[key].includes(value)) return;
      filters[key] = value.slice(0, 200);
    });
    return filters;
  }

  // Wraps each occurrence of the user input inside the escaped snippet with <mark>
  function highlightUserInput(code, userInput) {
    if (!code) return '';
    if (!userInput || !code.includes(userInput)) return escapeHTML(code);
    return code.split(userInput).map(escapeHTML).join(`<mark class="user-input-mark">${escapeHTML(userInput)}</mark>`);
  }

  // Triage decisions keyed by warning fingerprint. `storage` is a Web Storage
  // object (localStorage) or null for an in-memory store (sample report, tests,
  // private browsing). Storage failures never break the dashboard.
  function createTriageStore(storage, storageKey) {
    let entries = {};

    if (storage) {
      try {
        const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
        if (isPlainObject(parsed) && parsed.version === 1 && isPlainObject(parsed.entries)) {
          Object.keys(parsed.entries).forEach(key => {
            const entry = parsed.entries[key];
            if (isPlainObject(entry) && Object.prototype.hasOwnProperty.call(TRIAGE_STATUSES, entry.status)) {
              entries[key] = {
                status: entry.status,
                note: typeof entry.note === 'string' ? entry.note : '',
                severity: Object.prototype.hasOwnProperty.call(SEVERITIES, entry.severity) ? entry.severity : ''
              };
            }
          });
        }
      } catch {
        entries = {};
      }
    }

    function persist() {
      if (!storage) return true;
      // Fallback keys embed file paths and code: those decisions stay in memory so
      // that nothing from the report itself is ever written to the browser storage
      const persisted = {};
      Object.keys(entries).forEach(key => {
        if (!key.startsWith(FALLBACK_KEY_PREFIX)) persisted[key] = entries[key];
      });
      try {
        if (Object.keys(persisted).length === 0) {
          storage.removeItem(storageKey);
        } else {
          storage.setItem(storageKey, JSON.stringify({ version: 1, entries: persisted }));
        }
        return true;
      } catch {
        return false;
      }
    }

    return {
      persistent: Boolean(storage),
      get(key) {
        return Object.prototype.hasOwnProperty.call(entries, key)
          ? { ...entries[key] }
          : { status: 'untriaged', note: '', severity: '' };
      },
      // Returns false when the decision could not be saved (storage full or blocked)
      set(key, update) {
        const next = { ...this.get(key), ...update };
        if (!Object.prototype.hasOwnProperty.call(TRIAGE_STATUSES, next.status)) next.status = 'untriaged';
        next.note = typeof next.note === 'string' ? next.note : '';
        if (!Object.prototype.hasOwnProperty.call(SEVERITIES, next.severity)) next.severity = '';
        if (next.status === 'untriaged' && !next.note.trim() && !next.severity) {
          delete entries[key];
        } else {
          entries[key] = next;
        }
        return persist();
      },
      // Drops the decisions of the given keys, e.g. warnings that are now in
      // config/brakeman.ignore: their triage is over. Returns how many were dropped.
      forget(keys) {
        let dropped = 0;
        keys.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(entries, key)) {
            delete entries[key];
            dropped++;
          }
        });
        if (dropped > 0) persist();
        return dropped;
      },
      clear() {
        entries = {};
        return persist();
      }
    };
  }

  function ignoreNote(entry) {
    const label = TRIAGE_STATUSES[entry.status].label;
    const note = entry.note.trim();
    return note ? `${label}: ${note}` : label;
  }

  // Reads an existing config/brakeman.ignore. Returns null when the content is
  // not an ignore file, otherwise its entries that carry a fingerprint.
  function parseIgnoreFile(parsed) {
    if (!isPlainObject(parsed) || !Array.isArray(parsed.ignored_warnings)) return null;
    // A scan report also has an ignored_warnings array, but never the notes
    if (Array.isArray(parsed.warnings) || isPlainObject(parsed.scan_info)) return null;
    return parsed.ignored_warnings.filter(entry => isPlainObject(entry) && typeof entry.fingerprint === 'string' && entry.fingerprint);
  }

  // Brakeman's JSON report never includes the notes written in brakeman.ignore:
  // they only live in the ignore file itself. Returns how many notes were applied.
  function applyIgnoreNotes(warnings, ignoreEntries) {
    const notes = new Map(ignoreEntries.map(entry => [entry.fingerprint, toText(entry.note, '')]));
    let applied = 0;
    warnings.forEach(w => {
      if (w.is_ignored && notes.has(w.fingerprint)) {
        w.note = notes.get(w.fingerprint);
        applied++;
      }
    });
    return applied;
  }

  // Builds the content of config/brakeman.ignore so it can replace the existing
  // file without losing anything:
  // - every entry of the existing ignore file, when one was loaded, is kept as is
  //   (including entries Brakeman reports as obsolete, pruning is left to Brakeman);
  // - warnings already ignored in the report are kept; without the existing ignore
  //   file their note is unknown, which `missingNotes` reports;
  // - active warnings triaged as false positive or accepted risk are added.
  // Warnings without fingerprint are skipped, Brakeman cannot match them.
  function buildIgnoreFile(warnings, getTriage, brakemanVersion, existingEntries) {
    const byFingerprint = new Map();
    let skipped = 0;
    let added = 0;
    let missingNotes = 0;

    (existingEntries || []).forEach(entry => {
      if (!byFingerprint.has(entry.fingerprint)) byFingerprint.set(entry.fingerprint, entry);
    });

    warnings.forEach(w => {
      if (w.diff === 'fixed') return;

      let note;
      if (w.is_ignored) {
        note = w.note;
      } else {
        const entry = getTriage(w.key);
        if (!TRIAGE_STATUSES[entry.status].ignorable) return;
        note = ignoreNote(entry);
      }

      if (!w.fingerprint) {
        skipped++;
        return;
      }
      if (byFingerprint.has(w.fingerprint)) return;

      const entry = {};
      IGNORE_FILE_KEYS.forEach(key => {
        entry[key] = w.raw[key] !== undefined ? w.raw[key] : null;
      });
      entry.note = note;
      byFingerprint.set(w.fingerprint, entry);
      if (w.is_ignored) {
        missingNotes++;
      } else {
        added++;
      }
    });

    // Same order as Brakeman, which keeps diffs of the versioned file small
    const ignored = Array.from(byFingerprint.values()).sort((a, b) => {
      if (a.fingerprint !== b.fingerprint) return a.fingerprint < b.fingerprint ? -1 : 1;
      return (Number(a.line) || 0) - (Number(b.line) || 0);
    });

    const file = { ignored_warnings: ignored };
    if (brakemanVersion) file.brakeman_version = String(brakemanVersion);

    return { file, count: ignored.length, added, skipped, missingNotes };
  }

  function serializeIgnoreFile(file) {
    return JSON.stringify(file, null, 2) + '\n';
  }

  // Brakeman writes Ruby Time#to_s ("2026-09-24 07:29:36 +0000"), which only some
  // browsers parse: rewrite it as ISO 8601 first. Returns a Date or null.
  function parseReportDate(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const ruby = value.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
    const date = new Date(ruby ? `${ruby[1]}T${ruby[2]}${ruby[3]}:${ruby[4]}` : value);
    return isNaN(date.getTime()) ? null : date;
  }

  return {
    TRIAGE_STATUSES,
    SEVERITIES,
    FILTER_DEFAULTS,
    escapeHTML,
    isBrakemanReport,
    safeExternalUrl,
    formatLocation,
    cweInfo,
    warningKey,
    normalizeWarning,
    normalizeReport,
    calculateSecurityScore,
    compareReports,
    matchesFilters,
    folderOf,
    sortWarnings,
    buildCodeLink,
    serializeFilters,
    parseFilters,
    highlightUserInput,
    createTriageStore,
    parseIgnoreFile,
    applyIgnoreNotes,
    buildIgnoreFile,
    serializeIgnoreFile,
    parseReportDate
  };
});
