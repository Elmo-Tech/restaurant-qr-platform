/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Playwright fixture. */
const { test, expect } = require('@playwright/test');
const { openMenu } = require('./helpers.cjs');

for (const scenario of ['classic', 'floating', 'verde', 'sherbiny', 'makkboz', 'meatlovers']) {
  for (const lang of ['en', 'ar']) {
    test(`icon links ${scenario} ${lang}`, async ({ page, context, baseURL }) => {
      await openMenu(page, context, baseURL, scenario, lang, 'light');
      const links = page.locator('a[href="https://www.instagram.com/wayta.test"]');
      expect(await links.count()).toBeGreaterThan(0);
      for (const link of await links.all()) {
        await expect(link).toHaveAttribute('aria-label', 'Instagram');
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).toHaveText('');
        await expect(link.locator('svg')).toHaveCount(1);
        const rect = await link.boundingBox();
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
      const phone = page.locator('a[href="tel:+201001234567"]');
      expect(await phone.count()).toBeGreaterThan(0);
      if (scenario === 'floating') {
        const contact = page.locator('ul[aria-label]').filter({ has: page.locator('a[href="https://maps.google.com/?q=wayta"]') });
        expect(await contact.count()).toBeGreaterThan(0);
        const location = contact.first().locator('a[href="https://maps.google.com/?q=wayta"]');
        await expect(location).toHaveText('');
        await expect(location).toHaveAttribute('aria-label', lang === 'ar' ? 'الموقع' : 'Location');
      }
    });
  }
}

test('empty contact fields do not render links', async ({ page, context, baseURL }) => {
  await openMenu(page, context, baseURL, 'classic+nocontact', 'en', 'dark');
  await expect(page.locator('section[aria-labelledby="guest-contact-heading"]')).toHaveCount(0);
  await expect(page.locator('a[href="https://www.instagram.com/wayta.test"]')).toHaveCount(0);
});
