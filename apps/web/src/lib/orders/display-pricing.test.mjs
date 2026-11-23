import assert from 'node:assert/strict';
import test from 'node:test';
import { orderDisplayPricing, orderItemDisplayPricing } from './display-pricing.ts';
import { toMinorUnits } from '../public-menu/money.ts';

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
    legacyDiscount: '0.00',
    merchandisePromotions: [merchandisePromotion],
    deliveryFee: '30.00',
    deliveryDiscount: { title: 'خصم المنطقة', amount: '30.00' },
  });
});

test('keeps existing display for responses lacking snapshots and for undiscounted delivery fees', () => {
  const expected = {
    hasDiscount: true,
    grossSubtotal: '200.00',
    legacyDiscount: '40.00',
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

test('reconciles the same Guest and Staff snapshots with named and legacy deductions shown exactly once', () => {
  const order = {
    type: 'DELIVERY',
    subtotal: '150.01',
    discountTotal: '49.99',
    deliveryFeeOriginal: '30.00',
    deliveryDiscount: '10.01',
    deliveryFee: '19.99',
    total: '170.00',
    promotions: [
      { scope: 'CATEGORY', title: 'Mains special', amount: '29.99' },
      { scope: 'DELIVERY', title: 'خصم المنطقة', amount: '10.01' },
    ],
    items: [
      { lineTotal: '100.00', discountAmount: '0.00', promotionDiscount: '29.99' },
      { lineTotal: '80.00', discountAmount: '20.00' },
    ],
  };
  const pricing = orderDisplayPricing({ ...order, subtotalAmount: order.subtotal });
  const lines = order.items.map(orderItemDisplayPricing);
  assert.deepEqual(lines, [
    { grossLineTotal: '100.00', netLineTotal: '70.01', hasDiscount: true },
    { grossLineTotal: '100.00', netLineTotal: '80.00', hasDiscount: true },
  ]);
  assert.deepEqual(pricing.merchandisePromotions, [order.promotions[0]]);
  assert.equal(pricing.legacyDiscount, '20.00');
  assert.deepEqual(pricing.deliveryDiscount, { title: 'خصم المنطقة', amount: '10.01' });
  assert.equal(lines.reduce((sum, line) => sum + toMinorUnits(line.netLineTotal), 0n), toMinorUnits(order.subtotal));
  assert.equal(
    toMinorUnits(pricing.grossSubtotal) - toMinorUnits(pricing.legacyDiscount) -
      toMinorUnits(pricing.merchandisePromotions[0].amount) +
      toMinorUnits(pricing.deliveryFee) - toMinorUnits(pricing.deliveryDiscount.amount),
    toMinorUnits(order.total),
  );
});

test('renders unchanged Offer and legacy line snapshots without inventing promotion savings', () => {
  assert.deepEqual(orderItemDisplayPricing({ lineTotal: '120.00', discountAmount: '0.00' }), {
    grossLineTotal: '120.00', netLineTotal: '120.00', hasDiscount: false,
  });
  assert.deepEqual(orderItemDisplayPricing({ lineTotal: '85.00', discountAmount: '20.00' }), {
    grossLineTotal: '105.00', netLineTotal: '85.00', hasDiscount: true,
  });
});
