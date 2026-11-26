/* eslint-disable @typescript-eslint/no-require-imports -- Playwright runs these files as CommonJS. */
'use strict';
const { test, expect } = require('@playwright/test');
const { createStub, ticket, RESTAURANT_ID, BRANCH_MAIN, BRANCH_OTHER } = require('../kitchen-k2/stub-api.cjs');
const { boardTickets } = require('../kitchen-k2/scenario.cjs');

const API_PORT = Number(process.env.K2_API_PORT);
const BOARD = `/staff/restaurants/${RESTAURANT_ID}/kitchen`;

// Kitchen K3: Three Stage Tabs + One Ticket Focus on a phone, against the in-process stub API (UI proof only; the
// Backend owns transitions and authorization). NEW is [Table 7 (26 min), Table 3, Omar K., Sara]; PREPARING is
// [Table 12, Omar K.]; READY is [Table 5].
test.describe.configure({ mode: 'serial' });

let stub;
test.afterEach(async () => {
  if (stub) await stub.close();
  stub = null;
});

async function open(page, context, { locale = 'en', stubOptions = {}, viewport } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  stub = createStub({ tickets: boardTickets(locale), ...stubOptions });
  await stub.listen(API_PORT);
  await context.addCookies([{ name: 'staff_ui_locale', value: locale, url: process.env.K2_WEB_ORIGIN }]);
  await page.goto(BOARD);
  await page.locator('article').first().waitFor();
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

const panel = (page) => page.getByRole('tabpanel');
const identity = (page) => page.locator('article h3');
const refresh = async (page) => {
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
};
const position = (page) => page.locator('[role="tabpanel"] p', { hasText: /^Ticket \d+ of \d+$/ });
const startButton = (page) => page.getByRole('button', { name: 'Start preparing' });
const items = (name) => [{ name, variantName: null, quantity: 1, modifiers: [] }];
/** Which way each chevron points on screen, from its computed mirroring (the drawing points left). */
const chevronDirections = (page, previousName, nextName) =>
  page.evaluate(([previousLabel, nextLabel]) => {
    const point = (label) => {
      const svg = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === label)?.querySelector('svg');
      // Tailwind 4 mirrors with the individual `scale` property (`-scale-x-100`), not `transform`.
      return getComputedStyle(svg).scale.trim().startsWith('-') ? 'right' : 'left';
    };
    return { previous: point(previousLabel), next: point(nextLabel) };
  }, [previousName, nextName]);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [360, 390, 430]) {
  test(`${width}px: three tabs with counts, one ticket, an action that is never covered, no sideways scroll`, async ({ page, context }) => {
    await open(page, context, { viewport: { width, height: 800 } });
    const tabs = page.getByRole('tablist', { name: 'Board column' }).getByRole('tab');
    expect(await tabs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))).toEqual(['New: 4', 'Preparing: 2', 'Ready: 1']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    // The count and the stage name are both visible on every tab, inside the viewport and never overlapping.
    const boxes = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await tabs.nth(index).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      boxes.push(box);
    }
    expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
    expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x);
    await expect(tabs.first()).toContainText('4');
    await expect(tabs.first()).toContainText('New');

    // Exactly one ticket, the longest-waiting one; the others are compact rows.
    await expect(page.locator('article')).toHaveCount(1);
    await expect(identity(page)).toHaveText('Table 7');
    await expect(position(page)).toHaveText('Ticket 1 of 4');
    expect(await page.getByRole('region', { name: 'Other tickets in “New”' }).getByRole('listitem').count()).toBe(3);

    // The action sits above the bottom navigation, not under it, without scrolling.
    const action = startButton(page);
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    const covered = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('button')?.textContent ?? hit?.tagName;
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(covered).toBe('Start preparing');

    expect(await noOverflow(page)).toBe(true);
    // Every control on the page is at least 44px tall.
    const buttons = page.locator('main button');
    for (let index = 0; index < (await buttons.count()); index += 1) {
      if (!(await buttons.nth(index).isVisible())) continue;
      const size = await buttons.nth(index).boundingBox();
      expect(size.height, `${await buttons.nth(index).innerText()} at ${width}px`).toBeGreaterThanOrEqual(44);
    }
  });
}

