import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicMenuCopy } from './copy.ts';
import { cheapestMenuSize, menuItemPrice } from './menu-item-price.ts';
import { perKiloPrice } from './meat-lovers-weight.ts';

const product = {
  availability: 'AVAILABLE',
  basePrice: '100.00',
  discount: { type: 'PERCENTAGE', value: '10.00', amountOff: '10.00', discountedPrice: '90.00' },
};
const category = { scope: 'CATEGORY', type: 'PERCENTAGE', value: '20.00', amountOff: '20.00', previewPrice: null };
const legacy = { scope: 'PRODUCT', type: 'PERCENTAGE', value: '10.00', amountOff: '10.00', previewPrice: '90.00' };

test('keeps ordinary Product Discount display when unified previews are not enabled', () => {
  assert.deepEqual(menuItemPrice(product), {
    original: '100.00', current: '90.00', discounted: true, preview: false, badge: product.discount, promotion: null,
  });
});

test('renders the server winner as a preview, not a discount applied to the listed price', () => {
  assert.deepEqual(menuItemPrice({ ...product, itemPromotion: category }), {
    original: '100.00', current: '100.00', discounted: false, preview: false, badge: null, promotion: category,
  });
  assert.deepEqual(menuItemPrice({ ...product, itemPromotion: legacy }), {
    original: '100.00', current: '90.00', discounted: true, preview: true, badge: null, promotion: legacy,
  });
  assert.equal(menuItemPrice({ ...product, itemPromotion: legacy }, null, false).current, '100.00');
  assert.equal(menuItemPrice({ ...product, itemPromotion: null }).current, '100.00');
  assert.equal(menuItemPrice({ ...product, itemPromotion: category, availability: 'SOLD_OUT' }).promotion, null);
});

test('anchors From and per-kilo labels to the resolved display size instead of borrowing a different size’s discount', () => {
  const small = { id: 'small', name: '500 g', price: '60.00', discountedPrice: null, itemPromotion: null };
  const kilo = { id: 'large', name: '1 kg', price: '100.00', discountedPrice: '40.00', itemPromotion: category };
  const withSizes = { ...product, itemPromotion: null, variants: [kilo, small] };
  assert.equal(cheapestMenuSize(withSizes), small);
  assert.equal(menuItemPrice(withSizes, small).promotion, null);
  const byWeight = menuItemPrice(withSizes, perKiloPrice(withSizes));
  assert.equal(byWeight.current, '100.00');
  assert.equal(byWeight.promotion, category);
  assert.equal(cheapestMenuSize({ ...withSizes, itemPromotion: undefined }), kilo);
});

test('preview labels explicitly qualify savings in English and Arabic', () => {
  const en = getPublicMenuCopy('en');
  const ar = getPublicMenuCopy('ar');
  assert.equal(en.possiblePromotionPercent('20'), 'Possible 20% off');
  assert.equal(en.possiblePromotionAmount('5', 'EGP'), 'Possible 5 EGP off');
  assert.equal(ar.possiblePromotionPercent('20'), 'خصم محتمل 20%');
  assert.equal(ar.possiblePromotionAmount('5', 'ج.م.'), 'خصم محتمل 5 ج.م.');
});
