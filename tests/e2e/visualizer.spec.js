// Browser tests of the Brakeman Report Visualizer page, with an accessibility
// audit by axe-core. See playwright.config.js to run them.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');

const PAGE = '/brakeman-visualizer/';
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const fixture = name => path.join(FIXTURES, name);

const cards = page => page.locator('.warning-item:not(.hidden-by-filter)');
const cardTypes = page => cards(page).locator('.warning-type-badge').allTextContents();
const card = (page, type) => page.locator('.warning-item', { has: page.locator('.warning-type-badge', { hasText: type }) });

async function loadSample(page) {
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Load Sample Report' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
}

async function loadReport(page, name) {
  await page.locator('#file-input').setInputFiles(fixture(name));
  await expect(page.locator('#dashboard')).toBeVisible();
}

// WCAG 2.1 A and AA rules, on the visualizer only (the site theme is out of scope)
async function expectNoA11yViolations(page) {
  // Opened panels fade in (opacity 0 to 1): measuring contrast mid-animation
  // reports semi-transparent text, so wait for every animation to settle
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
  const results = await new AxeBuilder({ page })
    .include('.brakeman-visualizer')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  // Third-party requests (analytics, widgets, CDNs) are blocked: the tests cover
  // the visualizer only, and a report must never need the network anyway
  const origin = new URL(baseURL).origin;
  await page.route('**/*', route => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));

  // Only errors thrown by the visualizer count: theme scripts depending on a
  // blocked CDN (jQuery) fail on their own and are out of scope here
  const errors = [];
  page.on('pageerror', error => {
    if (/\/assets\/js\/brakeman(-core)?\.js/.test(error.stack || '')) errors.push(error.message);
  });
  page.errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test('sample report: compare with the sample baseline', async ({ page }) => {
  await loadSample(page);
  await expect(cards(page)).toHaveCount(6);
  await expect(card(page, 'Command Injection').locator('.status-note')).toContainText('deployment pipeline');

  await page.getByRole('button', { name: 'Use sample baseline' }).click();
  await expect(page.locator('#diff-new-count')).toHaveText('2');
  await expect(page.locator('#diff-fixed-count')).toHaveText('1');
  await expect(page.locator('#diff-unchanged-count')).toHaveText('4');
  await expect(page.getByRole('button', { name: 'Show new warnings' })).toBeFocused();

  await page.getByRole('button', { name: 'Show new warnings' }).click();
  expect((await cardTypes(page)).sort()).toEqual(['Dynamic Render Path', 'Remote Code Execution']);

  await page.getByLabel('Changes').selectOption('fixed');
  expect(await cardTypes(page)).toEqual(['Redirect']);
});

test('triage: status, severity, score and brakeman.ignore export', async ({ page }) => {
  await loadSample(page);
  // 2 High (-10), 2 Medium (-4) and 1 Weak (-1) active warnings
  await expect(page.locator('#score-percent')).toHaveText('71%');

  const sql = card(page, 'SQL Injection');
  await sql.locator('.warning-summary-row').click();
  await expect(sql.locator('.warning-facts')).toContainText('OrdersController#index');
  await expect(sql.locator('.warning-facts')).toContainText('A05:2025 Injection');
  await expect(sql.locator('mark.user-input-mark')).toHaveText('params[:status]');

  await sql.getByLabel('Status').selectOption('false_positive');
  await sql.getByLabel('Note').fill('status is validated by an enum');
  await expect(sql.locator('.badge-triage')).toHaveText('False positive');
  await expect(page.locator('#triage-progress-text')).toHaveText('1 of 5 active warnings triaged');
  // The false positive (High confidence, -10) is no longer scored
  await expect(page.locator('#score-percent')).toHaveText('81%');
  await expect(page.locator('#val-score-note')).toHaveText('1 ignored · 1 false positive not scored');

  const rce = card(page, 'Remote Code Execution');
  await rce.locator('.warning-summary-row').click();
  await rce.getByLabel('Severity').selectOption('critical');
  await expect(rce.locator('.badge-severity')).toHaveText('Severity: Critical');
  // Critical (-15) replaces the High confidence (-10)
  await expect(page.locator('#score-percent')).toHaveText('76%');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export brakeman.ignore' }).click()
  ]);
  expect(download.suggestedFilename()).toBe('brakeman.ignore');
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(exported.ignored_warnings.map(w => w.note)).toEqual(expect.arrayContaining([
    'False positive: status is validated by an enum',
    expect.stringContaining('deployment pipeline')
  ]));
});