test('tabs follow the reading direction from the keyboard; only the selected tab is in the Tab order', async ({ page, context }) => {
  await open(page, context);
  const tab = (name) => page.getByRole('tab', { name });
  await tab('New: 4').focus();
  await expect(tab('Preparing: 2')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('ArrowRight');
  await expect(tab('Preparing: 2')).toHaveAttribute('aria-selected', 'true');
  await expect(identity(page)).toHaveText('Table 12');
  await page.keyboard.press('End');
  await expect(tab('Ready: 1')).toHaveAttribute('aria-selected', 'true');
  await expect(identity(page)).toHaveText('Table 5');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab('New: 4')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tab('Ready: 1')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab('New: 4')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'kitchen-tab-ACCEPTED');
});

test('Arabic mirrors the tabs, the arrow keys and Previous / Next, and fits at 360px', async ({ page, context }) => {
  await open(page, context, { locale: 'ar', viewport: { width: 360, height: 800 } });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const tabs = page.getByRole('tablist').getByRole('tab');
  const first = await tabs.nth(0).boundingBox();
  const last = await tabs.nth(2).boundingBox();
  expect(first.x).toBeGreaterThan(last.x); // New is on the right
  await expect(tabs.nth(0)).toHaveAttribute('aria-label', 'جديد: 4');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowLeft'); // in RTL "next" is on the left
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(0).click();
  const previous = await page.getByRole('button', { name: 'السابق' }).boundingBox();
  const next = await page.getByRole('button', { name: 'التالي' }).boundingBox();
  expect(previous.x).toBeGreaterThan(next.x);
  await expect(page.locator('[role="tabpanel"] p', { hasText: /^الطلب 1 من 4$/ })).toBeVisible();
  // The chevrons point the way the page reads: Previous points to the start (right in Arabic), Next to the end.
  expect(await chevronDirections(page, 'السابق', 'التالي')).toEqual({ previous: 'right', next: 'left' });
  expect(await noOverflow(page)).toBe(true);
  const card = await page.locator('article').boundingBox();
  expect(card.x + card.width).toBeLessThanOrEqual(360);
});

