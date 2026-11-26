/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { ARIA, NAMES, openMenu } = require('./helpers.cjs');

test('Makkboz light cards comparison', async ({ page, context, baseURL }) => {
  test.skip(!process.env.GH_SHOT_DIR || !process.env.GH_LABEL, 'Set GH_SHOT_DIR and GH_LABEL to capture screenshots.');
  fs.mkdirSync(process.env.GH_SHOT_DIR, { recursive: true });
  await openMenu(page, context, baseURL, 'makkboz', 'en', 'light');
  const cards = page.locator('.m-view-switch button').first();
  await expect(async () => {
    if (await cards.getAttribute('aria-pressed') !== 'true') await cards.click();
    await expect(cards).toHaveAttribute('aria-pressed', 'true', { timeout: 1500 });
  }).toPass({ timeout: 30000 });
  const more = page.getByRole('button', { name: ARIA.en.more(NAMES.en.simple), exact: true }).first();
  await expect(async () => {
    if (!(await more.isVisible())) await page.getByRole('button', { name: ARIA.en.add(NAMES.en.simple), exact: true }).first().click();
    await expect(more).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30000 });
  await page.mouse.move(0, 0);
  await more.locator('xpath=ancestor::article[1]').screenshot({ path: path.join(process.env.GH_SHOT_DIR, `${process.env.GH_LABEL}-makkboz-light-cards.png`) });
});