test('real reports: baseline, notes from brakeman.ignore and triage persistence', async ({ page }) => {
  await page.goto(PAGE);
  await loadReport(page, 'ignored-report.json');
  await expect(page.locator('#export-hint')).toContainText('do not include ignore notes');

  await page.locator('#baseline-input').setInputFiles(fixture('baseline-report.json'));
  await expect(page.locator('#diff-new-count')).toHaveText('1');
  await expect(page.locator('#diff-fixed-count')).toHaveText('1');

  await page.locator('#ignore-input').setInputFiles(fixture('brakeman.ignore'));
  await expect(card(page, 'Cross-Site Request Forgery').locator('.status-note')).toContainText('API only');

  await page.getByRole('button', { name: 'Remove baseline' }).click();
  await page.locator('#baseline-input').setInputFiles(fixture('brakeman.ignore'));
  await expect(page.locator('#compare-error')).toContainText('brakeman.ignore file');

  const redirect = card(page, 'Redirect');
  await redirect.locator('.warning-summary-row').click();
  await redirect.getByLabel('Status').selectOption('to_fix');

  await page.reload();
  await loadReport(page, 'current-report.json');
  const reloaded = card(page, 'Redirect');
  await reloaded.locator('.warning-summary-row').click();
  await expect(reloaded.getByLabel('Status')).toHaveValue('to_fix');
});

test('triage decisions are forgotten once the warning is in brakeman.ignore', async ({ page }) => {
  await page.goto(PAGE);
  await loadReport(page, 'current-report.json');
  const csrf = card(page, 'Cross-Site Request Forgery');
  await csrf.locator('.warning-summary-row').click();
  await csrf.getByLabel('Status').selectOption('false_positive');
  expect(await page.evaluate(() => localStorage.getItem('brakeman-visualizer.triage.v1'))).toContain('6f5239fb');

  // Same app scanned after the export: the CSRF warning is now ignored
  await page.getByRole('button', { name: 'Upload Another Report' }).click();
  await loadReport(page, 'ignored-report.json');
  expect(await page.evaluate(() => localStorage.getItem('brakeman-visualizer.triage.v1'))).toBeNull();
});

