import { Prisma } from '../generated/prisma/client';
import type { ProductDiscountConfig } from '../menu/product-discount';
import {
  evaluatePromotions,
  type EngineContext,
  type EngineLine,
  type EngineProductLine,
  type EnginePromotion,
} from './promotion-engine';
import {
  buildOrderPricingSnapshot,
  checkOrderPricingSnapshot,
  type OrderPricingSnapshot,
} from './promotion-snapshot';

/**
 * The persisted-row examples of UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md:
 * (a) 170 EGP cart win, (b) 180 EGP item win, (c) CATEGORY beats a legacy
 * discount on one line, (d) no promotion configured (legacy-identical rows).
 */

const d = (value: string) => new Prisma.Decimal(value);
const s = (value: Prisma.Decimal | null) => (value ? value.toFixed(2) : null);

function product(
  index: number,
  overrides: Partial<EngineProductLine> = {},
): EngineProductLine {
  return {
    index,
    kind: 'PRODUCT',
    productId: `prod-${index}`,
    categoryId: 'cat-a',
    menuId: 'menu-1',
    variantId: null,
    sizeDiscountApplies: true,
    quantity: 1,
    unitPrice: d('100.00'),
    modifiersUnitTotal: d('0.00'),
    productDiscount: null,
    ...overrides,
  };
}

const legacy20: ProductDiscountConfig = {
  type: 'PERCENTAGE',
  value: d('20'),
  enabled: true,
  startsOn: null,
  endsOn: null,
};

function promo(
  id: string,
  scope: EnginePromotion['scope'],
  discountType: EnginePromotion['discountType'],
  value: string,
  overrides: Partial<EnginePromotion> = {},
): EnginePromotion {
  return {
    id,
    scope,
    discountType,
    value: d(value),
    status: 'ACTIVE',
    priority: 100,
    startsOn: null,
    endsOn: null,
    minimumSubtotal: null,
    minimumQuantity: null,
    quantityBasis: null,
    branchIds: [],
    menuIds: [],
    categoryIds: scope === 'CATEGORY' ? ['cat-a'] : [],
    productIds: [],
    deliveryZoneIds: [],
    ...overrides,
  };
}

const deliveryCtx: EngineContext = {
  today: '2026-11-21',
  branchId: 'branch-1',
  orderType: 'DELIVERY',
  deliveryZoneId: 'zone-1',
  deliveryFee: d('30.00'),
};
const dineInCtx: EngineContext = {
  ...deliveryCtx,
  orderType: 'DINE_IN',
  deliveryZoneId: null,
  deliveryFee: null,
};

function snapshotOf(
  lines: EngineLine[],
  promotions: EnginePromotion[],
  context: EngineContext,
): OrderPricingSnapshot {
  const result = evaluatePromotions({ lines, promotions, context });
  const labels = new Map(
    promotions.map((p) => [
      p.id,
      { internalName: `internal ${p.id}`, title: `title ${p.id}` },
    ]),
  );
  const snapshot = buildOrderPricingSnapshot({
    result,
    promotions,
    labels,
    orderType: context.orderType,
  });
  expect(checkOrderPricingSnapshot(snapshot)).toEqual([]);
  return snapshot;
}

const orderRow = (snapshot: OrderPricingSnapshot) => ({
  subtotal: s(snapshot.order.subtotalAmount),
  discountTotal: s(snapshot.order.discountTotalAmount),
  promotionDiscount: s(snapshot.order.promotionDiscountAmount),
  feeOriginal: s(snapshot.order.deliveryFeeOriginalAmount),
  deliveryDiscount: s(snapshot.order.deliveryDiscountAmount),
  fee: s(snapshot.order.deliveryFeeAmount),
  total: s(snapshot.order.totalAmount),
});
const itemRows = (snapshot: OrderPricingSnapshot) =>
  snapshot.items.map((item) => ({
    lineTotal: s(item.lineTotal),
    discount: s(item.discountAmount),
    type: item.discountTypeSnapshot,
    value: s(item.discountValueSnapshot),
  }));
const promotionRows = (snapshot: OrderPricingSnapshot) =>
  snapshot.promotions.map((p) => ({
    id: p.promotionId,
    scope: p.scope,
    amount: s(p.amount),
    allocations: p.allocations.map((a) => [a.lineIndex, s(a.amount)]),
  }));

const twoLegacyLines = () => [
  product(0, { productDiscount: legacy20 }),
  product(1, { productDiscount: legacy20 }),
];
const deliveryMinus10 = promo('dlv10', 'DELIVERY', 'FIXED_AMOUNT', '10.00');

