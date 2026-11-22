/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner resolves its Playwright tools via NODE_PATH (CommonJS only). */
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

if (!process.env.B4_WEB_ORIGIN || !process.env.B4_ARTIFACTS) {
  throw new Error('Use the disposable B4 run.sh runner.');
}
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.cjs',
  outputDir: path.join(process.env.B4_ARTIFACTS, 'test-results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(process.env.B4_ARTIFACTS, 'report') }]],
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.B4_WEB_ORIGIN,
    browserName: 'chromium',
    ...(process.env.B4_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.B4_CHROMIUM_EXECUTABLE } } : {}),
    locale: 'en-US',
    timezoneId: 'Africa/Cairo',
    viewport: { width: 1365, height: 900 },
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
