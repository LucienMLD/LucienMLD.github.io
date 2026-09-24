// Browser tests of the Brakeman Report Visualizer (tests/e2e), run against the
// built site. CI builds it with Jekyll then serves _site; locally:
//   bundle exec jekyll build && npm run test:e2e
const { defineConfig, devices } = require('@playwright/test');

const port = Number(process.env.PORT || 4173);

module.exports = defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory ${process.env.SITE_DIR || '_site'}`,
    url: `http://127.0.0.1:${port}/brakeman-visualizer/`,
    reuseExistingServer: !process.env.CI,
    // http.server logs every request on stderr
    stderr: 'ignore'
  }
});