describe('buildOrderPricingSnapshot — documented rows', () => {
  it('(a) 170 EGP: CART fixed 50 wins, no legacy discount on any line, delivery 30 - 10', () => {
    const snapshot = snapshotOf(
      twoLegacyLines(),
      [promo('cart50', 'CART', 'FIXED_AMOUNT', '50.00'), deliveryMinus10],
      deliveryCtx,
    );
    expect(orderRow(snapshot)).toEqual({
      subtotal: '150.00',
      discountTotal: '50.00',
      promotionDiscount: '50.00',
      feeOriginal: '30.00',
      deliveryDiscount: '10.00',
      fee: '20.00',
      total: '170.00',
    });
    expect(itemRows(snapshot)).toEqual([
      { lineTotal: '100.00', discount: '0.00', type: null, value: null },
      { lineTotal: '100.00', discount: '0.00', type: null, value: null },
    ]);
    expect(promotionRows(snapshot)).toEqual([
      {
        id: 'cart50',
        scope: 'CART',
        amount: '50.00',
        allocations: [
          [0, '25.00'],
          [1, '25.00'],
        ],
      },
      { id: 'dlv10', scope: 'DELIVERY', amount: '10.00', allocations: [] },
    ]);
    expect(snapshot.promotions[0].internalNameSnapshot).toBe('internal cart50');
    expect(snapshot.promotions[0].configSnapshot.value).toBe('50.00');
  });

  it('(b) 180 EGP: item path wins, legacy discounts on order_items, no merchandise promotion row', () => {
    const snapshot = snapshotOf(
      twoLegacyLines(),
      [promo('cart15', 'CART', 'PERCENTAGE', '15'), deliveryMinus10],
      deliveryCtx,
    );
    expect(orderRow(snapshot)).toEqual({
      subtotal: '160.00',
      discountTotal: '40.00',
      promotionDiscount: '0.00',
      feeOriginal: '30.00',
      deliveryDiscount: '10.00',
      fee: '20.00',
      total: '180.00',
    });
    expect(itemRows(snapshot)).toEqual([
      {
        lineTotal: '80.00',
        discount: '20.00',
        type: 'PERCENTAGE',
        value: '20.00',
      },
      {
        lineTotal: '80.00',
        discount: '20.00',
        type: 'PERCENTAGE',
        value: '20.00',
      },
    ]);
    expect(promotionRows(snapshot)).toEqual([
      { id: 'dlv10', scope: 'DELIVERY', amount: '10.00', allocations: [] },
    ]);
  });

  it('(c) CATEGORY 30% beats the legacy 20% on line 0 only; line 1 (other category) keeps its legacy discount', () => {
    const snapshot = snapshotOf(
      [
        product(0, { productDiscount: legacy20 }),
        product(1, {
          categoryId: 'cat-b',
          quantity: 2,
          unitPrice: d('50.00'),
          productDiscount: legacy20,
        }),
      ],
      [promo('cat30', 'CATEGORY', 'PERCENTAGE', '30')],
      dineInCtx,
    );
    expect(orderRow(snapshot)).toEqual({
      subtotal: '150.00',
      discountTotal: '50.00',
      promotionDiscount: '30.00',
      feeOriginal: null,
      deliveryDiscount: '0.00',
      fee: '0.00',
      total: '150.00',
    });
    expect(itemRows(snapshot)).toEqual([
      // beaten legacy discount is NOT stored on the line
      { lineTotal: '100.00', discount: '0.00', type: null, value: null },
      {
        lineTotal: '80.00',
        discount: '20.00',
        type: 'PERCENTAGE',
        value: '20.00',
      },
    ]);
    expect(promotionRows(snapshot)).toEqual([
      {
        id: 'cat30',
        scope: 'CATEGORY',
        amount: '30.00',
        allocations: [[0, '30.00']],
      },
    ]);
  });

  it('(d) no promotion configured: rows identical to Product Discounts V1 (no promotion rows, new columns 0 / NULL)', () => {
    const snapshot = snapshotOf(
      [
        product(0, {
          productDiscount: legacy20,
          modifiersUnitTotal: d('5.00'),
        }),
        { index: 1, kind: 'OFFER', quantity: 1, offerUnitTotal: d('120.00') },
      ],
      [],
      dineInCtx,
    );
    expect(orderRow(snapshot)).toEqual({
      subtotal: '205.00',
      discountTotal: '20.00',
      promotionDiscount: '0.00',
      feeOriginal: null,
      deliveryDiscount: '0.00',
      fee: '0.00',
      total: '205.00',
    });
    expect(itemRows(snapshot)).toEqual([
      {
        lineTotal: '85.00',
        discount: '20.00',
        type: 'PERCENTAGE',
        value: '20.00',
      },
      { lineTotal: '120.00', discount: '0.00', type: null, value: null },
    ]);
    expect(snapshot.promotions).toEqual([]);
  });

  it('a delivery order without a delivery promotion still records the original fee', () => {
    const snapshot = snapshotOf([product(0)], [], deliveryCtx);
    expect(orderRow(snapshot)).toMatchObject({
      feeOriginal: '30.00',
      deliveryDiscount: '0.00',
      fee: '30.00',
      total: '130.00',
    });
  });

  it.each([
    ['0.00', '100.00'],
    ['0.01', '100.01'],
  ])(
    'records the %s EGP original fee without a zero-amount delivery promotion row',
    (fee, total) => {
      const snapshot = snapshotOf(
        [product(0)],
        [promo('dlv-1pct', 'DELIVERY', 'PERCENTAGE', '1')],
        { ...deliveryCtx, deliveryFee: d(fee) },
      );
      expect(orderRow(snapshot)).toMatchObject({
        feeOriginal: fee,
        deliveryDiscount: '0.00',
        fee,
        total,
      });
      expect(snapshot.promotions).toEqual([]);
    },
  );

  it('records only the positive rounded delivery saving with no line allocations', () => {
    const snapshot = snapshotOf(
      [product(0)],
      [
        promo('dlv-1pct', 'DELIVERY', 'PERCENTAGE', '1'),
        promo('dlv-50pct', 'DELIVERY', 'PERCENTAGE', '50'),
      ],
      { ...deliveryCtx, deliveryFee: d('0.01') },
    );
    expect(orderRow(snapshot)).toEqual({
      subtotal: '100.00',
      discountTotal: '0.00',
      promotionDiscount: '0.00',
      feeOriginal: '0.01',
      deliveryDiscount: '0.01',
      fee: '0.00',
      total: '100.00',
    });
    expect(promotionRows(snapshot)).toEqual([
      { id: 'dlv-50pct', scope: 'DELIVERY', amount: '0.01', allocations: [] },
    ]);
  });

  it('cart allocations with a zero share are not persisted (every allocation row is > 0)', () => {
    const snapshot = snapshotOf(
      [
        product(0, { unitPrice: d('0.01') }),
        product(1, { unitPrice: d('99.99') }),
      ],
      [promo('cart-cent', 'CART', 'FIXED_AMOUNT', '0.01')],
      dineInCtx,
    );
    expect(promotionRows(snapshot)[0].allocations).toEqual([[1, '0.01']]);
  });
});

