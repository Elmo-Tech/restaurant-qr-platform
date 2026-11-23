import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankDraft } from './draft.ts';
import {
  PREVIEW_DEBOUNCE_MS, eligibleProducts, illustrativeExample, orderableProducts, planSavingsPreview,
  quantityForMinimum, runSavingsPreview, schedulePreview,
} from './savings-preview.ts';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = {
  branchA: uuid(1), branchB: uuid(2), branchOff: uuid(3),
  menu: uuid(10), menuOff: uuid(11),
  grill: uuid(20), sides: uuid(21), hidden: uuid(22),
  kofta: uuid(30), rice: uuid(31), soldOut: uuid(32), inactive: uuid(33), salad: uuid(34), inHiddenMenu: uuid(35),
  zoneA: uuid(40), zoneB: uuid(41),
};
const option = (id, name, extra = {}) => ({ id, name, status: 'ACTIVE', translations: [{ locale: 'ar', name }], ...extra });
const targets = () => ({
  defaultLocale: 'ar', activeLocales: ['ar', 'en'],
  branches: [
    option(ids.branchOff, 'Closed branch', { status: 'INACTIVE', timezone: 'Africa/Cairo' }),
    option(ids.branchA, 'فرع النيل', { timezone: 'Africa/Cairo' }),
    option(ids.branchB, 'فرع المعادي', { timezone: 'Africa/Cairo' }),
  ],
  menus: [option(ids.menu, 'المنيو'), option(ids.menuOff, 'Old menu', { status: 'INACTIVE' })],
  categories: [
    option(ids.grill, 'مشويات', { menuId: ids.menu }),
    option(ids.sides, 'أطباق جانبية', { menuId: ids.menu }),
    option(ids.hidden, 'Hidden', { menuId: ids.menuOff }),
  ],
  // Deliberately out of menu order: selection must follow category order, then product order.
  products: [
    option(ids.rice, 'أرز', { categoryId: ids.sides, availability: 'AVAILABLE' }),
    option(ids.soldOut, 'Sold out', { categoryId: ids.grill, availability: 'SOLD_OUT' }),
    option(ids.inactive, 'Inactive', { categoryId: ids.grill, availability: 'AVAILABLE', status: 'INACTIVE' }),
    option(ids.kofta, 'كفتة', { categoryId: ids.grill, availability: 'AVAILABLE' }),
    option(ids.salad, 'سلطة', { categoryId: ids.sides, availability: 'AVAILABLE' }),
    option(ids.inHiddenMenu, 'Hidden item', { categoryId: ids.hidden, availability: 'AVAILABLE' }),
  ],
  deliveryZones: [
    option(ids.zoneA, 'مدينة نصر', { branchId: ids.branchA, status: 'INACTIVE' }),
    option(ids.zoneB, 'المعادي', { branchId: ids.branchB }),
  ],
});
const fields = (overrides = {}) => ({ ...blankDraft(null), value: '20', ...overrides });
const plan = (overrides, catalog = targets(), original = null) => planSavingsPreview(fields(overrides), catalog, original);
const preview = (overrides = {}) => ({
  strategy: 'CART', merchandiseOriginal: '100.00', merchandisePayable: '80.00', deliveryFeeOriginal: '0.00', deliveryFeePayable: '0.00',
  grandTotal: '80.00', appliedSaving: '20.00', zoneMinimumShortfall: null,
  diagnostic: { status: 'APPLIED', potentialSaving: '20.00', remainingAmount: null, remainingQuantity: null }, ...overrides,
});
const allIds = new Set(Object.values(ids));

test('sample selection is deterministic and only uses active, available products in active categories and menus', () => {
  assert.deepEqual(orderableProducts(targets()).map(({ id }) => id), [ids.kofta, ids.rice, ids.salad]);
  const first = plan({});
  const second = plan({});
  assert.equal(first.kind, 'live');
  assert.deepEqual(first.input, second.input);
  assert.deepEqual(first.input.items, [{ productId: ids.kofta, quantity: 1 }]);
  assert.equal(first.input.branchId, ids.branchA, 'first active branch, skipping the inactive one');
  assert.equal(first.input.orderType, 'PICKUP');
  assert.equal('deliveryZoneId' in first.input, false);
});

test('CATEGORY uses a product from a selected category', () => {
  const result = plan({ scope: 'CATEGORY', categoryIds: [ids.sides] });
  assert.equal(result.kind, 'live');
  assert.deepEqual(result.input.items, [{ productId: ids.rice, quantity: 1 }]);
  assert.equal(result.input.draft.discountType, 'PERCENTAGE');
});

