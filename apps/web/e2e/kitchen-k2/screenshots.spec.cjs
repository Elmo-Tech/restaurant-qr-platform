/* eslint-disable @typescript-eslint/no-require-imports -- Playwright runs these files as CommonJS. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { test } = require('@playwright/test');
const { createStub, RESTAURANT_ID } = require('./stub-api.cjs');
const { boardTickets } = require('./scenario.cjs');

// Screenshots only. Set K2_SHOT_DIR (and K2_LABEL, e.g. before / after) to choose where they go.
const shotDir = process.env.K2_SHOT_DIR;
const label = process.env.K2_LABEL || 'run';
const API_PORT = Number(process.env.K2_API_PORT);

const VIEWPORTS = [
  { name: 'desktop', width: 1365, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

test.describe.configure({ mode: 'serial' });
test.skip(!shotDir, 'K2_SHOT_DIR is not set');

for (const locale of ['en', 'ar']) {
  for (const viewport of VIEWPORTS) {
    test(`screenshot ${label} ${locale} ${viewport.name}`, async ({ browser }) => {
      fs.mkdirSync(shotDir, { recursive: true });
      const stub = createStub({ tickets: boardTickets(locale) });
      await stub.listen(API_PORT);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: locale === 'ar' ? 'ar-EG' : 'en-US',
        timezoneId: 'Africa/Cairo',
        reducedMotion: 'reduce',
      });
      await context.addCookies([{ name: 'staff_ui_locale', value: locale, url: process.env.K2_WEB_ORIGIN }]);
      const page = await context.newPage();
      try {
        await page.goto(`/staff/restaurants/${RESTAURANT_ID}/kitchen`);
        await page.getByRole('heading', { level: 3 }).first().waitFor();
        // The Next.js dev-mode indicator is not part of the product UI.
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.evaluate(() => document.fonts.ready);
        const base = path.join(shotDir, `${label}-${locale}-${viewport.name}`);
        await page.screenshot({ path: `${base}-board.png`, fullPage: true });
        // A close-up of the busiest ticket (Dine-In, round 2, note, sizes, grouped options).
        const busy = page.locator('article', { hasText: locale === 'ar' ? 'بيتزا مارجريتا' : 'Margherita Pizza' }).first();
        await busy.screenshot({ path: `${base}-ticket.png` });
      } finally {
        await context.close();
        await stub.close();
      }
    });
  }
}
void RESTAURANT_ID;
