/* eslint-disable @typescript-eslint/no-require-imports -- The runner resolves Playwright via NODE_PATH (CommonJS only). */
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

if (!process.env.K2_WEB_ORIGIN || !process.env.K2_ARTIFACTS) {
  throw new Error('Use apps/web/e2e/kitchen-k3/run.sh.');
}
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.cjs',
  outputDir: path.join(process.env.K2_ARTIFACTS, 'test-results'),
  reporter: [['list']],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.K2_WEB_ORIGIN,
    browserName: 'chromium',
    ...(process.env.K2_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.K2_CHROMIUM_EXECUTABLE } } : {}),
    locale: 'en-US',
    timezoneId: 'Africa/Cairo',
    // A phone by default: K3 is the mobile layout. Desktop checks set their own viewport.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
});
