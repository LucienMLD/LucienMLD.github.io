// Checks the files and structured data that search engines and AI assistants
// read (robots.txt, sitemap.xml, llms.txt, llms-full.txt, security.txt, JSON-LD),
// on the site built by Jekyll. See playwright.config.js to run them.
const { test, expect } = require('@playwright/test');

const SITE_URL = 'https://lucien-mollard.com';
const toLocalPath = url => url.replace(SITE_URL, '') || '/';

// GitHub Pages serves /experiences/dinum from dinum.html, the test server does not
async function getPage(request, path) {
  const response = await request.get(path);
  if (response.status() === 404 && !path.endsWith('/') && !/\.[a-z]+$/.test(path)) {
    return request.get(`${path}.html`);
  }
  return response;
}

async function jsonLdNodes(page, path) {
  await page.goto(path);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  // JSON.parse throws on invalid JSON-LD, which fails the test with the page name
  return blocks.flatMap(block => {
    const data = JSON.parse(block);
    return data['@graph'] || [data];
  });
}

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await page.route('**/*', route => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
});

test('robots.txt allows search engines and AI assistants and points to the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  const robots = await response.text();

  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'GPTBot', 'ClaudeBot', 'Google-Extended']) {
    expect(robots).toContain(`User-agent: ${agent}`);
  }
  // Nothing blocks the whole site
  expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
});

test('sitemap.xml lists every public page, and only pages that exist', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const paths = urls.map(toLocalPath);
  for (const expected of ['/', '/experiences/', '/trainings/', '/press/', '/brakeman-visualizer/', '/contact/', '/experiences/dinum']) {
    expect(paths).toContain(expected);
  }
  for (const excluded of ['/404.html', '/thank-you/', '/robots.txt', '/llms.txt', '/press/les-echos-reconversion']) {
    expect(paths).not.toContain(excluded);
  }
  for (const url of urls) {
    expect(url.startsWith(`${SITE_URL}/`), url).toBe(true);
    expect((await getPage(request, toLocalPath(url))).status(), url).toBe(200);
  }
});

test('llms.txt follows the llms.txt format and its site links resolve', async ({ request }) => {
  const response = await request.get('/llms.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();
  const lines = text.split('\n');

  expect(lines[0]).toBe('# Lucien Mollard');
  expect(text).toMatch(/^> .{80,}$/m);
  for (const section of ['## Main pages', '## Professional experience', '## Education and training', '## In the media', '## Optional']) {
    expect(text).toContain(section);
  }

  const links = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match => match[1]);
  expect(links.length).toBeGreaterThan(20);
  for (const link of links.filter(url => url.startsWith(SITE_URL))) {
    expect((await getPage(request, toLocalPath(link))).status(), link).toBe(200);
  }
});

test('llms-full.txt holds the content of the site as Markdown, not HTML', async ({ request }) => {
  const response = await request.get('/llms-full.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();

  expect(text.startsWith('# Lucien Mollard: full profile')).toBe(true);
  for (const expected of ['## About', '## Professional experience', '### Lead developer, Conseillers-Entreprises.Service-Public.fr', '## Brakeman Report Visualizer']) {
    expect(text).toContain(expected);
  }
  expect(text).not.toMatch(/<(p|div|br|strong|h\d|ul|li)[\s>/]/);
});

test('security.txt has a contact and an expiry date in the future (RFC 9116)', async ({ request }) => {
  const response = await request.get('/.well-known/security.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();

  expect(text).toMatch(/^Contact: mailto:\S+@\S+$/m);
  const expires = new Date(text.match(/^Expires: (.+)$/m)[1]);
  expect(expires.getTime()).toBeGreaterThan(Date.now());
});

test('every page describes the same person in valid JSON-LD', async ({ page }) => {
  const personId = `${SITE_URL}/#person`;

  for (const path of ['/', '/experiences/', '/experiences/dinum.html', '/brakeman-visualizer/', '/contact/']) {
    const nodes = await jsonLdNodes(page, path);
    const people = nodes.filter(node => node['@type'] === 'Person');
    expect(people, path).toHaveLength(1);
    expect(people[0]['@id']).toBe(personId);
    expect(people[0].sameAs).toEqual(expect.arrayContaining([
      'https://www.linkedin.com/in/lucien-mollard/', 'https://github.com/LucienMLD'
    ]));
    expect(nodes.some(node => node['@type'] === 'WebSite'), path).toBe(true);

    if (path === '/') {
      const profile = nodes.find(node => node['@type'] === 'ProfilePage');
      expect(profile.mainEntity['@id']).toBe(personId);
    } else {
      const breadcrumb = nodes.find(node => node['@type'] === 'BreadcrumbList');
      expect(breadcrumb.itemListElement[0].name).toBe('Home');
    }
  }

  // The Brakeman page's own nodes point to the same person
  const visualizer = await jsonLdNodes(page, '/brakeman-visualizer/');
  expect(visualizer.find(node => node['@type'] === 'WebApplication').author['@id']).toBe(personId);
  expect(visualizer.some(node => node['@type'] === 'FAQPage')).toBe(true);
});

test('pages never repeat SEO meta tags', async ({ page }) => {
  for (const path of ['/', '/experiences/', '/brakeman-visualizer/']) {
    await page.goto(path);
    const head = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelectorAll('meta[name="description"]').length,
      canonical: document.querySelectorAll('link[rel="canonical"]').length,
      ogTitle: document.querySelectorAll('meta[property="og:title"]').length
    }));
    // Printed in the CI log: what the site theme puts in <head>
    console.log(`${path} head: ${JSON.stringify(head)}`);
    expect(head.description, path).toBeLessThanOrEqual(1);
    expect(head.canonical, path).toBeLessThanOrEqual(1);
    expect(head.ogTitle, path).toBeLessThanOrEqual(1);
  }

  // Kept out of results with noindex (not robots.txt, which would hide the tag)
  await page.goto('/thank-you/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
