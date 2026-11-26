import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankDraft, canOfferFixed, changesDiscountType, isFixedItem, normalizePromotionNumber, supportsMinimumSubtotal, toPromotionDraft, widening } from './draft.ts';
import { canManagePromotions, canOpenPromotions } from './capabilities.ts';

const catalog = {
  defaultLocale: 'ar', activeLocales: ['ar'], branches: [], menus: [], categories: [], products: [],
  deliveryZones: [{ id: 'zone-1', branchId: 'branch-1' }],
};
const baseDraft = () => ({
  ...blankDraft(null), internalName: '  Test  ', value: '20.15',
  translations: [{ locale: 'ar', title: ' خصم ', description: null }, { locale: 'en', title: 'Inactive translation', description: null }],
});
const draft = (overrides) => toPromotionDraft({ ...baseDraft(), ...overrides }, catalog);

test('each scope submits only eligible fields and preserves exact decimal strings', () => {
  const category = draft({ scope: 'CATEGORY', categoryIds: ['c1'], productIds: ['p1'], discountType: 'FIXED_AMOUNT', minimumSubtotal: '2.01' }).draft;
  // DEC-077 B1: the discount type is never forced; only the minimum is dropped for item scopes.
  assert.equal(category.discountType, 'FIXED_AMOUNT');
  assert.equal(category.minimumSubtotal, null);
  assert.deepEqual(category.categoryIds, ['c1']);
  assert.deepEqual(category.productIds, []);
  assert.equal(category.value, '20.15');
  assert.equal(category.internalName, 'Test');
  assert.deepEqual(category.translations, [{ locale: 'ar', title: 'خصم', description: null }]);
  assert.equal(draft({ scope: 'CATEGORY', categoryIds: ['c1'], discountType: 'PERCENTAGE' }).draft.discountType, 'PERCENTAGE');
  assert.equal(draft({ scope: 'MENU', menuIds: ['m1'], discountType: 'FIXED_AMOUNT' }).draft.discountType, 'FIXED_AMOUNT');
  assert.equal(draft({ scope: 'CART', discountType: 'FIXED_AMOUNT', minimumSubtotal: '2.01' }).draft.minimumSubtotal, '2.01');
  assert.deepEqual(draft({ scope: 'MENU', menuIds: ['m1'], categoryIds: ['c1'] }).draft.menuIds, ['m1']);
  assert.deepEqual(draft({ scope: 'CART', productIds: ['p1'], menuIds: ['m1'] }).draft.menuIds, []);
  assert.deepEqual(draft({ scope: 'CART', productIds: ['p1'] }).draft.productIds, ['p1']);
  assert.equal(draft({ scope: 'QUANTITY', minimumQuantity: '2', quantityBasis: 'DISTINCT_PRODUCTS' }).draft.minimumQuantity, 2);
  assert.deepEqual(draft({ scope: 'DELIVERY', deliveryZoneIds: ['zone-1'], branchIds: ['branch-1'] }).draft.deliveryZoneIds, ['zone-1']);
  assert.equal(draft({ scope: 'DELIVERY', deliveryZoneIds: ['zone-1'], branchIds: ['branch-2'] }).error, 'promotions.validation.zoneBranch');
  assert.equal(draft({ scope: 'CATEGORY' }).error, 'promotions.validation.targets');
  assert.equal(draft({ scope: 'QUANTITY' }).error, 'promotions.validation.minimumQuantity');
  assert.equal(draft({ value: '100.01' }).error, 'promotions.validation.value');
  assert.equal(normalizePromotionNumber('١٢٫٣۴'), '12.34');
});

test('the final-zone removal differs from narrowing and from additions', () => {
  const original = { ...baseDraft(), scope: 'DELIVERY', deliveryZoneIds: ['a', 'b'] };
  assert.deepEqual(widening(original, { ...original, deliveryZoneIds: ['a'] }), { zone: false, other: false });
  assert.deepEqual(widening(original, { ...original, deliveryZoneIds: [] }), { zone: true, other: false });
  assert.deepEqual(widening(original, { ...original, deliveryZoneIds: ['a', 'c'] }), { zone: false, other: true });
  assert.deepEqual(widening(original, { ...original, scope: 'CART' }), { zone: false, other: true });
  const cart = { ...baseDraft(), categoryIds: ['cat'], productIds: ['p1'] };
  assert.deepEqual(widening(cart, { ...cart, categoryIds: [] }), { zone: false, other: false });
  assert.deepEqual(widening(cart, { ...cart, categoryIds: [], productIds: [] }), { zone: false, other: true });
});

test('grant and feature combinations do not make structural controls available by role alone', () => {
  const membership = (permissions, feature, allBranches = false) => ({
    permissions, allBranches, role: 'OWNER', restaurant: { features: { PROMOTIONS: feature } },
  });
  assert.equal(canOpenPromotions(membership(['promotions.view'], true)), true);
  assert.equal(canOpenPromotions(membership(['promotions.manage'], true, true)), false);
  assert.equal(canOpenPromotions(membership(['promotions.view'], undefined)), false);
  assert.equal(canManagePromotions(membership(['promotions.view'], true, true)), false);
  assert.equal(canManagePromotions(membership(['promotions.view', 'promotions.manage'], true)), false);
  assert.equal(canManagePromotions(membership(['promotions.view', 'promotions.manage'], true, true)), true);
});

