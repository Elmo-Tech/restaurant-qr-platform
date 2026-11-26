import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankDraft, canOfferFixed, cartMinimumProblem, changesDiscountType, isFixedItem, normalizePromotionNumber, requiresCartMinimum, supportsMinimumSubtotal, toPromotionDraft, widening } from './draft.ts';
import { canManagePromotions, canOpenPromotions } from './capabilities.ts';

const catalog = {
  defaultLocale: 'ar', activeLocales: ['ar'], branches: [], menus: [], categories: [], products: [],
  deliveryZones: [{ id: 'zone-1', branchId: 'branch-1' }],
};
const baseDraft = () => ({
  ...blankDraft(null), internalName: '  Test  ', value: '20.15', minimumSubtotal: '100',
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
  needsMinimumSubtotal: false, id: 'promo-1', status: 'ACTIVE', updatedAt: '2026-11-26T10:00:00.000Z', createdAt: '2026-11-26T10:00:00.000Z', archivedAt: null, canDelete: true,
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

const storedCart = (overrides = {}) => storedFixed({ scope: 'CART', discountType: 'PERCENTAGE', value: '10.00', categoryIds: [], minimumSubtotal: '200.00', priority: 100, ...overrides });
const legacyCart = (minimumSubtotal = null) => storedCart({ minimumSubtotal, needsMinimumSubtotal: true });

test('DEC-077 B2: a new CART promotion needs a minimum above 0, with the same rule the Backend applies', () => {
  const cart = (minimumSubtotal, original = null) => draft_(minimumSubtotal, original);
  function draft_(minimumSubtotal, original) {
    return toPromotionDraft({ ...baseDraft(), scope: 'CART', minimumSubtotal }, catalog, original);
  }
  assert.equal(cart('').error, 'promotions.validation.minimumSubtotalRequired');
  assert.equal(cart('   ').error, 'promotions.validation.minimumSubtotalRequired');
  for (const zero of ['0', '0.0', '0.00', normalizePromotionNumber('٠٫٠٠')]) assert.equal(cart(zero).error, 'promotions.validation.minimumSubtotalPositive', zero);
  for (const malformed of ['-5', '100.005', 'abc', '1e3']) assert.equal(cart(malformed).error, 'promotions.validation.minimumSubtotal', malformed);
  for (const valid of ['0.01', '200', '200.00', '199.99']) assert.equal(cart(valid).draft.minimumSubtotal, valid);
  // the Arabic keyboard value reaches the form already normalized; the rule still accepts the normalized form
  assert.equal(cart(normalizePromotionNumber('٢٠٠٫٠٠')).draft.minimumSubtotal, '200.00');
  // other scopes keep their optional minimum and item scopes send none
  assert.equal(draft({ scope: 'DELIVERY', minimumSubtotal: '' }).draft.minimumSubtotal, null);
  assert.equal(draft({ scope: 'QUANTITY', minimumQuantity: '2', minimumSubtotal: '0' }).draft.minimumSubtotal, '0');
  assert.equal(draft({ scope: 'CATEGORY', categoryIds: ['c1'], minimumSubtotal: '' }).draft.minimumSubtotal, null);
  assert.deepEqual(['CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY'].map((scope) => requiresCartMinimum(scope, null)), [false, false, true, false, false]);
});

test('DEC-077 B2: a stored legacy CART promotion is never blocked client-side; the Backend compares stored and requested values', () => {
  for (const stored of [null, '0.00']) {
    const original = legacyCart(stored);
    assert.equal(requiresCartMinimum('CART', original), false);
    // a whole-form save that re-sends the stored values reaches the API untouched (no minimum invented)
    const unchanged = toPromotionDraft(blankDraft(original), catalog, original);
    assert.equal(unchanged.error, undefined);
    assert.equal(unchanged.draft.minimumSubtotal, stored);
    assert.equal(unchanged.draft.priority, 100, 'existing priority is preserved');
    assert.equal(cartMinimumProblem({ scope: 'CART', minimumSubtotal: '' }, original), null);
  }
  // once it has a valid minimum it is a regular CART promotion again
  assert.equal(requiresCartMinimum('CART', storedCart()), true);
  assert.equal(toPromotionDraft({ ...blankDraft(storedCart()), minimumSubtotal: '' }, catalog, storedCart()).error, 'promotions.validation.minimumSubtotalRequired');
  // moving a promotion to CART from another scope is a new CART promotion
  assert.equal(requiresCartMinimum('CART', storedFixed({ scope: 'DELIVERY' })), true);
  // an archived legacy row never reports the need
  assert.equal(requiresCartMinimum('CART', legacyCart(null)), false);
});

test('DEC-077 B2: an invalid new CART draft cannot look ready to save, and its preview carries no figure', async () => {
  const { planSavingsPreview } = await import('./savings-preview.ts');
  const fieldsFor = (minimumSubtotal, original = null) => planSavingsPreview({ ...baseDraft(), scope: 'CART', minimumSubtotal }, catalog, original);
  assert.deepEqual(fieldsFor(''), { kind: 'incomplete', reason: 'MINIMUM_SUBTOTAL' });
  assert.deepEqual(fieldsFor('0.00'), { kind: 'incomplete', reason: 'MINIMUM_SUBTOTAL' });
  assert.notEqual(fieldsFor('50').kind, 'incomplete');
  // a stored legacy promotion keeps its (unchanged contract) preview
  assert.notEqual(fieldsFor('', legacyCart(null)).kind, 'incomplete');
  const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const editor = source('../../app/staff/restaurants/[restaurantId]/menu/promotions/PromotionEditor.tsx');
  assert.match(editor, /minimumProblem !== null \|\| \(mustConfirm/, 'the save button is disabled while the minimum is invalid');
  assert.match(editor, /aria-invalid=\{minimumProblem !== null/);
  assert.match(editor, /original\.needsMinimumSubtotal === true/, 'the legacy notice uses the read-model field');
  assert.match(editor, /toPromotionDraft\(fields, targets, original\)/);
});

test('DEC-077 B2: both refusal codes of the Backend and every new message exist in English and Arabic', () => {
  const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const errors = source('./errors.ts');
  for (const code of ['MINIMUM_SUBTOTAL_REQUIRED', 'MINIMUM_SUBTOTAL_NOT_POSITIVE']) {
    assert.match(errors, new RegExp(`hasProblem\\(caught, '${code}'\\)\\) return 'error\\.${code}'`));
  }
  const text = source('../i18n/messages/promotions.ts');
  const arabicStart = text.indexOf("'promotions.title'", text.indexOf("'promotions.title'") + 1);
  assert.ok(arabicStart > 0, 'the Arabic catalog follows the English one');
  const [english, arabic] = [text.slice(0, arabicStart), text.slice(arabicStart)];
  for (const key of ['promotions.minimumSubtotalRequired', 'promotions.minimumSubtotalHint', 'promotions.legacyMinimumNotice',
    'promotions.validation.minimumSubtotalRequired', 'promotions.validation.minimumSubtotalPositive',
    'error.MINIMUM_SUBTOTAL_REQUIRED', 'error.MINIMUM_SUBTOTAL_NOT_POSITIVE']) {
    assert.ok(english.includes(`'${key}': '`), `en ${key}`);
    const line = arabic.split('\n').find((entry) => entry.includes(`'${key}': '`));
    assert.ok(line && /[\u0600-\u06FF]/.test(line), `ar ${key}`);
  }
});
