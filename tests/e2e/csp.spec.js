// Loads every page of the built site under the Content-Security-Policy that
// Cloudflare serves from _site/_headers (written by _plugins/security_headers.rb).
// The test server ignores _headers, so the policy is added to each response here.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SITE_DIR = process.env.SITE_DIR || '_site';

function readHeaders() {
  const lines = fs.readFileSync(path.join(SITE_DIR, '_headers'), 'utf8').split('\n');
  return Object.fromEntries(
    lines.filter(line => /^\s+\S+:/.test(line)).map(line => {
      const [name, ...value] = line.trim().split(':');
      return [name, value.join(':').trim()];
    })
  );
}

function directiveSources(csp, name) {
  const directive = csp.split(';').map(d => d.trim().split(/\s+/)).find(([n]) => n === name);
  return directive ? directive.slice(1) : [];
}

// "brakeman-visualizer/index.html" is served at /brakeman-visualizer/
function htmlPages(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return htmlPages(dir, relative);
    if (!entry.name.endsWith('.html')) return [];
    return [`/${relative.replace(/(^|\/)index\.html$/, '$1')}`];
  });
}

const headers = readHeaders();
const csp = headers['Content-Security-Policy'];

test('_headers sets the security headers', () => {
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d+/);
  expect(headers['X-Content-Type-Options']).toBe('nosniff');
  expect(headers['X-Frame-Options']).toBe('DENY');
  expect(headers['Referrer-Policy']).toBeTruthy();
  expect(headers['Permissions-Policy']).toBeTruthy();
});

for (const pagePath of htmlPages(SITE_DIR)) {
  test(`${pagePath} runs without CSP violations`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const violations = [];
    page.on('console', message => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });

    // Third-party requests are blocked (no network in CI): their origins are
    // checked against the policy below instead
    await page.route('**/*', async route => {
      if (!route.request().url().startsWith(origin)) return route.abort();
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });

    await page.goto(pagePath);
    await page.waitForLoadState('load');
    expect(violations).toEqual([]);

    const external = await page.evaluate(() => ({
      'script-src': [...document.querySelectorAll('script[src]')].map(el => el.src),
      'style-src': [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => el.href)
    }));
    for (const [directive, urls] of Object.entries(external)) {
      for (const url of urls) {
        const urlOrigin = new URL(url).origin;
        const allowed = urlOrigin === origin ? "'self'" : urlOrigin;
        expect(directiveSources(csp, directive), `${url} allowed by ${directive}`).toContain(allowed);
      }
    }
  });
}
