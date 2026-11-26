/* eslint-disable @typescript-eslint/no-require-imports -- Playwright runs these files as CommonJS. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { test } = require('@playwright/test');
const { createStub, RESTAURANT_ID } = require('../kitchen-k2/stub-api.cjs');
const { boardTickets } = require('../kitchen-k2/scenario.cjs');

// Screenshots only. Set K2_SHOT_DIR (and K2_LABEL) to choose where they go. Viewport captures, not full-page ones:
// the fixed bottom navigation would be stamped into the middle of a full-page capture.
const shotDir = process.env.K2_SHOT_DIR;
const label = process.env.K2_LABEL || 'k3';
const API_PORT = Number(process.env.K2_API_PORT);
const WIDTHS = [360, 390, 430];

test.describe.configure({ mode: 'serial' });
test.skip(!shotDir, 'K2_SHOT_DIR is not set');

for (const locale of ['en', 'ar']) {
  for (const width of WIDTHS) {
    test(`screenshots ${label} ${locale} ${width}px`, async ({ browser }) => {
      fs.mkdirSync(shotDir, { recursive: true });
      const stub = createStub({ tickets: boardTickets(locale) });
      await stub.listen(API_PORT);
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        locale: locale === 'ar' ? 'ar-EG' : 'en-US',
        timezoneId: 'Africa/Cairo',
        reducedMotion: 'reduce',
        hasTouch: true,
      });
      await context.addCookies([{ name: 'staff_ui_locale', value: locale, url: process.env.K2_WEB_ORIGIN }]);
      const page = await context.newPage();
      const base = path.join(shotDir, `${label}-${locale}-${width}`);
      const settle = async () => {
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.evaluate(() => document.fonts.ready);
      };
      try {
        await page.goto(`/staff/restaurants/${RESTAURANT_ID}/kitchen`);
        await page.locator('article').first().waitFor();
        await settle();
        // 1. Tabs with counts and the ticket in focus, its action pinned above the bottom navigation.
        await page.screenshot({ path: `${base}-focus.png` });
        // 2. The compact list of the stage's other tickets.
        await page.locator('section[aria-label] h2').first().scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, 200));
        await page.screenshot({ path: `${base}-list.png` });
        await page.evaluate(() => window.scrollTo(0, 0));
        // 3. Another employee removed the focused ticket: the neighbour is shown, its action waits for "Continue".
        stub.state.tickets = stub.state.tickets.filter((entry) => entry.id !== 'b-late');
        await page.getByRole('button', { name: locale === 'ar' ? 'تحديث' : 'Refresh' }).click();
        await page.getByRole('tabpanel').locator('div.border-info').waitFor();
        await settle();
        await page.screenshot({ path: `${base}-notice.png` });
      } finally {
        await context.close();
        await stub.close();
      }
    });
  }
}