test('the focused ticket is chosen by id: the list, Previous and Next never act on anything', async ({ page, context }) => {
  await open(page, context);
  await page.getByRole('button', { name: /^Show Omar K\./ }).click();
  await expect(identity(page)).toHaveText('Omar K.');
  await expect(position(page)).toHaveText('Ticket 3 of 4');
  expect(await chevronDirections(page, 'Previous', 'Next')).toEqual({ previous: 'left', next: 'right' });
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(identity(page)).toHaveText('Table 3');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(identity(page)).toHaveText('Sara');
  await expect(page.getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Next' }).click({ force: true });
  await expect(identity(page)).toHaveText('Sara'); // stops at the end
  expect(stub.state.patchCalls).toEqual([]);
});

test('switching tabs returns to the ticket last focused there', async ({ page, context }) => {
  await open(page, context);
  await page.getByRole('button', { name: /^Show Omar K\./ }).click();
  await page.getByRole('tab', { name: 'Preparing: 2' }).click();
  await expect(identity(page)).toHaveText('Table 12');
  await page.getByRole('tab', { name: 'New: 4' }).click();
  await expect(identity(page)).toHaveText('Omar K.');
});

test('polling during interaction: reordering and new tickets never change the focused ticket or where the action goes', async ({ page, context }) => {
  await open(page, context);
  await page.getByRole('button', { name: /^Show Omar K\./ }).click();
  await expect(position(page)).toHaveText('Ticket 3 of 4');

  // An older order arrives (it now sorts first) and Table 3 gets re-ranked: Omar K. is still the ticket in focus.
  stub.state.tickets.push(ticket({ id: 'z-old', status: 'ACCEPTED', table: { id: 't1', tableNumber: '1' }, stageMinutes: 50, createdMinutes: 50, items: items('Old Soup') }));
  stub.state.tickets.find((entry) => entry.id === 'd-tie-2').statusSince = new Date(Date.now() - 60 * 60_000).toISOString();
  await refresh(page);
  await expect(page.getByRole('tab', { name: 'New: 5' })).toBeVisible();
  await expect(identity(page)).toHaveText('Omar K.');
  await expect(position(page)).toHaveText('Ticket 4 of 5');
  await expect(startButton(page)).toBeEnabled();

  await startButton(page).click();
  await expect(page.getByRole('tab', { name: 'Preparing: 3' })).toBeVisible();
  expect(stub.state.patchCalls.map(({ id, expectedStatus, status }) => `${id} ${expectedStatus}>${status}`)).toEqual(['c-tie-1 ACCEPTED>PREPARING']);
});

test('the real 5 s poll adds a ticket without moving the focus or the scroll position', async ({ page, context }) => {
  await open(page, context);
  stub.state.tickets.push(ticket({ id: 'late-arrival', status: 'ACCEPTED', table: { id: 't99', tableNumber: '99' }, stageMinutes: 40, items: items('Late Soup') }));
  await expect(page.getByRole('tab', { name: 'New: 5' })).toBeVisible({ timeout: 15_000 });
  // 40 minutes in stage: it is now the longest waiting, yet the ticket the person was looking at stays in focus.
  await expect(identity(page)).toHaveText('Table 7');
  await expect(position(page)).toHaveText('Ticket 2 of 5');
});

test('a finished ticket moves the focus on: a short pause on the next action, no notice, focus lands on the new ticket', async ({ page, context }) => {
  await open(page, context);
  await startButton(page).click();
  await expect(identity(page)).toHaveText('Table 3');
  // Held for a moment: the second half of a double tap cannot start the ticket that just slid in.
  await expect(startButton(page)).toBeDisabled();
  await startButton(page).click({ force: true, timeout: 1_000 }).catch(() => undefined);
  await expect(startButton(page)).toBeEnabled({ timeout: 3_000 });
  expect(stub.state.patchCalls.map(({ id }) => id)).toEqual(['b-late']);
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  await expect(panel(page).getByText(/by someone else/)).toHaveCount(0);
  // Keyboard / screen-reader focus was on the button that left: it lands on the ticket now in focus.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Table 3 · Ticket 1 of 3');
  await expect(page.getByRole('tab', { name: 'Preparing: 3' })).toBeVisible();
});

test('a double tap sends one guarded request and never starts the next ticket', async ({ page, context }) => {
  await open(page, context);
  await startButton(page).dblclick();
  await expect(identity(page)).toHaveText('Table 3');
  await page.waitForTimeout(1_200);
  expect(stub.state.patchCalls.map(({ id }) => id)).toEqual(['b-late']);
});

test('a ticket removed by another employee: the neighbour is shown with an explanation and its action waits for Continue', async ({ page, context }) => {
  await open(page, context);
  stub.state.tickets = stub.state.tickets.filter((entry) => entry.id !== 'b-late'); // finished or cancelled elsewhere
  await refresh(page);
  await expect(identity(page)).toHaveText('Table 3');
  await expect(panel(page).getByText('Table 7 is no longer on the board. It was finished or cancelled from another screen.')).toBeVisible();
  // Also announced once, politely, for screen readers.
  await expect(page.locator('p[aria-live="polite"]')).toContainText('Table 7 is no longer on the board');
  await expect(panel(page).getByText('Now showing Table 3. Check it before you act.')).toBeVisible();
  await expect(startButton(page)).toBeDisabled();
  await startButton(page).click({ force: true, timeout: 1_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000); // time alone never releases it
  await expect(startButton(page)).toBeDisabled();
  expect(stub.state.patchCalls).toEqual([]);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(startButton(page)).toBeEnabled();
  await expect(panel(page).getByText(/no longer on the board/)).toHaveCount(0);
  await startButton(page).click();
  await expect(page.getByRole('tab', { name: 'Preparing: 3' })).toBeVisible();
  expect(stub.state.patchCalls.map(({ id }) => id)).toEqual(['d-tie-2']);
});

test('a ticket moved by another employee: it is named, "Show it" follows it, and the neighbour waits for Continue', async ({ page, context }) => {
  await open(page, context);
  const moved = stub.state.tickets.find((entry) => entry.id === 'b-late');
  moved.status = 'PREPARING';
  moved.statusSince = new Date().toISOString();
  await refresh(page);
  await expect(panel(page).getByText('Table 7 was moved to “Preparing” by someone else.')).toBeVisible();
  await expect(identity(page)).toHaveText('Table 3');
  await expect(startButton(page)).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'New: 3' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Preparing: 3' })).toBeVisible();

  await page.getByRole('button', { name: 'Show it' }).click();
  await expect(page.getByRole('tab', { name: 'Preparing: 3' })).toHaveAttribute('aria-selected', 'true');
  await expect(identity(page)).toHaveText('Table 7');
  await expect(page.getByRole('button', { name: 'Mark ready' })).toBeEnabled();
  await expect(panel(page).getByText(/by someone else/)).toHaveCount(0);
  expect(stub.state.patchCalls).toEqual([]);
});

test('the last ticket leaving a stage shows its empty state; READY departures are routine and silent', async ({ page, context }) => {
  await open(page, context);
  await page.getByRole('tab', { name: 'Ready: 1' }).click();
  await expect(identity(page)).toHaveText('Table 5');
  stub.state.tickets = stub.state.tickets.filter((entry) => entry.id !== 'g-ready'); // served from the Orders screen
  await refresh(page);
  await expect(page.getByText('Nothing waiting for service')).toBeVisible();
  await expect(panel(page).getByText(/no longer on the board/)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Ready: 0' })).toBeVisible();
});

test('a refused move is reconciled against a fresh read, never retried, and the focus stays on the same ticket', async ({ page, context }) => {
  await open(page, context, {
    stubOptions: { patch: () => ({ status: 409, body: { error: { code: 'ORDER_STATUS_CHANGED', message: 'Changed' } } }) },
  });
  const reads = stub.state.listCalls.length;
  await startButton(page).click();
  await expect(page.locator('article').getByRole('status')).toContainText('Someone else updated this order');
  await expect(identity(page)).toHaveText('Table 7');
  await expect(startButton(page)).toBeEnabled();
  expect(stub.state.patchCalls).toHaveLength(1);
  expect(stub.state.listCalls.length).toBeGreaterThan(reads);
});

test('a read-only account can browse every ticket but nothing is enabled and nothing is sent', async ({ page, context }) => {
  await open(page, context, { stubOptions: { permissions: ['kitchen.view', 'orders.view'] } });
  await expect(page.getByText('You can view the board but not change orders.')).toBeVisible();
  await expect(startButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(identity(page)).toHaveText('Table 3');
  await expect(startButton(page)).toBeDisabled();
  expect(stub.state.patchCalls).toEqual([]);
});

test('branch switching: only the current branch is shown, the focus restarts there, and actions carry that branch\'s ticket', async ({ page, context }) => {
  const FOREIGN = { id: '77777777-7777-4777-8777-777777777777', name: 'Unauthorized Branch' };
  const tickets = [
    ticket({ id: 'main-1', status: 'ACCEPTED', table: { id: 'tm1', tableNumber: 'M1' }, stageMinutes: 9, items: items('Soup') }),
    ticket({ id: 'main-2', status: 'ACCEPTED', table: { id: 'tm2', tableNumber: 'M2' }, stageMinutes: 4, items: items('Salad') }),
    ticket({ id: 'other-1', status: 'ACCEPTED', table: { id: 'to1', tableNumber: 'G1' }, stageMinutes: 8, branch: BRANCH_OTHER, items: items('Tea') }),
    ticket({ id: 'secret-1', status: 'ACCEPTED', table: { id: 'ts', tableNumber: 'X9' }, stageMinutes: 30, branch: FOREIGN, items: items('Secret') }),
  ];
  await open(page, context, { stubOptions: { branches: [BRANCH_MAIN, BRANCH_OTHER], tickets } });
  await page.getByRole('button', { name: /^Show Table M2/ }).click();
  await expect(identity(page)).toHaveText('Table M2');

  await page.getByRole('group', { name: 'Branch' }).getByRole('button', { name: 'Garden Branch' }).click();
  await expect(identity(page)).toHaveText('Table G1');
  await expect(page.getByRole('tab', { name: 'New: 1' })).toBeVisible();
  await expect(page.getByText(/M1|M2|X9/)).toHaveCount(0);
  await startButton(page).click();
  await expect.poll(() => stub.state.patchCalls.length).toBe(1);
  expect(stub.state.patchCalls[0].id).toBe('other-1');

  await page.getByRole('group', { name: 'Branch' }).getByRole('button', { name: 'Main Branch' }).click();
  await expect(identity(page)).toHaveText('Table M1'); // the focus restarted: the longest-waiting ticket of that branch
  await expect(page.getByRole('tab', { name: 'New: 2' })).toBeVisible();
  expect(stub.state.listCalls.every((branchId) => branchId !== FOREIGN.id)).toBe(true);
});

test('on a desktop the board is still three columns with every ticket and no tabs', async ({ page, context }) => {
  await open(page, context, { viewport: { width: 1365, height: 900 } });
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByRole('tab')).toHaveCount(3);
});
