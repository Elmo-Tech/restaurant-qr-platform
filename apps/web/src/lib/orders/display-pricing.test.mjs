import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDisplayPricing } from './display-pricing.ts';

const legacyDelivery = {
  type: 'DELIVERY',
  subtotalAmount: '160.00',
  discountTotal: '40.00',
  deliveryFee: '30.00',
};

const deliveryPromotion = { scope: 'DELIVERY', title: 'خصم المنطقة', amount: '30.00' };

test('presents the historical merchandise and delivery reductions separately, even when delivery is free', () => {
  const merchandisePromotion = { scope: 'CART', title: 'Cart saving', amount: '49.99' };
  assert.deepEqual(orderDisplayPricing({
    ...legacyDelivery,
    subtotalAmount: '150.01',
    discountTotal: '49.99',
    deliveryFee: '0.00',
    deliveryFeeOriginal: '30.00',
    deliveryDiscount: '30.00',
    promotions: [merchandisePromotion, deliveryPromotion],
  }), {
    hasDiscount: true,
    grossSubtotal: '200.00',
    merchandisePromotions: [merchandisePromotion],
    deliveryFee: '30.00',
    deliveryDiscount: { title: 'خصم المنطقة', amount: '30.00' },
  });
});

test('keeps existing display for responses lacking snapshots and for undiscounted delivery fees', () => {
  const expected = {
    hasDiscount: true,
    grossSubtotal: '200.00',
    merchandisePromotions: [],
    deliveryFee: '30.00',
    deliveryDiscount: null,
  };
  assert.deepEqual(orderDisplayPricing(legacyDelivery), expected);
  assert.deepEqual(orderDisplayPricing({
    ...legacyDelivery,
    deliveryFeeOriginal: '30.00',
    deliveryDiscount: '0.00',
    promotions: [],
  }), expected);
});
