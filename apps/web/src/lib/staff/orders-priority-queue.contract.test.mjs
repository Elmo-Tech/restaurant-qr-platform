import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phase 1 PR 1: Orders priority queue wiring.
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dir = '../../app/staff/restaurants/[restaurantId]/orders/';
const workspace = read(`${dir}OrdersWorkspace.tsx`);
const queue = read(`${dir}OrdersQueue.tsx`);
const card = read(`${dir}OrderCard.tsx`);
const filterBar = read(`${dir}OrdersFilterBar.tsx`);
const page = read(`${dir}page.tsx`);
const dashboard = read('../../app/staff/restaurants/[restaurantId]/dashboard/OperationsDashboard.tsx');

// `orders.ts` imports `./define` without an extension, so Node cannot load it
// directly: read both dictionaries from source instead.
const copySource = read('../i18n/messages/orders.ts');
function dictionary(locale) {
  const start = copySource.indexOf(`\n  ${locale}: {`);
  assert.ok(start >= 0, `missing ${locale} block`);
  const end = locale === 'en' ? copySource.indexOf('\n  ar: {') : copySource.length;
  const entries = {};
  for (const match of copySource.slice(start, end).matchAll(/'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    entries[match[1]] = match[2];
  }
  return entries;
}
const ordersMessages = { en: dictionary('en'), ar: dictionary('ar') };

test('Active view defaults to priority; explicit sort deep links are still parsed', () => {
  assert.match(workspace, /useState<OrdersSort \| null>\(initialFilters\.sort \?\? null\)/);
  assert.match(workspace, /const appliedSort = effectiveSort\(view, sort\);/);
  assert.match(workspace, /grouped=\{view === 'active' && appliedSort === 'priority'\}/);
  assert.match(page, /sort === 'newest' \|\| sort === 'oldest' \|\| sort === 'priority'/);
  // Dashboard deep links are unchanged and still explicit.
  assert.match(dashboard, /\?status=PENDING&sort=oldest/);
  assert.match(dashboard, /\?status=READY&sort=oldest/);
});

test('sort control offers only the current view\'s sorts', () => {
  assert.match(workspace, /sortOptions=\{sortsForView\(view\)\}/);
  assert.match(filterBar, /sortOptions\.map\(\(option\) =>/);
  assert.match(filterBar, /t\(`orders\.sort\.\$\{option\}`\)/);
});

test('queue groups are labelled sections; cards stay read-only', () => {
  assert.match(queue, /<section key=\{section\.group\} aria-labelledby=\{headingId\}/);
  assert.match(queue, /<h2 id=\{headingId\}/);
  assert.match(queue, /t\(`orders\.queue\.group\.\$\{section\.group\}`\)/);
  assert.match(queue, /nextStep=\{nextStepFor\(order\.status, order\.type, permissions\)\}/);
  // No mutation from the list: no API, no transition handler.
  for (const source of [queue, card]) {
    assert.doesNotMatch(source, /updateOrderStatus|onTransition|ordersApi/);
  }
  // The hint is text, never a second button: the card keeps exactly one.
  assert.equal(card.match(/<button/g)?.length, 1);
  assert.match(card, /t\('orders\.card\.nextStep', \{ action: t\(nextStep\.labelKey\) \}\)/);
});

test('late-warning thresholds are untouched in this PR (5 vs 10 min recorded separately)', () => {
  assert.match(card, /const STALE_PENDING_MINUTES = 10;/);
  assert.match(read('../orders/order-views.ts'), /export const PENDING_LATE_MINUTES = 5;/);
});

test('focus return and Phase 0.3 detail wiring are preserved', () => {
  assert.match(workspace, /detailTriggerRef\.current = trigger;\s*void openOrder\(order\.id\);/);
  assert.match(workspace, /isTransitioning=\{isTransitioning \|\| detailSync !== 'current'\}/);
});

test('queue copy exists in English and Arabic, and differs', () => {
  const keys = [
    'orders.sort.priority',
    'orders.queue.label',
    'orders.queue.group.needsDecision',
    'orders.queue.group.readyForHandoff',
    'orders.queue.group.inProgress',
    'orders.queue.group.inDelivery',
    'orders.card.nextStep',
    'orders.card.waiting.PENDING',
    'orders.card.waiting.ACCEPTED',
    'orders.card.waiting.PREPARING',
    'orders.card.waiting.READY',
    'orders.card.waiting.OUT_FOR_DELIVERY',
  ];
  for (const key of keys) {
    const en = ordersMessages.en[key];
    const ar = ordersMessages.ar[key];
    assert.ok(en && en.trim(), `missing en ${key}`);
    assert.ok(ar && ar.trim(), `missing ar ${key}`);
    assert.notEqual(en, ar, `untranslated ${key}`);
    assert.match(ar, /[؀-ۿ]/, `ar ${key} is not Arabic`);
  }
  assert.match(ordersMessages.en['orders.card.nextStep'], /\{action\}/);
  assert.match(ordersMessages.ar['orders.card.nextStep'], /\{action\}/);
  // Out for delivery is never described as waiting for a kitchen handoff.
  assert.doesNotMatch(ordersMessages.en['orders.card.waiting.OUT_FOR_DELIVERY'], /kitchen|handoff/i);
});
