/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const { SCENARIOS, APPEARANCES, NAMES, ARIA, openMenu, measure } = require('./helpers.cjs');

const EXCLUSIVE_ATTR = { verde: 'data-verde-theme', sherbiny: 'data-s-theme', makkboz: 'data-m-theme', meatlovers: 'data-ml-theme' };
const APPEARANCE = { signature: 'dark', night: 'dark', dark: 'dark', paper: 'light', light: 'light' };

async function showStepper(page, lang) {
  const name = NAMES[lang].simple;
  const more = page.getByRole('button', { name: ARIA[lang].more(name), exact: true }).first();
  // Dev server streams HTML before hydration; retry until the client handles the tap.
  await expect(async () => {
    if (!(await more.isVisible())) await page.getByRole('button', { name: ARIA[lang].add(name), exact: true }).first().click({ timeout: 2000 });
    await expect(more).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30000 });
  return more;
}
async function selectAppearance(page, scenario, appearance) {
  if (!EXCLUSIVE_ATTR[scenario]) return;
  const root = page.locator(`[${EXCLUSIVE_ATTR[scenario]}]`).first();
  const current = async () => APPEARANCE[await root.getAttribute(EXCLUSIVE_ATTR[scenario])];
  if (await current() !== appearance) {
    await page.getByRole('button', { name: /^(Dark|Light) mode$/ }).first().click();
    await expect.poll(current).toBe(appearance);
  }
}
async function assertContrast(locator, context, minimum = 4.5) {
  const value = await measure(locator);
  expect(value.ratio, `${context}: ${value.fg} on ${value.bg}`).toBeGreaterThanOrEqual(minimum);
}

for (const scenario of SCENARIOS) {
  for (const appearance of APPEARANCES) {
    test(`quantity ${scenario} ${appearance}`, async ({ page, context, baseURL }) => {
      await openMenu(page, context, baseURL, scenario, 'en', appearance);
      await selectAppearance(page, scenario, appearance);
      const more = await showStepper(page, 'en');
      const shell = more.locator('xpath=..');
      const count = shell.locator('[aria-live="polite"]');
      await expect(count).toHaveText('1');
      await assertContrast(count, `${scenario}/${appearance} count 1`);
      for (let i = 0; i < 11; i++) await more.click();
      await expect(count).toHaveText('12');
      await assertContrast(count, `${scenario}/${appearance} count 12`);
      const less = page.getByRole('button', { name: ARIA.en.less(NAMES.en.simple), exact: true }).first();
      await less.click();
      await expect(count).toHaveText('11');
      // Verify the rendered hover foreground against its actual background, including the list-specific override.
      for (const button of [more, less]) {
        await button.hover();
        await assertContrast(button, `${scenario}/${appearance} hovered button`, 3);
      }
      await page.getByRole('button', { name: /^View order/ }).click();
      const cartMore = page.getByRole('button', { name: ARIA.en.more(NAMES.en.simple), exact: true }).last();
      await expect(cartMore).toBeVisible();
      const cartCount = cartMore.locator('xpath=..').locator('[aria-live="polite"]');
      await expect(cartCount).toHaveText('11');
      await assertContrast(cartCount, `${scenario}/${appearance} cart count`);
      await cartMore.click();
      await expect(cartCount).toHaveText('12');
    });
  }
}

for (const lang of ['en', 'ar']) {
  for (const width of [320, 390, 768, 1280]) {
    test(`responsive quantity and contact ${lang} ${width}`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width, height: 850 });
      await openMenu(page, context, baseURL, 'floating', lang, 'light');
      const more = await showStepper(page, lang);
      const count = more.locator('xpath=..').locator('[aria-live="polite"]');
      for (let i = 0; i < 9; i++) await more.click();
      await expect(count).toHaveText('10');
      await assertContrast(count, `floating/${lang}/${width}`);
      const box = await count.boundingBox();
      expect(box.width).toBeGreaterThan(12);
      const section = page.locator('section[aria-labelledby="guest-contact-heading"]');
      const instagram = section.locator('a[href="https://www.instagram.com/wayta.test"]');
      await expect(instagram).toHaveAttribute('aria-label', 'Instagram');
      await expect(instagram).toHaveText('');
      await expect(instagram).toHaveAttribute('target', '_blank');
      const rect = await instagram.boundingBox();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    });
  }
}