test('MENU uses a product from a selected active menu, never from an inactive menu', () => {
  assert.deepEqual(plan({ scope: 'MENU', menuIds: [ids.menu] }).input.items, [{ productId: ids.kofta, quantity: 1 }]);
  const hidden = plan({ scope: 'MENU', menuIds: [ids.menuOff] });
  assert.equal(hidden.kind, 'illustrative');
  assert.equal(hidden.reason, 'NO_PRODUCTS');
});

test('CART respects category and product restrictions as a union', () => {
  assert.deepEqual(plan({ scope: 'CART' }).input.items, [{ productId: ids.kofta, quantity: 1 }]);
  assert.deepEqual(plan({ scope: 'CART', productIds: [ids.salad] }).input.items, [{ productId: ids.salad, quantity: 1 }]);
  const draft = { ...plan({ scope: 'CART', categoryIds: [ids.sides], productIds: [ids.kofta] }).input.draft };
  assert.deepEqual(eligibleProducts(draft, targets()).map(({ id }) => id), [ids.kofta, ids.rice, ids.salad]);
  assert.equal(plan({ scope: 'CART', productIds: [ids.soldOut] }).reason, 'NO_PRODUCTS');
});

test('QUANTITY builds an example that meets the required units or distinct items', () => {
  const units = plan({ scope: 'QUANTITY', minimumQuantity: '3', quantityBasis: 'UNITS' });
  assert.deepEqual(units.input.items, [{ productId: ids.kofta, quantity: 3 }]);
  assert.equal(units.requiredQuantity, 3);
  const distinct = plan({ scope: 'QUANTITY', minimumQuantity: '2', quantityBasis: 'DISTINCT_PRODUCTS' });
  assert.deepEqual(distinct.input.items, [{ productId: ids.kofta, quantity: 1 }, { productId: ids.rice, quantity: 1 }]);
  const tooMany = plan({ scope: 'QUANTITY', minimumQuantity: '4', quantityBasis: 'DISTINCT_PRODUCTS' });
  assert.equal(tooMany.kind, 'illustrative');
  assert.equal(tooMany.reason, 'NOT_ENOUGH_PRODUCTS');
  assert.equal(tooMany.requiredQuantity, 4);
  assert.equal(plan({ scope: 'QUANTITY', minimumQuantity: '150' }).reason, 'QUANTITY_TOO_LARGE');
  assert.equal(plan({ scope: 'QUANTITY', minimumQuantity: '1' }).requiredQuantity, null);
});

test('DELIVERY picks an active zone in an eligible branch and sends a delivery order', () => {
  const result = plan({ scope: 'DELIVERY' });
  assert.equal(result.kind, 'live');
  assert.equal(result.input.orderType, 'DELIVERY');
  assert.equal(result.input.deliveryZoneId, ids.zoneB, 'the inactive zone is skipped');
  assert.equal(result.input.branchId, ids.branchB, 'the branch follows the chosen zone');
  assert.deepEqual(result.input.items, [{ productId: ids.kofta, quantity: 1 }]);
  const restricted = plan({ scope: 'DELIVERY', deliveryZoneIds: [ids.zoneA] });
  assert.equal(restricted.kind, 'illustrative');
  assert.equal(restricted.reason, 'NO_ZONE');
  assert.equal(restricted.example.deliveryFee, '25.00');
});

test('branch restrictions are respected; inactive or missing branches fall back to an example', () => {
  assert.equal(plan({ branchIds: [ids.branchB] }).input.branchId, ids.branchB);
  assert.equal(plan({ branchIds: [ids.branchOff] }).reason, 'NO_BRANCH');
  assert.equal(plan({}, { ...targets(), branches: [] }).reason, 'NO_BRANCH');
});

test('empty data falls back to an illustrative example that never carries product ids', () => {
  const empty = { ...targets(), products: [] };
  for (const scope of ['CART', 'QUANTITY']) {
    const result = plan({ scope, minimumQuantity: '2' }, empty);
    assert.equal(result.kind, 'illustrative');
    assert.equal('input' in result, false);
    assert.ok(!JSON.stringify(result).split('"').some((token) => allIds.has(token)), 'no real or fake ids in the example');
  }
  // A delivery preview with no product still uses the real zone fee.
  const delivery = plan({ scope: 'DELIVERY' }, empty);
  assert.equal(delivery.kind, 'live');
  assert.deepEqual(delivery.input.items, []);
});