test('filters by type and folder, sort, and filters kept in the address', async ({ page }) => {
  await page.goto(PAGE);
  await loadReport(page, 'current-report.json');

  await page.getByLabel('Folder').selectOption('app/views');
  expect(await cardTypes(page)).toEqual(['Cross-Site Scripting']);
  await page.getByLabel('Folder').selectOption('all');

  await page.getByLabel('Type', { exact: true }).selectOption('Command Injection');
  expect(await cardTypes(page)).toEqual(['Command Injection']);
  await page.getByLabel('Type', { exact: true }).selectOption('all');

  await page.getByLabel('Sort by').selectOption('file');
  const files = await cards(page).locator('.warning-location').allTextContents();
  expect(files[0]).toContain('app/controllers/application_controller.rb');
  expect(files[files.length - 1]).toContain('Gemfile.lock');

  await page.getByLabel('Folder').selectOption('app/controllers');
  await expect(page).toHaveURL(/#folder=app%2Fcontrollers&sort=file$/);

  // Reloading the same report restores the view from the address
  await page.reload();
  await loadReport(page, 'current-report.json');
  await expect(page.getByLabel('Folder')).toHaveValue('app/controllers');
  await expect(page.getByLabel('Sort by')).toHaveValue('file');
  await expect(cards(page)).toHaveCount(4);
});

test('links to the code in VS Code or on the repository', async ({ page }) => {
  await page.goto(PAGE);
  await loadReport(page, 'current-report.json');
  const redirect = card(page, 'Redirect');
  await redirect.locator('.warning-summary-row').click();
  await expect(redirect.locator('.warning-facts')).not.toContainText('Source');

  await page.getByLabel('Open files in').selectOption('vscode');
  // Pre-filled with the scan's app_path
  await expect(page.getByLabel('Project path on this computer')).toHaveValue('/home/dev/apps/demo');
  const link = card(page, 'Redirect').getByRole('link', { name: /Open in VS Code/ });
  await expect(link).toHaveAttribute('href', 'vscode://file/home/dev/apps/demo/app/controllers/users_controller.rb:7');

  await page.getByLabel('Open files in').selectOption('web');
  await page.getByLabel('Repository URL for files').fill('https://github.com/acme/demo/blob/main');
  await page.getByLabel('Repository URL for files').press('Enter');
  await expect(card(page, 'Redirect').getByRole('link', { name: /View in repository/ }))
    .toHaveAttribute('href', 'https://github.com/acme/demo/blob/main/app/controllers/users_controller.rb#L7');

  await page.getByLabel('Repository URL for files').fill('javascript:alert(1)');
  await page.getByLabel('Repository URL for files').press('Enter');
  await expect(page.locator('#code-link-error')).toContainText('https://');
  await expect(page.locator('.warning-facts a[href^="javascript:"]')).toHaveCount(0);
});

test('J / K move between warnings when a warning title has focus', async ({ page }) => {
  await loadSample(page);
  const headers = page.locator('.warning-item:not(.hidden-by-filter) .warning-summary-row');
  await headers.nth(0).focus();
  await page.keyboard.press('j');
  await expect(headers.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(headers.nth(2)).toBeFocused();
  await page.keyboard.press('k');
  await expect(headers.nth(1)).toBeFocused();

  // Typing in the search field is never hijacked
  await page.getByLabel(/Search warnings/).fill('jk');
  await expect(page.getByLabel(/Search warnings/)).toHaveValue('jk');
});

test.describe('accessibility', () => {
  test('upload screen has no WCAG A/AA violations', async ({ page }) => {
    await page.goto(PAGE);
    await expectNoA11yViolations(page);
  });

  for (const theme of ['dark', 'light']) {
    test(`dashboard in ${theme} theme has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(PAGE);
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await page.getByRole('button', { name: 'Load Sample Report' }).click();
      await page.getByRole('button', { name: 'Use sample baseline' }).click();
      const sql = card(page, 'SQL Injection');
      await sql.locator('.warning-summary-row').click();
      await sql.getByLabel('Status').selectOption('to_fix');
      await sql.getByLabel('Severity').selectOption('critical');
      await page.getByLabel('Open files in').selectOption('vscode');
      await expectNoA11yViolations(page);
    });
  }

  test('nothing in the visualizer overflows at 320 px wide (reflow)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await loadSample(page);
    await page.getByRole('button', { name: 'Use sample baseline' }).click();
    await card(page, 'SQL Injection').locator('.warning-summary-row').click();

    // Elements sticking out of the viewport, unless an ancestor inside the
    // viewport clips or scrolls them (code blocks scroll horizontally by design)
    const offenders = await page.evaluate(() => {
      const limit = window.innerWidth + 1;
      const root = document.querySelector('.brakeman-visualizer');
      const isClipped = el => {
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX !== 'visible' && parent.getBoundingClientRect().right <= limit) return true;
        }
        return false;
      };
      return Array.from(root.querySelectorAll('*'))
        .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().right > limit && !isClipped(el))
        .map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')} right=${Math.round(el.getBoundingClientRect().right)}`)
        .slice(0, 10);
    });
    expect(offenders).toEqual([]);
  });
});
