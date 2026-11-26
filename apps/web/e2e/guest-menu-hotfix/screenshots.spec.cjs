/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { NAMES, ARIA, openMenu } = require('./helpers.cjs');

for (const lang of ['ar', 'en']) {
  test(`before/after ${lang}`, async ({ page, context, baseURL }) => {
    test.skip(!process.env.GH_SHOT_DIR || !process.env.GH_LABEL, 'Set GH_SHOT_DIR and GH_LABEL to capture screenshots.');
    fs.mkdirSync(process.env.GH_SHOT_DIR, { recursive: true });
    await openMenu(page, context, baseURL, 'floating', lang, 'light');
    const name = NAMES[lang].simple;
    const more = page.getByRole('button', { name: ARIA[lang].more(name), exact: true }).first();
    await expect(async () => {
      if (!(await more.isVisible())) await page.getByRole('button', { name: ARIA[lang].add(name), exact: true }).first().click({ timeout: 2000 });
      await expect(more).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30000 });
    for (let i = 0; i < 11; i++) await more.click();
    await page.mouse.move(0, 0);
    await more.locator('xpath=ancestor::article[1]').screenshot({ path: path.join(process.env.GH_SHOT_DIR, `${process.env.GH_LABEL}-${lang}-product.png`) });
    await page.locator('section[aria-labelledby="guest-contact-heading"]').screenshot({ path: path.join(process.env.GH_SHOT_DIR, `${process.env.GH_LABEL}-${lang}-contact.png`) });
    await openMenu(page, context, baseURL, 'makkboz', lang, 'dark');
    const makkMore = page.getByRole('button', { name: ARIA[lang].more(name), exact: true }).first();
    await expect(async () => {
      if (!(await makkMore.isVisible())) await page.getByRole('button', { name: ARIA[lang].add(name), exact: true }).first().click({ timeout: 2000 });
      await expect(makkMore).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30000 });
    await makkMore.hover();
    await makkMore.locator('xpath=..').screenshot({ path: path.join(process.env.GH_SHOT_DIR, `${process.env.GH_LABEL}-${lang}-hover.png`) });
  });
}