test('illustrative math uses exact cents and respects the scope', () => {
  const draft = (overrides) => plan({ ...overrides }, { ...targets(), products: [] }).example;
  assert.deepEqual(draft({ scope: 'CART', value: '12.5' }), { quantity: 1, distinct: false, original: '150.00', payable: '131.25', saving: '18.75', deliveryFee: null, deliveryFeePayable: null });
  assert.equal(draft({ scope: 'CART', discountType: 'FIXED_AMOUNT', value: '500' }).payable, '0.00', 'fixed amount is capped');
  assert.equal(draft({ scope: 'CART', minimumSubtotal: '400' }).quantity, 3, 'the example meets the minimum');
  assert.deepEqual(draft({ scope: 'QUANTITY', minimumQuantity: '3', quantityBasis: 'DISTINCT_PRODUCTS', value: '10' }), { quantity: 3, distinct: true, original: '450.00', payable: '405.00', saving: '45.00', deliveryFee: null, deliveryFeePayable: null });
  const delivery = illustrativeExample({ ...plan({ scope: 'CART' }).input.draft, scope: 'DELIVERY', discountType: 'FIXED_AMOUNT', value: '10.50' });
  assert.equal(delivery.deliveryFeePayable, '14.50');
  assert.equal(delivery.payable, delivery.original);
});

test('incomplete drafts show guidance instead of calling the API', () => {
  assert.deepEqual(plan({ value: '' }), { kind: 'incomplete', reason: 'VALUE_MISSING' });
  assert.equal(plan({ value: '120' }).reason, 'VALUE_INVALID');
  assert.equal(plan({ scope: 'CATEGORY' }).reason, 'CATEGORY_TARGETS');
  assert.equal(plan({ scope: 'MENU' }).reason, 'MENU_TARGETS');
  assert.equal(plan({ scope: 'QUANTITY', minimumQuantity: '' }).reason, 'MINIMUM_QUANTITY');
  assert.equal(plan({ startsOn: '2026-12-02', endsOn: '2026-12-01' }).reason, 'DATES');
  // Names and guest titles are not required: a blank new draft still previews.
  assert.equal(plan({ internalName: '', translations: [] }).kind, 'live');
});

test('live updates: pricing-relevant changes change the request, guest titles do not', () => {
  const key = (overrides) => JSON.stringify(plan(overrides).input);
  const base = key({});
  assert.notEqual(key({ value: '25' }), base);
  assert.notEqual(key({ discountType: 'FIXED_AMOUNT' }), base);
  assert.notEqual(key({ scope: 'QUANTITY', minimumQuantity: '2' }), base);
  assert.notEqual(key({ productIds: [ids.salad] }), base);
  assert.notEqual(key({ minimumSubtotal: '50' }), base);
  assert.equal(key({ internalName: 'Ramadan', translations: [{ locale: 'ar', title: 'خصم رمضان', description: null }] }), base);
  assert.equal(plan({}, targets(), { id: ids.branchA }).input.promotionId, ids.branchA, 'an edited promotion replaces its saved version');
});

test('a missed minimum order is met with more units of the same real item', () => {
  const input = plan({ minimumSubtotal: '250' }).input;
  const below = preview({ appliedSaving: '0.00', diagnostic: { status: 'BELOW_MINIMUM_SUBTOTAL', potentialSaving: '0.00', remainingAmount: '150.00', remainingQuantity: null } });
  assert.deepEqual(quantityForMinimum(input, below).items, [{ productId: ids.kofta, quantity: 3 }]);
  assert.equal(quantityForMinimum(input, preview()), null);
  const huge = { ...below, diagnostic: { ...below.diagnostic, remainingAmount: '100000.00' } };
  assert.equal(quantityForMinimum(input, huge), null, 'never exceeds the preview quantity limit');
});

test('runSavingsPreview retries once for a minimum and keeps the engine answer', async () => {
  const input = plan({ minimumSubtotal: '250' }).input;
  const calls = [];
  const fetcher = async (body) => {
    calls.push(body.items[0].quantity);
    return body.items[0].quantity === 1
      ? preview({ appliedSaving: '0.00', diagnostic: { status: 'BELOW_MINIMUM_SUBTOTAL', potentialSaving: '0.00', remainingAmount: '150.00', remainingQuantity: null } })
      : preview({ merchandiseOriginal: '300.00', merchandisePayable: '240.00', appliedSaving: '60.00' });
  };
  const outcome = await runSavingsPreview(input, fetcher, new AbortController().signal);
  assert.deepEqual(calls, [1, 3]);
  assert.equal(outcome.adjustedForMinimum, true);
  assert.equal(outcome.result.appliedSaving, '60.00');
});

