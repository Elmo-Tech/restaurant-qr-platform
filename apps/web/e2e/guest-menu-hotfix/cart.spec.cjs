/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const { openMenu, ARIA, NAMES, measure } = require('./helpers.cjs');

test('shared product sheet quantity and cart preserve increments and removal', async ({ page, context, baseURL }) => {
  await openMenu(page, context, baseURL, 'classic', 'en', 'dark');
  // Next's development indicator overlays the bottom-sheet controls; it is absent in production.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const name = NAMES.en.burger;
  const add = page.getByRole('button', { name: ARIA.en.add(name), exact: true }).first();
  const more = page.getByRole('button', { name: ARIA.en.more(name), exact: true });
  await expect(async () => {
    if (!(await more.isVisible())) await add.click({ timeout: 2000 });
    await expect(more).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30000 });
  const count = more.locator('xpath=..').locator('[aria-live="polite"]');
  await expect(count).toHaveText('1');
  expect((await measure(count)).ratio).toBeGreaterThanOrEqual(4.5);
  await more.click();
  await expect(count).toHaveText('2');
  await page.getByRole('button', { name: /Add to order/ }).click();
  await page.getByRole('button', { name: /^View order/ }).click();
  const cartMore = page.getByRole('button', { name: ARIA.en.more(name), exact: true }).last();
  const cartCount = cartMore.locator('xpath=..').locator('[aria-live="polite"]');
  await expect(cartCount).toHaveText('2');
  expect((await measure(cartCount)).ratio).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: ARIA.en.less(name), exact: true }).last().click();
  await expect(cartCount).toHaveText('1');
  await page.getByRole('button', { name: ARIA.en.remove(name), exact: true }).last().click();
  await expect(cartMore).toHaveCount(0);
});

test('quantity stays capped at 99', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('qr-cart:classic', JSON.stringify([{ productId: '00000000-0000-4000-8000-000000000001', quantity: 99, modifierOptionIds: [] }]));
  });
  await page.goto('/q/classic?lang=en', { waitUntil: 'domcontentloaded' });
  const more = page.getByRole('button', { name: ARIA.en.more(NAMES.en.simple), exact: true }).first();
  const count = more.locator('xpath=..').locator('[aria-live="polite"]');
  await expect(count).toHaveText('99');
  await more.click();
  await expect(count).toHaveText('99');
  await page.getByRole('button', { name: ARIA.en.less(NAMES.en.simple), exact: true }).first().click();
  await expect(count).toHaveText('98');
});
