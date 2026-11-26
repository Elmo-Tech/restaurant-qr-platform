import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft } from './draft.ts';
import { planPreview } from './preview-plan.ts';

const branch = (id, status = 'ACTIVE') => ({ id, status, name: id, timezone: 'Africa/Cairo' });
const catalog = (overrides = {}) => ({
  defaultLocale: 'en', activeLocales: ['en'], fixedItemScopeEnabled: true,
  branches: [branch('b1'), branch('b2')], menus: [{ id: 'm1', status: 'ACTIVE', name: 'Menu' }],
  categories: [{ id: 'c1', menuId: 'm1', status: 'ACTIVE', name: 'Grill' }], products: [],
  deliveryZones: [{ id: 'z1', branchId: 'b2', status: 'ACTIVE', name: 'Zone' }, { id: 'z2', branchId: 'b1', status: 'INACTIVE', name: 'Old' }],
  ...overrides,
});
const fields = (overrides) => ({ ...blankDraft(null), internalName: 'Test', translations: [{ locale: 'en', title: 'Offer', description: null }], value: '10', minimumSubtotal: '100', ...overrides });

test('the plan only chooses a context; it never carries items, prices or any computed money', () => {
  const plan = planPreview(fields({ scope: 'CART' }), catalog(), null);
  assert.equal(plan.kind, 'request');
  assert.equal(plan.request.branchId, 'b1');
  assert.equal(plan.request.orderType, 'PICKUP');
  assert.equal(plan.request.items, undefined, 'the Backend builds the baskets');
  assert.equal(plan.request.draft.value, '10');
  assert.equal(plan.request.draft.minimumSubtotal, '100');
  assert.deepEqual(Object.keys(plan.request).sort(), ['branchId', 'draft', 'orderType']);
});

test('an unfinished draft is incomplete without any request, and says what is missing', () => {
  assert.deepEqual(planPreview(fields({ value: '' }), catalog(), null), { kind: 'incomplete', reason: 'VALUE_MISSING' });
  assert.deepEqual(planPreview(fields({ value: '150' }), catalog(), null), { kind: 'incomplete', reason: 'VALUE_INVALID' });
  assert.deepEqual(planPreview(fields({ scope: 'CATEGORY' }), catalog(), null), { kind: 'incomplete', reason: 'CATEGORY_TARGETS' });
  assert.deepEqual(planPreview(fields({ scope: 'MENU' }), catalog(), null), { kind: 'incomplete', reason: 'MENU_TARGETS' });
  assert.deepEqual(planPreview(fields({ scope: 'QUANTITY', minimumQuantity: '' }), catalog(), null), { kind: 'incomplete', reason: 'MINIMUM_QUANTITY' });
  assert.deepEqual(planPreview(fields({ scope: 'CART', minimumSubtotal: '' }), catalog(), null), { kind: 'incomplete', reason: 'MINIMUM_SUBTOTAL' });
  assert.deepEqual(planPreview(fields({ scope: 'CART', minimumSubtotal: '0.00' }), catalog(), null), { kind: 'incomplete', reason: 'MINIMUM_SUBTOTAL' });
  assert.deepEqual(planPreview(fields({ startsOn: '2026-12-02', endsOn: '2026-12-01' }), catalog(), null), { kind: 'incomplete', reason: 'DATES' });
  assert.deepEqual(planPreview(fields({ priority: '5000' }), catalog(), null), { kind: 'incomplete', reason: 'PRIORITY' });
  assert.deepEqual(planPreview(fields({}), catalog({ branches: [branch('b1', 'INACTIVE')] }), null), { kind: 'incomplete', reason: 'NO_BRANCH' });
});