describe('checkOrderPricingSnapshot — detects broken rows', () => {
  const valid = () =>
    snapshotOf(
      twoLegacyLines(),
      [promo('cart50', 'CART', 'FIXED_AMOUNT', '50.00'), deliveryMinus10],
      deliveryCtx,
    );

  it('flags a total that is not subtotal + fee', () => {
    const snapshot = valid();
    snapshot.order.totalAmount = d('171.00');
    expect(checkOrderPricingSnapshot(snapshot)).toContain(
      'subtotal + delivery fee != total',
    );
  });

  it('flags allocations that do not reconcile with the subtotal / promotion amount', () => {
    const snapshot = valid();
    snapshot.promotions[0].allocations[0].amount = d('24.99');
    const problems = checkOrderPricingSnapshot(snapshot);
    expect(problems).toContain(
      'sum(line_total) - sum(allocations) != subtotal',
    );
    expect(problems).toContain('allocations of cart50 != its amount');
  });

  it('flags a discount_total that is not legacy + promotion discounts', () => {
    const snapshot = valid();
    snapshot.order.discountTotalAmount = d('90.00');
    expect(checkOrderPricingSnapshot(snapshot)).toContain(
      'legacy line discounts + promotion discount != discount_total',
    );
  });

  it('flags a delivery fee that is not original - discount, and a discount without an original fee', () => {
    const snapshot = valid();
    snapshot.order.deliveryFeeAmount = d('30.00');
    expect(checkOrderPricingSnapshot(snapshot)).toContain(
      'original fee - delivery discount != delivery fee',
    );
    const pickup = valid();
    pickup.order.deliveryFeeOriginalAmount = null;
    expect(checkOrderPricingSnapshot(pickup)).toContain(
      'delivery discount without an original fee',
    );
  });

  it('flags a legacy snapshot without an amount', () => {
    const snapshot = valid();
    snapshot.items[0].discountTypeSnapshot = 'PERCENTAGE';
    expect(checkOrderPricingSnapshot(snapshot)).toContain(
      'line 0: legacy snapshot without amount',
    );
  });

  it('refuses to build without a label for an applied promotion', () => {
    const result = evaluatePromotions({
      lines: [product(0)],
      promotions: [promo('cart', 'CART', 'PERCENTAGE', '10')],
      context: dineInCtx,
    });
    expect(() =>
      buildOrderPricingSnapshot({
        result,
        promotions: [promo('cart', 'CART', 'PERCENTAGE', '10')],
        labels: new Map(),
        orderType: 'DINE_IN',
      }),
    ).toThrow();
  });
});