test('zone deep link and server preview use Staff API contracts, not Guest pricing', () => {
  const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const workspace = '../../app/staff/restaurants/[restaurantId]/menu/promotions/';
  assert.match(source(`${workspace}page.tsx`), /initialZoneId=\{zone\}/);
  assert.match(source('./api.ts'), /query\.set\('zoneId', filters\.zoneId\)/);
  assert.match(source('./api.ts'), /base\(restaurantId\)\}\/preview/);
  assert.match(source('./api.ts'), /confirmTargetWidening: true/);
  assert.match(source('./api.ts'), /expectedUpdatedAt: original\.updatedAt/);
  assert.match(source(`${workspace}PromotionEditor.tsx`), /mustConfirm && !confirmWiden/);
  assert.match(source(`${workspace}SavingsPreview.tsx`), /result\.appliedSaving/);
  assert.match(source(`${workspace}SavingsPreview.tsx`), /diagnostic\.status/);
  assert.match(source(`${workspace}SavingsPreview.tsx`), /result\.zoneMinimumShortfall/);
});

const storedFixed = (overrides = {}) => ({
  id: 'promo-1', status: 'ACTIVE', updatedAt: '2026-11-26T10:00:00.000Z', createdAt: '2026-11-26T10:00:00.000Z', archivedAt: null, canDelete: true,
  internalName: 'Pizza 70 off', scope: 'CATEGORY', discountType: 'FIXED_AMOUNT', value: '70.00', priority: 7,
  startsOn: null, endsOn: null, minimumSubtotal: null, minimumQuantity: null, quantityBasis: null,
  branchIds: [], menuIds: [], categoryIds: ['c1'], productIds: [], deliveryZoneIds: [],
  translations: [{ locale: 'ar', title: 'بيتزا', description: null }],
  ...overrides,
});

test('a stored fixed item promotion reaches the API unchanged, even while new fixed item promotions are not allowed', () => {
  for (const scope of ['CATEGORY', 'MENU']) {
    const original = storedFixed({ scope, categoryIds: scope === 'CATEGORY' ? ['c1'] : [], menuIds: scope === 'MENU' ? ['m1'] : [] });
    // the write gate is OFF in this catalog: the form must still keep the stored type and value
    const result = toPromotionDraft(blankDraft(original), { ...catalog, fixedItemScopeEnabled: false });
    assert.equal(result.error, undefined);
    assert.equal(result.draft.discountType, 'FIXED_AMOUNT');
    assert.equal(result.draft.value, '70.00');
    assert.equal(result.draft.priority, 7, 'existing priority is preserved');
    assert.equal(result.draft.minimumSubtotal, null);
    assert.equal(changesDiscountType(original, blankDraft(original)), false, 'an untouched form never asks for a type confirmation');
  }
});

test('discount-type support is separate from minimum-subtotal applicability', () => {
  assert.deepEqual(['CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY'].map(supportsMinimumSubtotal), [false, false, true, true, true]);
  assert.equal(draft({ scope: 'MENU', menuIds: ['m1'], discountType: 'FIXED_AMOUNT', minimumSubtotal: '10' }).draft.minimumSubtotal, null);
  assert.equal(draft({ scope: 'DELIVERY', discountType: 'PERCENTAGE', minimumSubtotal: '10' }).draft.minimumSubtotal, '10');
});

test('fixed is offered for item scopes only while writes are enabled, or to keep an existing fixed promotion', () => {
  assert.equal(canOfferFixed('CART', false, null), true);
  assert.equal(canOfferFixed('DELIVERY', false, null), true);
  assert.equal(canOfferFixed('CATEGORY', false, null), false);
  assert.equal(canOfferFixed('CATEGORY', true, null), true);
  assert.equal(canOfferFixed('CATEGORY', false, storedFixed()), true, 'keeps the stored fixed type selectable');
  assert.equal(canOfferFixed('MENU', false, storedFixed()), false, 'a different item scope is a new fixed item promotion');
  assert.equal(isFixedItem(storedFixed({ scope: 'CART' })), false);
  assert.equal(isFixedItem(null), false);
});

test('a type change of an existing promotion needs the explicit confirmation flag, in every scope', () => {
  const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const workspace = '../../app/staff/restaurants/[restaurantId]/menu/promotions/';
  for (const scope of ['CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY']) {
    const original = storedFixed({ scope, discountType: 'PERCENTAGE', value: '10.00' });
    assert.equal(changesDiscountType(original, { discountType: 'FIXED_AMOUNT' }), true);
    assert.equal(changesDiscountType(original, { discountType: 'PERCENTAGE' }), false);
  }
  assert.equal(changesDiscountType(null, { discountType: 'FIXED_AMOUNT' }), false, 'a new promotion has nothing to confirm');
  assert.match(source('./api.ts'), /confirmDiscountTypeChange: true/);
  assert.match(source(`${workspace}PromotionEditor.tsx`), /mustConfirmType && !confirmType/);
  assert.match(source(`${workspace}PromotionEditor.tsx`), /PROMOTION_DISCOUNT_TYPE_CHANGE_CONFIRMATION_REQUIRED/);
});
