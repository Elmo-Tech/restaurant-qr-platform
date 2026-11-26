/* eslint-disable @typescript-eslint/no-require-imports -- The runner resolves Playwright via NODE_PATH (CommonJS only). */
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

if (!process.env.GH_WEB_ORIGIN || !process.env.GH_ARTIFACTS) {
  throw new Error('Use apps/web/e2e/guest-menu-hotfix/run.sh.');
}
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.cjs',
  outputDir: path.join(process.env.GH_ARTIFACTS, 'test-results'),
  reporter: [['list']],
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.GH_WEB_ORIGIN,
    browserName: 'chromium',
    ...(process.env.GH_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.GH_CHROMIUM_EXECUTABLE } } : {}),
    timezoneId: 'Africa/Cairo',
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
});