test('every scope and both discount types produce a request for that scope', () => {
  const cases = [
    ['CATEGORY', { categoryIds: ['c1'] }], ['MENU', { menuIds: ['m1'] }], ['CART', {}],
    ['QUANTITY', { minimumQuantity: '2' }], ['DELIVERY', { deliveryZoneIds: ['z1'] }],
  ];
  for (const [scope, extra] of cases) {
    for (const discountType of ['PERCENTAGE', 'FIXED_AMOUNT']) {
      const plan = planPreview(fields({ scope, discountType, ...extra }), catalog(), null);
      assert.equal(plan.kind, 'request', `${scope} ${discountType}`);
      assert.equal(plan.request.draft.scope, scope);
      assert.equal(plan.request.draft.discountType, discountType);
      assert.equal(plan.request.orderType, scope === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
    }
  }
});

test('a delivery fee promotion is asked about a branch that really has one of its areas', () => {
  const plan = planPreview(fields({ scope: 'DELIVERY', deliveryZoneIds: ['z1'] }), catalog(), null);
  assert.equal(plan.request.branchId, 'b2');
  assert.equal(plan.request.deliveryZoneId, 'z1');
  // an inactive area is never chosen: the Backend then answers ILLUSTRATIVE instead of a real price with a sample fee
  const none = planPreview(fields({ scope: 'DELIVERY', deliveryZoneIds: ['z2'] }), catalog(), null);
  assert.equal(none.request.orderType, 'DELIVERY');
  assert.equal(none.request.deliveryZoneId, undefined);
});

test('branches restrict the context, and an edit of a stored promotion replaces it instead of competing with it', () => {
  const plan = planPreview(fields({ branchIds: ['b2'] }), catalog(), null);
  assert.equal(plan.request.branchId, 'b2');
  const stored = { id: 'p1', scope: 'CART', needsMinimumSubtotal: false, updatedAt: '2026-11-26T10:00:00.000Z', status: 'INACTIVE' };
  assert.equal(planPreview(fields({}), catalog(), stored).request.promotionId, 'p1');
});

test('names and titles reach the Backend and invalidate the answer; save or activation also asks again', () => {
  const a = planPreview(fields({ internalName: 'A', translations: [{ locale: 'en', title: 'One', description: null }] }), catalog(), null);
  const b = planPreview(fields({ internalName: 'B', translations: [{ locale: 'en', title: 'Two', description: null }] }), catalog(), null);
  assert.equal(a.request.draft.internalName, 'A');
  assert.deepEqual(a.request.draft.translations, [{ locale: 'en', title: 'One', description: null }]);
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.key, planPreview(fields({ internalName: 'B', translations: [{ locale: 'en', title: 'One', description: null }] }), catalog(), null).key);
  assert.notEqual(a.key, planPreview(fields({ internalName: 'A', translations: [{ locale: 'en', title: 'Two', description: null }] }), catalog(), null).key);
  assert.equal(planPreview(fields({ internalName: '' }), catalog(), null).kind, 'incomplete');
  assert.equal(planPreview(fields({ translations: [] }), catalog(), null).kind, 'incomplete');
  assert.notEqual(planPreview(fields({ value: '11' }), catalog(), null).key, a.key);
  const stored = (updatedAt, status) => ({ id: 'p1', scope: 'CART', needsMinimumSubtotal: false, updatedAt, status });
  const saved = planPreview(fields({}), catalog(), stored('2026-11-26T10:00:00.000Z', 'INACTIVE')).key;
  assert.notEqual(planPreview(fields({}), catalog(), stored('2026-11-26T10:05:00.000Z', 'INACTIVE')).key, saved, 'after a save');
  assert.notEqual(planPreview(fields({}), catalog(), stored('2026-11-26T10:00:00.000Z', 'ACTIVE')).key, saved, 'after an activation');
});

test('a stored legacy CART promotion without a minimum stays previewable (the Backend applies the legacy rule)', () => {
  const legacy = { id: 'p1', scope: 'CART', needsMinimumSubtotal: true, updatedAt: 'x', status: 'ACTIVE' };
  assert.equal(planPreview(fields({ scope: 'CART', minimumSubtotal: '' }), catalog(), legacy).kind, 'request');
});

test('a stored priority is sent back unchanged', () => {
  assert.equal(planPreview(fields({ priority: '7' }), catalog(), null).request.draft.priority, 7);
  assert.equal(planPreview(fields({}), catalog(), null).request.draft.priority, 100);
});