test('debounced scheduling coalesces rapid edits into one request', async () => {
  assert.ok(PREVIEW_DEBOUNCE_MS >= 250 && PREVIEW_DEBOUNCE_MS <= 800);
  const sent = [];
  const results = [];
  const fetcher = async (body) => { sent.push(body.draft.value); return preview(); };
  const options = { fetcher, delayMs: 20, onPending: () => {}, onResult: (outcome) => results.push(outcome), onError: assert.fail };
  let cancel = schedulePreview(plan({ value: '1' }).input, options);
  cancel(); cancel = schedulePreview(plan({ value: '15' }).input, options);
  cancel(); schedulePreview(plan({ value: '15.5' }).input, options);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(sent, ['15.5']);
  assert.equal(results.length, 1);
});

test('a superseded request is aborted and its late answer is ignored', async () => {
  const settled = [];
  let release;
  let abortedSignal;
  const slow = (body, signal) => { abortedSignal = signal; return new Promise((resolve) => { release = () => resolve(preview({ appliedSaving: '1.00' })); }); };
  const fast = async () => preview({ appliedSaving: '2.00' });
  const options = (fetcher, tag) => ({ fetcher, delayMs: 0, onPending: () => {}, onResult: (outcome) => settled.push([tag, outcome.result.appliedSaving]), onError: () => settled.push([tag, 'error']) });
  const cancelSlow = schedulePreview(plan({ value: '10' }).input, options(slow, 'old'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  cancelSlow();
  assert.equal(abortedSignal.aborted, true);
  schedulePreview(plan({ value: '20' }).input, options(fast, 'new'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(settled, [['new', '2.00']]);
});

test('API failures are reported, never replaced with a made-up saving', async () => {
  const errors = [];
  const results = [];
  schedulePreview(plan({}).input, {
    fetcher: async () => { throw new Error('offline'); }, delayMs: 0,
    onPending: () => {}, onResult: (outcome) => results.push(outcome), onError: (caught) => errors.push(caught.message),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(errors, ['offline']);
  assert.deepEqual(results, []);
});

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const workspace = '../../app/staff/restaurants/[restaurantId]/menu/promotions/';

test('the preview is read-only and automatic: no manual controls, no writes', () => {
  const component = source(`${workspace}SavingsPreview.tsx`);
  for (const control of ['<form', '<Select', '<Input', 'type="submit"', 'previewRun', 'previewAdd', 'savePromotion', 'runPromotionAction']) {
    assert.ok(!component.includes(control), `unexpected ${control}`);
  }
  assert.match(component, /import \{ previewPromotion, type Promotion, type PromotionTargets \}/);
  assert.match(component, /schedulePreview\(plan\.input/);
  assert.match(component, /result\.appliedSaving/);
  assert.match(component, /diagnostic\.status/);
  assert.match(component, /zoneMinimumShortfall/);
  assert.match(source('./api.ts'), /\/preview`, \{ method: 'POST', body: input, signal \}/);
});

test('Arabic RTL formatting: amounts are isolated LTR inside RTL copy, names use auto direction', () => {
  const component = source(`${workspace}SavingsPreview.tsx`);
  assert.match(component, /<bdi dir="ltr" className="tabular-nums">\{amount\} \{currencyCode\}<\/bdi>/);
  assert.match(component, /\\u2066\$\{amount\} \$\{currencyCode\}\\u2069/);
  assert.match(component, /<bdi dir="auto"/);
  assert.match(component, /text-end/);
  assert.ok(!/\b(?:text-left|text-right|ml-|mr-|pl-|pr-)\S*/.test(component), 'logical properties only');
  const messages = source('../i18n/messages/promotions.ts');
  for (const phrase of ['معاينة التوفير', 'العميل هيوفّر', 'مثال توضيحي', 'من المنيو بتاعك', 'بأسعار النهارده']) assert.ok(messages.includes(phrase), phrase);
  for (const removed of ['promotions.previewRun', 'promotions.previewBasket', 'promotions.strategy.']) assert.ok(!messages.includes(removed), removed);
});

test('responsive layout matches the Product editor: sticky sidebar on desktop, full width below on mobile', () => {
  const editor = source(`${workspace}PromotionEditor.tsx`);
  assert.match(editor, /grid-cols-1 items-start gap-6 xl:grid-cols-\[minmax\(0,1fr\)_380px\]/);
  assert.match(editor, /<aside className="min-w-0 xl:sticky xl:top-4">/);
  assert.ok(editor.indexOf('</form>') < editor.indexOf('{preview}', editor.indexOf('</form>')), 'preview follows the form in source order');
  assert.match(source('../../app/staff/restaurants/[restaurantId]/menu/products/ProductEditor.tsx'), /xl:grid-cols-\[minmax\(0,1fr\)_380px\]/);
});
