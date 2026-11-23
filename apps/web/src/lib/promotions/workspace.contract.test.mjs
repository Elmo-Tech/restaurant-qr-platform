import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankDraft, normalizePromotionNumber, toPromotionDraft, widening } from './draft.ts';
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
  assert.equal(category.discountType, 'PERCENTAGE');
  assert.equal(category.minimumSubtotal, null);
  assert.deepEqual(category.categoryIds, ['c1']);
  assert.deepEqual(category.productIds, []);
  assert.equal(category.value, '20.15');
  assert.equal(category.internalName, 'Test');
  assert.deepEqual(category.translations, [{ locale: 'ar', title: 'خصم', description: null }]);
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
  assert.match(source(`${workspace}SavingsPreview.tsx`), /money\(result\.appliedSaving\)/);
  assert.match(source(`${workspace}SavingsPreview.tsx`), /result\.diagnostic\.status/);
  assert.match(source(`${workspace}SavingsPreview.tsx`), /result\.zoneMinimumShortfall/);
});
