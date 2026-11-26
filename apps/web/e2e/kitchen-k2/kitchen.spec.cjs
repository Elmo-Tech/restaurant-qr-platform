/* eslint-disable @typescript-eslint/no-require-imports -- Playwright runs these files as CommonJS. */
'use strict';
const { test, expect } = require('@playwright/test');
const { createStub, ticket, RESTAURANT_ID, BRANCH_MAIN, BRANCH_OTHER } = require('./stub-api.cjs');
const { boardTickets } = require('./scenario.cjs');

const API_PORT = Number(process.env.K2_API_PORT);
const BOARD = `/staff/restaurants/${RESTAURANT_ID}/kitchen`;
const FOREIGN_BRANCH = { id: '77777777-7777-4777-8777-777777777777', name: 'Unauthorized Branch' };

test.describe.configure({ mode: 'serial' });

let stub;
test.afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
});

async function open(page, context, { locale = 'en', stubOptions = {} } = {}) {
  stub = createStub({ tickets: boardTickets(locale), ...stubOptions });
  await stub.listen(API_PORT);
  await context.addCookies([{ name: 'staff_ui_locale', value: locale, url: process.env.K2_WEB_ORIGIN }]);
  await page.addInitScript(() => { /* keep the dev indicator out of geometry checks */ });
  await page.goto(BOARD);
  await page.locator('article').first().waitFor();
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

const column = (page, name) => page.locator(`section[aria-label="${name}"]`);
const identities = (section) => section.locator('article h3').allInnerTexts();

test('each column lists the longest-waiting-in-stage ticket first, with a deterministic tie-break', async ({ page, context }) => {
  await open(page, context);
  // NEW: Table 7 (26 min), then the 12-minute tie by creation time (Table 3 was created before Omar K.), then Sara (3 min,
  // created long before but accepted last -- the API would have listed her first).
  expect(await identities(column(page, 'New'))).toEqual(['Table 7', 'Table 3', 'Omar K.', 'Sara']);
  expect(await identities(column(page, 'Preparing'))).toEqual(['Table 12', 'Omar K.']);
  expect(await identities(column(page, 'Ready'))).toEqual(['Table 5']);
});

test('a refresh that returns the same data keeps the same order', async ({ page, context }) => {
  await open(page, context);
  const before = await identities(column(page, 'New'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  expect(await identities(column(page, 'New'))).toEqual(before);
});

test('delay is a word and an outline at the approved thresholds, and READY is never flagged', async ({ page, context }) => {
  await open(page, context);
  const card = (name) => page.locator('article', { has: page.getByRole('heading', { name, exact: true }) });
  const newCol = column(page, 'New');
  await expect(newCol.locator('article', { hasText: 'Table 7' }).getByText('Late', { exact: true })).toBeVisible(); // 26 min >= 20
  await expect(newCol.locator('article', { hasText: 'Table 3' }).getByText('Getting late', { exact: true })).toBeVisible(); // 12 min >= 10
  await expect(newCol.locator('article', { hasText: 'Sara' }).getByText(/late/i)).toHaveCount(0); // 3 min
  await expect(column(page, 'Preparing').locator('article', { hasText: 'Table 12' }).getByText('Late', { exact: true })).toBeVisible();
  await expect(column(page, 'Preparing').locator('article', { hasText: 'Omar K.' }).getByText(/late/i)).toHaveCount(0); // 6 min
  // READY waited 15 minutes and is still not "late": it is finished and only waits for service.
  await expect(column(page, 'Ready').getByText(/late/i)).toHaveCount(0);
  await expect(card('Table 7')).toHaveCSS('box-shadow', /rgb/); // outlined (ring), not only tinted text
});

test('READY means waiting for service: no serve action exists on the kitchen board', async ({ page, context }) => {
  await open(page, context);
  const ready = column(page, 'Ready').locator('article');
  await expect(ready.getByText('Waiting for service')).toBeVisible();
  await expect(ready.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /serve/i })).toHaveCount(0);
  await expect(page.getByText(/served/i)).toHaveCount(0);
});

test('modifiers appear under their own group name, sizes beside the product, quantities first', async ({ page, context }) => {
  await open(page, context);
  const table7 = column(page, 'New').locator('article', { hasText: 'Table 7' });
  await expect(table7.getByText('Round 2')).toBeVisible();
  await expect(table7.getByText('Dine in', { exact: true })).toBeVisible();
  await expect(table7.getByText('Allergy: no sesame')).toBeVisible();
  const pizza = table7.locator('li', { hasText: 'Margherita Pizza' }).first();
  await expect(pizza.getByText('Large')).toBeVisible();
  expect(await pizza.getByRole('list', { name: 'Extras' }).getByRole('listitem').allInnerTexts()).toEqual(['Extra cheese', 'Mushrooms']);
  expect(await pizza.getByRole('list', { name: 'Remove' }).getByRole('listitem').allInnerTexts()).toEqual(['No onions']);
  await expect(pizza.getByText('Quantity 2')).toBeAttached();
});

test('Arabic is right-to-left: identity on the right, timer on the left; English is the mirror', async ({ page, context }) => {
  await open(page, context, { locale: 'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const arCard = column(page, 'جديد').locator('article').first();
  const arIdentity = await arCard.locator('h3').boundingBox();
  const arTimer = await arCard.locator('time').boundingBox();
  expect(arIdentity.x).toBeGreaterThan(arTimer.x);
  await expect(arCard.getByText('متأخر', { exact: true })).toBeVisible();
  const group = arCard.locator('ul[aria-label="الإضافات"]');
  expect(await group.getByRole('listitem').allInnerTexts()).toEqual(['جبنة زيادة', 'مشروم']);
  // The page never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await stub.close();
  stub = null;

  await open(page, context, { locale: 'en' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const enCard = column(page, 'New').locator('article').first();
  const enIdentity = await enCard.locator('h3').boundingBox();
  const enTimer = await enCard.locator('time').boundingBox();
  expect(enIdentity.x).toBeLessThan(enTimer.x);
});

test('every control on the board is at least 44px tall, on a phone and on a desktop', async ({ page, context }) => {
  await open(page, context);
  for (const size of [{ width: 390, height: 844 }, { width: 1365, height: 900 }]) {
    await page.setViewportSize(size);
    const buttons = page.locator('main button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(4);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box.height, `${await button.innerText()} at ${size.width}px`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('on a phone the three stages are tabs and only one column is shown', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, context);
  await expect(column(page, 'New')).toBeVisible();
  await expect(column(page, 'Preparing')).toBeHidden();
  await page.getByRole('group', { name: 'Board column' }).getByRole('button', { name: /Preparing/ }).click();
  await expect(column(page, 'Preparing')).toBeVisible();
  expect(await identities(column(page, 'Preparing'))).toEqual(['Table 12', 'Omar K.']);
});

test('a read-only account sees every ticket but no enabled action, and sends nothing', async ({ page, context }) => {
  await open(page, context, { stubOptions: { permissions: ['kitchen.view', 'orders.view'] } });
  await expect(page.getByText('You can view the board but not change orders.')).toBeVisible();
  const actions = page.getByRole('button', { name: /Start preparing|Mark ready/ });
  const total = await actions.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) await expect(actions.nth(index)).toBeDisabled();
  expect(stub.state.patchCalls).toEqual([]);
});

test('starting a ticket sends one guarded request and moves it forward; no SERVED is ever requested', async ({ page, context }) => {
  await open(page, context);
  const sara = column(page, 'New').locator('article', { hasText: 'Sara' });
  await sara.getByRole('button', { name: 'Start preparing' }).dblclick();
  await expect(column(page, 'Preparing').locator('article', { hasText: 'Sara' })).toBeVisible();
  await column(page, 'Preparing').locator('article', { hasText: 'Sara' }).getByRole('button', { name: 'Mark ready' }).click();
  await expect(column(page, 'Ready').locator('article', { hasText: 'Sara' })).toBeVisible();
  expect(stub.state.patchCalls.map(({ expectedStatus, status }) => `${expectedStatus}>${status}`)).toEqual([
    'ACCEPTED>PREPARING',
    'PREPARING>READY',
  ]);
  // The moved ticket restarted its own stage timer, so it is now the freshest one in READY (the board sorts longest-first).
  expect(await identities(column(page, 'Ready'))).toEqual(['Table 5', 'Sara']);
});

test('K1 recovery is intact: a refused move is reconciled against a fresh read, never retried', async ({ page, context }) => {
  await open(page, context, {
    stubOptions: { patch: () => ({ status: 409, body: { error: { code: 'ORDER_STATUS_CHANGED', message: 'Changed' } } }) },
  });
  const sara = column(page, 'New').locator('article', { hasText: 'Sara' });
  const listReadsBefore = stub.state.listCalls.length;
  await sara.getByRole('button', { name: 'Start preparing' }).click();
  // The fresh read (started after the refusal) answers for the ticket: still NEW on the server, so it says why.
  await expect(sara.getByRole('status')).toContainText('Someone else updated this order');
  await expect(sara.getByRole('button', { name: 'Start preparing' })).toBeEnabled();
  expect(stub.state.patchCalls).toHaveLength(1); // the change itself was not retried
  expect(stub.state.patchCalls[0]).toMatchObject({ expectedStatus: 'ACCEPTED', status: 'PREPARING' });
  expect(stub.state.listCalls.length).toBeGreaterThan(listReadsBefore);
});

test('branch isolation: only authorized branches, one at a time, never mixed', async ({ page, context }) => {
  const tickets = [
    ticket({ id: 'main-1', status: 'ACCEPTED', table: { id: 'tm', tableNumber: 'M1' }, stageMinutes: 5, items: [{ name: 'Soup', variantName: null, quantity: 1, modifiers: [] }] }),
    ticket({ id: 'other-1', status: 'ACCEPTED', table: { id: 'to', tableNumber: 'G1' }, stageMinutes: 8, branch: BRANCH_OTHER, items: [{ name: 'Tea', variantName: null, quantity: 1, modifiers: [] }] }),
    ticket({ id: 'secret-1', status: 'ACCEPTED', table: { id: 'ts', tableNumber: 'X9' }, stageMinutes: 30, branch: FOREIGN_BRANCH, items: [{ name: 'Secret', variantName: null, quantity: 1, modifiers: [] }] }),
  ];
  await open(page, context, { stubOptions: { branches: [BRANCH_MAIN, BRANCH_OTHER], tickets } });
  expect(await identities(column(page, 'New'))).toEqual(['Table M1']);
  await page.getByRole('group', { name: 'Branch' }).getByRole('button', { name: 'Garden Branch' }).click();
  await expect(column(page, 'New').locator('article h3')).toHaveText(['Table G1']);
  await expect(page.getByText('X9')).toHaveCount(0);
  expect(stub.state.listCalls.every((branchId) => branchId !== FOREIGN_BRANCH.id)).toBe(true);
});

test('polling still picks up a new ticket without any interaction', async ({ page, context }) => {
  await open(page, context);
  stub.state.tickets.push(ticket({ id: 'late-arrival', status: 'ACCEPTED', table: { id: 't99', tableNumber: '99' }, stageMinutes: 40, items: [{ name: 'Late Soup', variantName: null, quantity: 1, modifiers: [] }] }));
  await expect(column(page, 'New').getByRole('heading', { name: 'Table 99' })).toBeVisible({ timeout: 15_000 });
  // 40 minutes in stage: it jumps to the top of the column.
  expect((await identities(column(page, 'New')))[0]).toBe('Table 99');
});
