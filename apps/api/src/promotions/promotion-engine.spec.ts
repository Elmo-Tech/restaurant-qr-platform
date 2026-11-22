import { Prisma } from '../generated/prisma/client';
import {
  localDateIn,
  type ProductDiscountConfig,
} from '../menu/product-discount';
import {
  allocateProportionally,
  evaluatePromotions,
  validatePromotionInput,
  type EngineContext,
  type EngineLine,
  type EngineOfferLine,
  type EngineProductLine,
  type EnginePromotion,
  type EngineResult,
  type PromotionInput,
} from './promotion-engine';
import {
  buildOrderPricingSnapshot,
  checkOrderPricingSnapshot,
} from './promotion-snapshot';

const d = (value: string) => new Prisma.Decimal(value);
const s = (value: Prisma.Decimal) => value.toFixed(2);
const TODAY = '2026-11-21';

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

function offer(
  index: number,
  unitTotal: string,
  quantity = 1,
): EngineOfferLine {
  return { index, kind: 'OFFER', quantity, offerUnitTotal: d(unitTotal) };
}

function legacy(
  type: 'PERCENTAGE' | 'FIXED_AMOUNT',
  value: string,
  overrides: Partial<ProductDiscountConfig> = {},
): ProductDiscountConfig {
  return {
    type,
    value: d(value),
    enabled: true,
    startsOn: null,
    endsOn: null,
    ...overrides,
  };
}

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
    menuIds: scope === 'MENU' ? ['menu-1'] : [],
    categoryIds: scope === 'CATEGORY' ? ['cat-a'] : [],
    productIds: [],
    deliveryZoneIds: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    today: TODAY,
    branchId: 'branch-1',
    orderType: 'DINE_IN',
    deliveryZoneId: null,
    deliveryFee: null,
    ...overrides,
  };
}

const delivery = (fee = '30.00', zone = 'zone-1') =>
  ctx({ orderType: 'DELIVERY', deliveryZoneId: zone, deliveryFee: d(fee) });

function run(
  lines: EngineLine[],
  promotions: EnginePromotion[] = [],
  context: EngineContext = ctx(),
): EngineResult {
  const result = evaluatePromotions({ lines, promotions, context });
  // EVERY scenario must reconcile (engine identities + persisted snapshot rules).
  expectConsistent(result, promotions, context);
  return result;
}

function statusOf(result: EngineResult, id: string) {
  const found = result.evaluations.find((e) => e.promotionId === id);
  if (!found) throw new Error(`no evaluation for ${id}`);
  return found;
}

const sumOf = (values: Prisma.Decimal[]) =>
  values.reduce((acc, value) => acc.plus(value), d('0'));
/** The new-promotion share of one line (CATEGORY / MENU / CART / QUANTITY). */
const alloc = (line: EngineResult['lines'][number]) =>
  s(sumOf(line.promotionAllocations.map((a) => a.amount)));

/**
 * The reconciliation identities of the accepted snapshot model:
 *   sum(lineTotal) - sum(allocations) = merchandisePayable
 *   merchandisePayable + net delivery fee = grandTotal
 *   merchandiseOriginal - legacy - new promotions = merchandisePayable  (discount_total identity)
 *   legacy only when the item strategy won and the legacy discount won that line
 *   nothing negative, every allocation > 0 and within its line
 * plus the persisted-row rules of `checkOrderPricingSnapshot`.
 */
function expectConsistent(
  result: EngineResult,
  promotions: EnginePromotion[],
  context: EngineContext,
) {
  const lineTotals = sumOf(result.lines.map((l) => l.lineTotal));
  const allocations = result.lines.flatMap((l) => l.promotionAllocations);
  const allocated = sumOf(allocations.map((a) => a.amount));
  expect(s(lineTotals.minus(allocated))).toBe(s(result.merchandisePayable));
  expect(s(sumOf(result.lines.map((l) => l.netLineTotal)))).toBe(
    s(result.merchandisePayable),
  );
  expect(s(result.merchandisePayable.plus(result.deliveryFeePayable))).toBe(
    s(result.grandTotal),
  );
  expect(s(allocated)).toBe(s(result.promotionMerchandiseDiscountTotal));
  expect(s(sumOf(result.lines.map((l) => l.legacyLineDiscount)))).toBe(
    s(result.legacyDiscountTotal),
  );
  expect(
    s(
      result.legacyDiscountTotal.plus(result.promotionMerchandiseDiscountTotal),
    ),
  ).toBe(s(result.merchandiseDiscountTotal));
  // subtotal + discount_total = gross merchandise (existing readers)
  expect(
    s(result.merchandisePayable.plus(result.merchandiseDiscountTotal)),
  ).toBe(s(result.merchandiseOriginal));
  expect(s(lineTotals.plus(result.legacyDiscountTotal))).toBe(
    s(result.merchandiseOriginal),
  );
  expect(
    s(
      result.deliveryFeeOriginal.minus(
        result.deliveryDiscount?.amount ?? d('0'),
      ),
    ),
  ).toBe(s(result.deliveryFeePayable));
  for (const line of result.lines) {
    expect(line.netLineTotal.isNegative()).toBe(false);
    expect(line.lineTotal.isNegative()).toBe(false);
    for (const a of line.promotionAllocations) {
      expect(a.amount.greaterThan(0)).toBe(true);
    }
    if (line.legacyLineDiscount.greaterThan(0)) {
      expect(result.strategy).toBe('ITEM');
      expect(line.itemWinner?.source).toBe('PRODUCT_DISCOUNT');
      expect(line.promotionAllocations).toEqual([]);
    }
    if (result.strategy === 'CART' || line.kind === 'OFFER') {
      expect(s(line.legacyLineDiscount)).toBe('0.00');
    }
    if (line.kind === 'OFFER') expect(line.promotionAllocations).toEqual([]);
  }
  expect(result.deliveryFeePayable.isNegative()).toBe(false);
  expect(result.grandTotal.isNegative()).toBe(false);
  const labels = new Map(
    promotions.map((p) => [p.id, { internalName: p.id, title: null }]),
  );
  const snapshot = buildOrderPricingSnapshot({
    result,
    promotions,
    labels,
    orderType: context.orderType,
  });
  expect(checkOrderPricingSnapshot(snapshot)).toEqual([]);
}

describe('evaluatePromotions — mandatory example', () => {
  const lines = () => [
    product(0, { productDiscount: legacy('PERCENTAGE', '20') }),
    product(1, {
      productId: 'prod-b',
      productDiscount: legacy('PERCENTAGE', '20'),
    }),
  ];
  const deliveryPromo = promo('dlv', 'DELIVERY', 'FIXED_AMOUNT', '10.00');

  it('item strategy (40) beats cart 15% (30): payable 160, delivery 20, total 180', () => {
    const result = run(
      lines(),
      [promo('cart15', 'CART', 'PERCENTAGE', '15'), deliveryPromo],
      delivery('30.00'),
    );
    expect(result.strategy).toBe('ITEM');
    expect(s(result.legacyDiscountTotal)).toBe('40.00');
    expect(s(result.promotionMerchandiseDiscountTotal)).toBe('0.00');
    // legacy discounts stay on the lines; lineTotal is already net of them
    expect(result.lines.map((l) => s(l.legacyLineDiscount))).toEqual([
      '20.00',
      '20.00',
    ]);
    expect(result.lines.map((l) => s(l.lineTotal))).toEqual(['80.00', '80.00']);
    expect(result.lines.map((l) => l.promotionAllocations)).toEqual([[], []]);
    expect(result.cartDiscount).toBeNull();
    expect(s(result.merchandiseOriginal)).toBe('200.00');
    expect(s(result.merchandisePayable)).toBe('160.00');
    expect(s(result.deliveryFeeOriginal)).toBe('30.00');
    expect(result.deliveryDiscount?.promotionId).toBe('dlv');
    expect(s(result.deliveryFeePayable)).toBe('20.00');
    expect(s(result.grandTotal)).toBe('180.00');
    expect(statusOf(result, 'cart15').status).toBe('LOST_TO_BETTER_OFFER');
    expect(s(statusOf(result, 'cart15').potentialSaving)).toBe('30.00');
    expect(statusOf(result, 'dlv').status).toBe('APPLIED');
    // only the NEW delivery promotion is an applied promotion row
    expect(result.applied.map((a) => [a.scope, s(a.amount)])).toEqual([
      ['DELIVERY', '10.00'],
    ]);
  });

  it('cart FIXED 50 beats item 40: payable 150, delivery 20, total 170, no product discount applied', () => {
    const result = run(
      lines(),
      [promo('cart50', 'CART', 'FIXED_AMOUNT', '50.00'), deliveryPromo],
      delivery('30.00'),
    );
    expect(result.strategy).toBe('CART');
    expect(s(result.legacyDiscountTotal)).toBe('0.00');
    expect(s(result.promotionMerchandiseDiscountTotal)).toBe('50.00');
    expect(result.cartDiscount?.promotionId).toBe('cart50');
    expect(s(result.merchandisePayable)).toBe('150.00');
    expect(s(result.deliveryFeePayable)).toBe('20.00');
    expect(s(result.grandTotal)).toBe('170.00');
    // the legacy Product discount does NOT remain applied when the cart wins
    expect(result.lines.map((l) => s(l.legacyUnitDiscount))).toEqual([
      '0.00',
      '0.00',
    ]);
    expect(result.lines.map((l) => s(l.lineTotal))).toEqual([
      '100.00',
      '100.00',
    ]);
    expect(result.lines.map(alloc)).toEqual(['25.00', '25.00']);
    expect(result.lines.map((l) => l.itemWinner)).toEqual([null, null]);
    const cart = result.applied.find((a) => a.scope === 'CART');
    expect(cart?.allocations.map((a) => [a.lineIndex, s(a.amount)])).toEqual([
      [0, '25.00'],
      [1, '25.00'],
    ]);
  });
});

describe('evaluatePromotions — item scope competition', () => {
  it('no promotions configured equals the legacy product-discount math exactly', () => {
    const lines = [
      product(0, {
        unitPrice: d('87.50'),
        quantity: 3,
        modifiersUnitTotal: d('12.25'),
        productDiscount: legacy('PERCENTAGE', '15'),
      }),
      product(1, {
        unitPrice: d('40.00'),
        quantity: 2,
        productDiscount: legacy('FIXED_AMOUNT', '7.50'),
      }),
      product(2, { unitPrice: d('19.99'), quantity: 4 }),
      product(3, {
        unitPrice: d('60.00'),
        productDiscount: legacy('PERCENTAGE', '50', { enabled: false }),
      }),
    ];
    const result = run(lines);
    // line = (unit - unitDiscount + modifiers) x qty
    const expected = [
      d('87.50').minus(d('13.13')).plus(d('12.25')).times(3), // 15% of 87.50 = 13.125 -> 13.13
      d('40.00').minus(d('7.50')).times(2),
      d('19.99').times(4),
      d('60.00'),
    ];
    expect(result.lines.map((l) => s(l.netLineTotal))).toEqual(expected.map(s));
    expect(s(result.legacyDiscountTotal)).toBe(
      s(d('13.13').times(3).plus(d('15.00'))),
    );
    expect(result.lines.map((l) => s(l.lineTotal))).toEqual(expected.map(s));
    expect(result.applied).toEqual([]);
    expect(result.strategy).toBe('ITEM');
    expect(result.evaluations).toEqual([]);
  });

  it('Product vs Category: the greater saving wins (category 25% beats product 10%)', () => {
    const result = run(
      [product(0, { productDiscount: legacy('PERCENTAGE', '10') })],
      [promo('cat25', 'CATEGORY', 'PERCENTAGE', '25')],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('cat25');
    expect(s(result.lines[0].promotionUnitDiscount)).toBe('25.00');
    // the beaten legacy discount is NOT stored; the category share is an allocation
    expect(s(result.lines[0].legacyLineDiscount)).toBe('0.00');
    expect(s(result.lines[0].lineTotal)).toBe('100.00');
    expect(alloc(result.lines[0])).toBe('25.00');
    expect(s(result.lines[0].netLineTotal)).toBe('75.00');
    expect(statusOf(result, 'cat25').status).toBe('APPLIED');
  });

  it('Product vs Category: the product discount wins when it saves more', () => {
    const result = run(
      [product(0, { productDiscount: legacy('FIXED_AMOUNT', '30.00') })],
      [promo('cat25', 'CATEGORY', 'PERCENTAGE', '25')],
    );
    expect(result.lines[0].itemWinner?.source).toBe('PRODUCT_DISCOUNT');
    expect(statusOf(result, 'cat25').status).toBe('LOST_TO_BETTER_OFFER');
  });

  it('Product vs Menu: equal saving -> product discount (effective priority 0)', () => {
    const result = run(
      [product(0, { productDiscount: legacy('PERCENTAGE', '20') })],
      [promo('menu20', 'MENU', 'PERCENTAGE', '20', { priority: 0 })],
    );
    expect(result.lines[0].itemWinner?.source).toBe('PRODUCT_DISCOUNT');
    expect(statusOf(result, 'menu20').status).toBe('LOST_TO_BETTER_OFFER');
  });

  it('Product vs Menu: menu wins with a larger saving', () => {
    const result = run(
      [product(0, { productDiscount: legacy('PERCENTAGE', '20') })],
      [promo('menu30', 'MENU', 'PERCENTAGE', '30')],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('menu30');
  });

  it('Category vs Menu: equal saving and equal priority -> CATEGORY (specificity)', () => {
    const result = run(
      [product(0)],
      [
        promo('menu-x', 'MENU', 'PERCENTAGE', '10'),
        promo('cat-x', 'CATEGORY', 'PERCENTAGE', '10'),
      ],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('cat-x');
  });

  it('Category vs Menu: equal saving, the lower priority number wins before specificity', () => {
    const result = run(
      [product(0)],
      [
        promo('menu-x', 'MENU', 'PERCENTAGE', '10', { priority: 5 }),
        promo('cat-x', 'CATEGORY', 'PERCENTAGE', '10', { priority: 50 }),
      ],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('menu-x');
  });

  it('saving first: a higher-priority (lower number) promotion loses to a bigger saving', () => {
    const result = run(
      [product(0)],
      [
        promo('cat-p1', 'CATEGORY', 'PERCENTAGE', '10', { priority: 1 }),
        promo('cat-p900', 'CATEGORY', 'PERCENTAGE', '11', { priority: 900 }),
      ],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('cat-p900');
  });

  it('equal saving, same priority, same scope -> promotion id ascending', () => {
    const result = run(
      [product(0)],
      [
        promo('b-promo', 'CATEGORY', 'PERCENTAGE', '10'),
        promo('a-promo', 'CATEGORY', 'PERCENTAGE', '10'),
      ],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('a-promo');
    expect(statusOf(result, 'b-promo').status).toBe('LOST_TO_BETTER_OFFER');
  });

  it('winner is chosen per line: each line takes its own best candidate', () => {
    const result = run(
      [
        product(0, {
          categoryId: 'cat-a',
          productDiscount: legacy('PERCENTAGE', '5'),
        }),
        product(1, {
          categoryId: 'cat-b',
          productDiscount: legacy('PERCENTAGE', '40'),
        }),
      ],
      [
        promo('cat-a20', 'CATEGORY', 'PERCENTAGE', '20', {
          categoryIds: ['cat-a', 'cat-b'],
        }),
      ],
    );
    expect(result.lines[0].itemWinner?.promotionId).toBe('cat-a20');
    expect(result.lines[1].itemWinner?.source).toBe('PRODUCT_DISCOUNT');
    expect(s(result.legacyDiscountTotal)).toBe('40.00');
    expect(s(result.promotionMerchandiseDiscountTotal)).toBe('20.00');
    expect(s(result.merchandiseDiscountTotal)).toBe('60.00');
    const snapshot = result.applied.find((a) => a.promotionId === 'cat-a20');
    expect(snapshot?.allocations.map((a) => a.lineIndex)).toEqual([0]);
    expect(s(snapshot?.amount ?? d('0'))).toBe('20.00');
  });

  it('category promotion that targets another category -> NO_ELIGIBLE_ITEMS', () => {
    const result = run(
      [product(0)],
      [
        promo('cat-z', 'CATEGORY', 'PERCENTAGE', '10', {
          categoryIds: ['cat-z'],
        }),
      ],
    );
    expect(statusOf(result, 'cat-z').status).toBe('NO_ELIGIBLE_ITEMS');
    expect(result.strategy).toBe('NONE');
  });

  it('a FIXED_AMOUNT category promotion (invalid config) is never applied', () => {
    const result = run(
      [product(0)],
      [promo('cat-fixed', 'CATEGORY', 'FIXED_AMOUNT', '10.00')],
    );
    expect(statusOf(result, 'cat-fixed').status).toBe('INVALID_CONFIGURATION');
    expect(result.strategy).toBe('NONE');
  });
});

describe('evaluatePromotions — sizes, modifiers, zero price, rounding', () => {
  it('variant discountApplies=false: no legacy product discount, but CATEGORY still applies', () => {
    const line = product(0, {
      variantId: 'size-l',
      sizeDiscountApplies: false,
      unitPrice: d('120.00'),
      productDiscount: legacy('PERCENTAGE', '50'),
    });
    const withoutPromo = run([line]);
    expect(withoutPromo.strategy).toBe('NONE');
    expect(s(withoutPromo.merchandisePayable)).toBe('120.00');

    const withPromo = run(
      [line],
      [promo('cat10', 'CATEGORY', 'PERCENTAGE', '10')],
    );
    expect(withPromo.lines[0].itemWinner?.promotionId).toBe('cat10');
    expect(s(withPromo.lines[0].promotionUnitDiscount)).toBe('12.00');
  });

  it('paid modifiers: item promotions exclude them, cart promotions include them', () => {
    const line = product(0, {
      unitPrice: d('100.00'),
      modifiersUnitTotal: d('20.00'),
      quantity: 2,
    });
    const item = run([line], [promo('cat10', 'CATEGORY', 'PERCENTAGE', '10')]);
    expect(s(item.promotionMerchandiseDiscountTotal)).toBe('20.00'); // 10% of 100 x 2, extras excluded
    expect(s(item.merchandisePayable)).toBe('220.00');

    const cart = run([line], [promo('cart10', 'CART', 'PERCENTAGE', '10')]);
    expect(s(cart.cartDiscount?.amount ?? d('0'))).toBe('24.00'); // 10% of 240
    expect(s(cart.merchandisePayable)).toBe('216.00');
  });

  it('zero-price product: nothing to discount, nothing negative', () => {
    const result = run(
      [
        product(0, {
          unitPrice: d('0.00'),
          productDiscount: legacy('FIXED_AMOUNT', '5.00'),
        }),
      ],
      [promo('cat50', 'CATEGORY', 'PERCENTAGE', '50')],
    );
    expect(result.strategy).toBe('NONE');
    expect(statusOf(result, 'cat50').status).toBe('NO_ELIGIBLE_ITEMS');
    expect(s(result.grandTotal)).toBe('0.00');
  });

  it('half-cent rounding: 15% of 0.10 -> 0.02 per unit (0.015 half-up)', () => {
    const result = run(
      [product(0, { unitPrice: d('0.10'), quantity: 3 })],
      [promo('cat15', 'CATEGORY', 'PERCENTAGE', '15')],
    );
    expect(s(result.lines[0].promotionUnitDiscount)).toBe('0.02');
    expect(alloc(result.lines[0])).toBe('0.06');
    expect(s(result.merchandisePayable)).toBe('0.24');
  });

  it('half-cent rounding: 12.5% of 1.00 = 0.125 -> 0.13', () => {
    const result = run(
      [product(0, { unitPrice: d('1.00') })],
      [promo('menu125', 'MENU', 'PERCENTAGE', '12.5')],
    );
    expect(s(result.lines[0].promotionUnitDiscount)).toBe('0.13');
  });

  it('cart percentage is rounded once on the basis: 12.5% of 0.10+0.10+0.10 = 0.0375 -> 0.04', () => {
    const result = run(
      [
        product(0, { unitPrice: d('0.10') }),
        product(1, { productId: 'p1', unitPrice: d('0.10') }),
        product(2, { productId: 'p2', unitPrice: d('0.10') }),
      ],
      [promo('cart125', 'CART', 'PERCENTAGE', '12.5')],
    );
    expect(s(result.cartDiscount?.amount ?? d('0'))).toBe('0.04');
    // 0.04 over three equal bases: 0.01 each by floor, the extra cent to the first line.
    expect(result.lines.map(alloc)).toEqual(['0.02', '0.01', '0.01']);
  });

  it('100% item promotion makes the product free but never negative; extras stay payable', () => {
    const result = run(
      [product(0, { unitPrice: d('45.00'), modifiersUnitTotal: d('5.00') })],
      [promo('cat100', 'CATEGORY', 'PERCENTAGE', '100')],
    );
    expect(s(result.lines[0].netLineTotal)).toBe('5.00');
  });
});

describe('evaluatePromotions — cart scope and strategy', () => {
  it('Category vs Cart: cart wins only when strictly greater', () => {
    const lines = [product(0), product(1, { productId: 'p1' })];
    const tie = run(lines, [
      promo('cat10', 'CATEGORY', 'PERCENTAGE', '10'),
      promo('cart20', 'CART', 'FIXED_AMOUNT', '20.00'),
    ]);
    expect(tie.strategy).toBe('ITEM');
    expect(statusOf(tie, 'cart20').status).toBe('LOST_TO_BETTER_OFFER');

    const cartWins = run(lines, [
      promo('cat10', 'CATEGORY', 'PERCENTAGE', '10'),
      promo('cart21', 'CART', 'FIXED_AMOUNT', '20.01'),
    ]);
    expect(cartWins.strategy).toBe('CART');
    expect(statusOf(cartWins, 'cat10').status).toBe('LOST_TO_BETTER_OFFER');
    expect(statusOf(cartWins, 'cart21').status).toBe('APPLIED');
  });

  it('Menu vs Cart and Product vs Cart', () => {
    const lines = [product(0, { productDiscount: legacy('PERCENTAGE', '5') })];
    const menu = run(lines, [
      promo('menu30', 'MENU', 'PERCENTAGE', '30'),
      promo('cart25', 'CART', 'PERCENTAGE', '25'),
    ]);
    expect(menu.strategy).toBe('ITEM');
    expect(menu.lines[0].itemWinner?.promotionId).toBe('menu30');

    const productVsCart = run(lines, [
      promo('cart25', 'CART', 'PERCENTAGE', '25'),
    ]);
    expect(productVsCart.strategy).toBe('CART');
    expect(s(productVsCart.merchandisePayable)).toBe('75.00');
  });

  it('Quantity vs Cart: the greater saving is the single cart winner', () => {
    const lines = [product(0, { quantity: 3 })];
    const result = run(lines, [
      promo('cart10', 'CART', 'PERCENTAGE', '10'),
      promo('qty3', 'QUANTITY', 'FIXED_AMOUNT', '45.00', {
        minimumQuantity: 3,
        quantityBasis: 'UNITS',
      }),
    ]);
    expect(result.cartDiscount?.promotionId).toBe('qty3');
    expect(statusOf(result, 'cart10').status).toBe('LOST_TO_BETTER_OFFER');
    expect(s(result.merchandisePayable)).toBe('255.00');
  });

  it('cart tie between two cart promotions: priority, then id', () => {
    const lines = [product(0)];
    const byPriority = run(lines, [
      promo('cart-b', 'CART', 'FIXED_AMOUNT', '10.00', { priority: 1 }),
      promo('cart-a', 'CART', 'FIXED_AMOUNT', '10.00', { priority: 2 }),
    ]);
    expect(byPriority.cartDiscount?.promotionId).toBe('cart-b');
    const byId = run(lines, [
      promo('cart-b', 'CART', 'FIXED_AMOUNT', '10.00'),
      promo('cart-a', 'CART', 'FIXED_AMOUNT', '10.00'),
    ]);
    expect(byId.cartDiscount?.promotionId).toBe('cart-a');
  });

  it('identical quantities vs distinct products', () => {
    const sameProduct = [product(0, { quantity: 3 })];
    const distinct = [
      product(0),
      product(1, { productId: 'p1' }),
      product(2, { productId: 'p2' }),
    ];
    const units = promo('units3', 'QUANTITY', 'PERCENTAGE', '10', {
      minimumQuantity: 3,
      quantityBasis: 'UNITS',
    });
    const products3 = promo('distinct3', 'QUANTITY', 'PERCENTAGE', '10', {
      minimumQuantity: 3,
      quantityBasis: 'DISTINCT_PRODUCTS',
    });
    expect(run(sameProduct, [units]).strategy).toBe('CART');
    const notDistinct = run(sameProduct, [products3]);
    expect(statusOf(notDistinct, 'distinct3').status).toBe(
      'BELOW_MINIMUM_QUANTITY',
    );
    expect(statusOf(notDistinct, 'distinct3').remainingQuantity).toBe(2);
    expect(run(distinct, [products3]).strategy).toBe('CART');
    // Two size lines of the same product are still ONE distinct product.
    const twoSizes = [
      product(0, { variantId: 's' }),
      product(1, { productId: 'prod-0', variantId: 'l' }),
      product(2, { productId: 'p2' }),
    ];
    expect(
      statusOf(run(twoSizes, [products3]), 'distinct3').remainingQuantity,
    ).toBe(1);
  });

  it('quantity threshold: one unit below / at / above', () => {
    const qty = promo('qty5', 'QUANTITY', 'FIXED_AMOUNT', '30.00', {
      minimumQuantity: 5,
      quantityBasis: 'UNITS',
    });
    const below = run([product(0, { quantity: 4 })], [qty]);
    expect(statusOf(below, 'qty5').status).toBe('BELOW_MINIMUM_QUANTITY');
    expect(statusOf(below, 'qty5').remainingQuantity).toBe(1);
    expect(run([product(0, { quantity: 5 })], [qty]).strategy).toBe('CART');
    expect(run([product(0, { quantity: 6 })], [qty]).strategy).toBe('CART');
  });

  it('quantity promotion with an additional spend minimum reports both shortfalls', () => {
    const qty = promo('qty3-300', 'QUANTITY', 'FIXED_AMOUNT', '30.00', {
      minimumQuantity: 3,
      quantityBasis: 'UNITS',
      minimumSubtotal: d('300.00'),
    });
    const short = run([product(0, { quantity: 2 })], [qty]);
    expect(statusOf(short, 'qty3-300')).toMatchObject({
      status: 'BELOW_MINIMUM_QUANTITY',
      remainingQuantity: 1,
    });
    expect(s(statusOf(short, 'qty3-300').remainingAmount ?? d('0'))).toBe(
      '100.00',
    );
    const enoughUnits = run(
      [product(0, { quantity: 3, unitPrice: d('90.00') })],
      [qty],
    );
    expect(statusOf(enoughUnits, 'qty3-300').status).toBe(
      'BELOW_MINIMUM_SUBTOTAL',
    );
    expect(s(statusOf(enoughUnits, 'qty3-300').remainingAmount ?? d('0'))).toBe(
      '30.00',
    );
  });

  it('spend threshold: below / at / above, on the PRE-promotion basis', () => {
    const cart = promo('cart-min', 'CART', 'PERCENTAGE', '10', {
      minimumSubtotal: d('200.00'),
    });
    const below = run([product(0, { unitPrice: d('199.99') })], [cart]);
    expect(statusOf(below, 'cart-min').status).toBe('BELOW_MINIMUM_SUBTOTAL');
    expect(s(statusOf(below, 'cart-min').remainingAmount ?? d('0'))).toBe(
      '0.01',
    );
    const at = run([product(0, { unitPrice: d('200.00') })], [cart]);
    expect(at.strategy).toBe('CART');
    expect(s(at.merchandisePayable)).toBe('180.00'); // the net (180) is below 200 and that is fine
    const above = run([product(0, { unitPrice: d('200.01') })], [cart]);
    expect(above.strategy).toBe('CART');
  });

  it('cart targets restrict the eligible lines (category / product union)', () => {
    const lines = [
      product(0, { categoryId: 'cat-a' }),
      product(1, { productId: 'p1', categoryId: 'cat-b' }),
      product(2, { productId: 'p2', categoryId: 'cat-c' }),
    ];
    const result = run(lines, [
      promo('cart-ab', 'CART', 'PERCENTAGE', '10', {
        categoryIds: ['cat-a'],
        productIds: ['p1'],
      }),
    ]);
    expect(s(result.cartDiscount?.amount ?? d('0'))).toBe('20.00');
    expect(result.lines.map(alloc)).toEqual(['10.00', '10.00', '0.00']);
    expect(result.applied[0].allocations.map((a) => a.lineIndex)).toEqual([
      0, 1,
    ]);
    const none = run(lines, [
      promo('cart-z', 'CART', 'PERCENTAGE', '10', { productIds: ['nope'] }),
    ]);
    expect(statusOf(none, 'cart-z').status).toBe('NO_ELIGIBLE_ITEMS');
  });

  it('fixed amount larger than the eligible basis is capped at the basis', () => {
    const result = run(
      [product(0, { unitPrice: d('35.00') })],
      [promo('cart100', 'CART', 'FIXED_AMOUNT', '100.00')],
    );
    expect(s(result.cartDiscount?.amount ?? d('0'))).toBe('35.00');
    expect(s(result.merchandisePayable)).toBe('0.00');
  });

  it('100% cart promotion frees all eligible merchandise', () => {
    const result = run(
      [
        product(0, { modifiersUnitTotal: d('7.50'), quantity: 2 }),
        offer(1, '50.00'),
      ],
      [promo('cart-all', 'CART', 'PERCENTAGE', '100')],
    );
    expect(s(result.cartDiscount?.amount ?? d('0'))).toBe('215.00');
    expect(s(result.merchandisePayable)).toBe('50.00'); // the offer line stays payable
  });
});

describe('evaluatePromotions — offers / bundles', () => {
  it('bundle + product: the bundle is never discounted nor counted', () => {
    const result = run(
      [product(0), offer(1, '150.00', 2)],
      [
        promo('cat50', 'CATEGORY', 'PERCENTAGE', '50'),
        promo('qty3', 'QUANTITY', 'PERCENTAGE', '90', {
          minimumQuantity: 3,
          quantityBasis: 'UNITS',
        }),
        promo('cart-min', 'CART', 'PERCENTAGE', '90', {
          minimumSubtotal: d('300.00'),
        }),
      ],
    );
    expect(statusOf(result, 'qty3').status).toBe('BELOW_MINIMUM_QUANTITY');
    expect(statusOf(result, 'cart-min').status).toBe('BELOW_MINIMUM_SUBTOTAL');
    expect(s(result.lines[1].netLineTotal)).toBe('300.00');
    expect(s(result.merchandiseOriginal)).toBe('400.00');
    expect(s(result.merchandisePayable)).toBe('350.00');
  });

  it('bundle-only order: every merchandise promotion has no eligible items', () => {
    const result = run(
      [offer(0, '120.00')],
      [
        promo('cart10', 'CART', 'PERCENTAGE', '10'),
        promo('cat10', 'CATEGORY', 'PERCENTAGE', '10'),
      ],
    );
    expect(result.strategy).toBe('NONE');
    expect(statusOf(result, 'cart10').status).toBe('NO_ELIGIBLE_ITEMS');
    expect(statusOf(result, 'cat10').status).toBe('NO_ELIGIBLE_ITEMS');
    expect(s(result.grandTotal)).toBe('120.00');
  });

  it('offer totals count toward the delivery promotion minimum', () => {
    const free = promo('free-dlv', 'DELIVERY', 'PERCENTAGE', '100', {
      minimumSubtotal: d('200.00'),
    });
    const result = run(
      [product(0), offer(1, '100.00')],
      [free],
      delivery('25.00'),
    );
    expect(statusOf(result, 'free-dlv').status).toBe('APPLIED');
    expect(s(result.deliveryFeePayable)).toBe('0.00');
  });
});

describe('evaluatePromotions — delivery', () => {
  it('delivery vs cart: both apply (independent)', () => {
    const result = run(
      [product(0)],
      [
        promo('cart10', 'CART', 'PERCENTAGE', '10'),
        promo('dlv50', 'DELIVERY', 'PERCENTAGE', '50'),
      ],
      delivery('30.00'),
    );
    expect(result.strategy).toBe('CART');
    expect(s(result.deliveryFeePayable)).toBe('15.00');
    expect(s(result.grandTotal)).toBe('105.00');
  });

  it('delivery vs item: both apply (independent)', () => {
    const result = run(
      [product(0, { productDiscount: legacy('PERCENTAGE', '10') })],
      [promo('dlv-free', 'DELIVERY', 'PERCENTAGE', '100')],
      delivery('20.00'),
    );
    expect(result.strategy).toBe('ITEM');
    expect(s(result.deliveryFeePayable)).toBe('0.00');
    expect(s(result.grandTotal)).toBe('90.00');
  });

  it('multiple delivery promotions: greatest saving, then priority, then id', () => {
    const lines = [product(0)];
    const best = run(
      lines,
      [
        promo('dlv-5', 'DELIVERY', 'FIXED_AMOUNT', '5.00', { priority: 0 }),
        promo('dlv-pct', 'DELIVERY', 'PERCENTAGE', '40'),
        promo('dlv-big', 'DELIVERY', 'FIXED_AMOUNT', '50.00'), // capped at the fee 30
      ],
      delivery('30.00'),
    );
    expect(best.deliveryDiscount?.promotionId).toBe('dlv-big');
    expect(s(best.deliveryDiscount?.amount ?? d('0'))).toBe('30.00');
    expect(statusOf(best, 'dlv-pct').status).toBe('LOST_TO_BETTER_OFFER');

    const tie = run(
      lines,
      [
        promo('dlv-b', 'DELIVERY', 'FIXED_AMOUNT', '10.00', { priority: 3 }),
        promo('dlv-a', 'DELIVERY', 'FIXED_AMOUNT', '10.00', { priority: 3 }),
        promo('dlv-c', 'DELIVERY', 'PERCENTAGE', '50', { priority: 9 }), // 15 > 10
      ],
      delivery('30.00'),
    );
    expect(tie.deliveryDiscount?.promotionId).toBe('dlv-c');
    const idTie = run(
      lines,
      [
        promo('dlv-b', 'DELIVERY', 'FIXED_AMOUNT', '10.00', { priority: 3 }),
        promo('dlv-a', 'DELIVERY', 'FIXED_AMOUNT', '10.00', { priority: 3 }),
      ],
      delivery('30.00'),
    );
    expect(idTie.deliveryDiscount?.promotionId).toBe('dlv-a');
  });

  it('a 1% discount on a 0.01 EGP fee rounds to zero and is not applied', () => {
    const result = run(
      [product(0)],
      [promo('dlv-1pct', 'DELIVERY', 'PERCENTAGE', '1')],
      delivery('0.01'),
    );

    const evaluation = statusOf(result, 'dlv-1pct');
    expect(evaluation.status).toBe('NO_EFFECTIVE_DISCOUNT');
    expect(s(evaluation.potentialSaving)).toBe('0.00');
    expect(result.deliveryDiscount).toBeNull();
    expect(result.applied).toEqual([]);
    expect(s(result.deliveryFeeOriginal)).toBe('0.01');
    expect(s(result.deliveryFeePayable)).toBe('0.01');
    expect(s(result.grandTotal)).toBe('100.01');
  });

  it('excludes rounded-zero delivery savings and breaks a rounded positive tie by priority', () => {
    const result = run(
      [product(0)],
      [
        promo('dlv-zero', 'DELIVERY', 'PERCENTAGE', '1', { priority: 0 }),
        promo('dlv-a', 'DELIVERY', 'PERCENTAGE', '100', { priority: 20 }),
        promo('dlv-b', 'DELIVERY', 'PERCENTAGE', '50', { priority: 10 }),
      ],
      delivery('0.01'),
    );

    expect(result.deliveryDiscount).toEqual({
      promotionId: 'dlv-b',
      amount: d('0.01'),
    });
    expect(result.applied.map((p) => p.promotionId)).toEqual(['dlv-b']);
    expect(
      result.evaluations.map((e) => [e.status, s(e.potentialSaving)]),
    ).toEqual([
      ['NO_EFFECTIVE_DISCOUNT', '0.00'],
      ['LOST_TO_BETTER_OFFER', '0.01'],
      ['APPLIED', '0.01'],
    ]);
    expect(s(result.deliveryFeePayable)).toBe('0.00');
    expect(s(result.grandTotal)).toBe('100.00');
  });

  it('wrong zone and zone targeting', () => {
    const zoned = promo('dlv-z2', 'DELIVERY', 'FIXED_AMOUNT', '10.00', {
      deliveryZoneIds: ['zone-2'],
    });
    const wrong = run([product(0)], [zoned], delivery('30.00', 'zone-1'));
    expect(statusOf(wrong, 'dlv-z2').status).toBe('WRONG_ZONE');
    expect(s(wrong.deliveryFeePayable)).toBe('30.00');
    const right = run([product(0)], [zoned], delivery('30.00', 'zone-2'));
    expect(statusOf(right, 'dlv-z2').status).toBe('APPLIED');
  });

  it('PICKUP and DINE_IN never receive delivery promotions', () => {
    for (const orderType of ['PICKUP', 'DINE_IN'] as const) {
      const result = run(
        [product(0)],
        [promo('dlv', 'DELIVERY', 'PERCENTAGE', '100')],
        ctx({ orderType }),
      );
      expect(statusOf(result, 'dlv').status).toBe('WRONG_ORDER_TYPE');
      expect(result.deliveryDiscount).toBeNull();
      expect(s(result.deliveryFeeOriginal)).toBe('0.00');
    }
  });

  it('zero delivery fee: nothing to discount', () => {
    const result = run(
      [product(0)],
      [promo('dlv', 'DELIVERY', 'PERCENTAGE', '100')],
      delivery('0.00'),
    );
    const evaluation = statusOf(result, 'dlv');
    expect(evaluation.status).toBe('NO_DELIVERY_FEE');
    expect(s(evaluation.potentialSaving)).toBe('0.00');
    expect(result.deliveryDiscount).toBeNull();
    expect(result.applied).toEqual([]);
    expect(s(result.deliveryFeeOriginal)).toBe('0.00');
    expect(s(result.deliveryFeePayable)).toBe('0.00');
    expect(s(result.grandTotal)).toBe('100.00');
  });

  it('delivery minimum is checked on the pre-promotion merchandise total and reports the remaining amount', () => {
    const dlv = promo('dlv-min', 'DELIVERY', 'PERCENTAGE', '100', {
      minimumSubtotal: d('150.00'),
    });
    const result = run(
      [
        product(0, {
          unitPrice: d('160.00'),
          productDiscount: legacy('PERCENTAGE', '50'),
        }),
      ],
      [dlv],
      delivery('30.00'),
    );
    // net merchandise is 80 but the pre-promotion total 160 qualifies
    expect(s(result.merchandisePayable)).toBe('80.00');
    expect(statusOf(result, 'dlv-min').status).toBe('APPLIED');
    const short = run(
      [product(0, { unitPrice: d('120.00') })],
      [dlv],
      delivery('30.00'),
    );
    expect(s(statusOf(short, 'dlv-min').remainingAmount ?? d('0'))).toBe(
      '30.00',
    );
  });
});

describe('evaluatePromotions — Delivery Zone minimum (checked by the caller)', () => {
  it('the best strategy stays even when the net payable falls below the zone minimum (no fallback)', () => {
    const zoneMinimum = d('150.00');
    const result = run(
      [product(0), product(1, { productId: 'p1' })],
      [promo('cart60', 'CART', 'FIXED_AMOUNT', '60.00')],
      delivery('20.00'),
    );
    expect(result.strategy).toBe('CART');
    expect(s(result.merchandisePayable)).toBe('140.00');
    // The caller (B2) refuses with MINIMUM_ORDER_NOT_MET on the NET payable (DEC-036).
    expect(result.merchandisePayable.lessThan(zoneMinimum)).toBe(true);
  });
});

describe('evaluatePromotions — eligibility', () => {
  it('local date boundaries are inclusive (startsOn / endsOn vs today)', () => {
    const lines = [product(0)];
    const cases: [string | null, string | null, string][] = [
      ['2026-11-22', null, 'NOT_STARTED'],
      ['2026-11-21', null, 'APPLIED'],
      [null, '2026-11-21', 'APPLIED'],
      [null, '2026-11-20', 'EXPIRED'],
      ['2026-11-21', '2026-11-21', 'APPLIED'],
    ];
    for (const [startsOn, endsOn, expected] of cases) {
      const result = run(lines, [
        promo('cat', 'CATEGORY', 'PERCENTAGE', '10', { startsOn, endsOn }),
      ]);
      expect(statusOf(result, 'cat').status).toBe(expected);
    }
  });

  it('today is the ORDER Branch local date (localDateIn), not the UTC date', () => {
    // 22:30 UTC on 21 Nov is already 22 Nov 00:30 in Cairo (UTC+2).
    const now = new Date('2026-11-21T22:30:00.000Z');
    const startsTomorrow = promo('cat', 'CATEGORY', 'PERCENTAGE', '10', {
      startsOn: '2026-11-22',
    });
    const cairo = run(
      [product(0)],
      [startsTomorrow],
      ctx({ today: localDateIn('Africa/Cairo', now) }),
    );
    expect(statusOf(cairo, 'cat').status).toBe('APPLIED');
    const utc = run(
      [product(0)],
      [startsTomorrow],
      ctx({ today: localDateIn('UTC', now) }),
    );
    expect(statusOf(utc, 'cat').status).toBe('NOT_STARTED');
  });

  it('status INACTIVE / ARCHIVED are never candidates', () => {
    const result = run(
      [product(0)],
      [
        promo('off', 'CART', 'PERCENTAGE', '10', { status: 'INACTIVE' }),
        promo('gone', 'CATEGORY', 'PERCENTAGE', '10', { status: 'ARCHIVED' }),
      ],
    );
    expect(statusOf(result, 'off').status).toBe('INACTIVE');
    expect(statusOf(result, 'gone').status).toBe('INACTIVE');
    expect(result.strategy).toBe('NONE');
  });

  it('branch applicability: empty = all branches; otherwise only listed', () => {
    const lines = [product(0)];
    const all = run(lines, [promo('all', 'CART', 'PERCENTAGE', '10')]);
    expect(statusOf(all, 'all').status).toBe('APPLIED');
    const other = run(lines, [
      promo('b2', 'CART', 'PERCENTAGE', '10', { branchIds: ['branch-2'] }),
    ]);
    expect(statusOf(other, 'b2').status).toBe('WRONG_BRANCH');
    const listed = run(lines, [
      promo('b1', 'CART', 'PERCENTAGE', '10', {
        branchIds: ['branch-2', 'branch-1'],
      }),
    ]);
    expect(statusOf(listed, 'b1').status).toBe('APPLIED');
  });

  it('evaluations follow the input order', () => {
    const result = run(
      [product(0)],
      [
        promo('z', 'CART', 'PERCENTAGE', '10'),
        promo('a', 'DELIVERY', 'PERCENTAGE', '10'),
      ],
    );
    expect(result.evaluations.map((e) => e.promotionId)).toEqual(['z', 'a']);
  });

  it('rejects malformed lines (caller bug)', () => {
    expect(() => run([product(0, { quantity: 0 })])).toThrow();
    expect(() => run([product(0, { unitPrice: d('-1.00') })])).toThrow();
  });
});

describe('evaluatePromotions — approved policy guards (DEC-075 amendment 2026-11-21)', () => {
  // Line 0: legacy 10% / CATEGORY 20% / MENU 15% -> CATEGORY 20.
  // Line 1 (other category): legacy 5.00 / MENU 15% -> MENU 15. Item total A = 35.
  const lines = () => [
    product(0, { productDiscount: legacy('PERCENTAGE', '10') }),
    product(1, {
      productId: 'p1',
      categoryId: 'cat-b',
      productDiscount: legacy('FIXED_AMOUNT', '5.00'),
    }),
  ];
  const itemPromotions = () => [
    promo('cat20', 'CATEGORY', 'PERCENTAGE', '20'),
    promo('menu15', 'MENU', 'PERCENTAGE', '15'),
  ];
  const cartScopes = ['CART', 'QUANTITY'];
  const itemScopes = ['CATEGORY', 'MENU'];

  it('product / category / menu paths are never combined with a cart or quantity path', () => {
    // Exact tie (35 vs 35): the item path stays, no cart / quantity share anywhere.
    const item = run(lines(), [
      ...itemPromotions(),
      promo('cart35', 'CART', 'FIXED_AMOUNT', '35.00'),
      promo('qty10', 'QUANTITY', 'PERCENTAGE', '10', {
        minimumQuantity: 2,
        quantityBasis: 'UNITS',
      }),
    ]);
    expect(item.strategy).toBe('ITEM');
    expect(item.cartDiscount).toBeNull();
    expect(item.lines.map((l) => l.itemWinner?.promotionId)).toEqual([
      'cat20',
      'menu15',
    ]);
    for (const line of item.lines) {
      expect(line.promotionAllocations).toHaveLength(1);
      expect(itemScopes).toContain(line.promotionAllocations[0].scope);
    }
    expect(item.applied.some((a) => cartScopes.includes(a.scope))).toBe(false);

    // CART strictly greater: no legacy, CATEGORY or MENU discount survives on any line.
    const cart = run(lines(), [
      ...itemPromotions(),
      promo('cart3501', 'CART', 'FIXED_AMOUNT', '35.01'),
    ]);
    // QUANTITY strictly greater (20% of 200 = 40): same exclusivity.
    const quantity = run(lines(), [
      ...itemPromotions(),
      promo('qty20', 'QUANTITY', 'PERCENTAGE', '20', {
        minimumQuantity: 2,
        quantityBasis: 'UNITS',
      }),
    ]);
    for (const [result, id] of [
      [cart, 'cart3501'],
      [quantity, 'qty20'],
    ] as const) {
      expect(result.strategy).toBe('CART');
      expect(result.cartDiscount?.promotionId).toBe(id);
      expect(s(result.legacyDiscountTotal)).toBe('0.00');
      for (const line of result.lines) {
        expect(line.itemWinner).toBeNull();
        expect(s(line.promotionUnitDiscount)).toBe('0.00');
        expect(line.promotionAllocations.map((a) => a.promotionId)).toEqual([
          id,
        ]);
      }
      expect(result.applied.some((a) => itemScopes.includes(a.scope))).toBe(
        false,
      );
      expect(statusOf(result, 'cat20').status).toBe('LOST_TO_BETTER_OFFER');
      expect(statusOf(result, 'menu15').status).toBe('LOST_TO_BETTER_OFFER');
    }
    expect(s(quantity.merchandisePayable)).toBe('160.00');
  });

  it('the result does not depend on the order of the candidate promotions (deterministic ties)', () => {
    const candidates = [
      promo('cat-b', 'CATEGORY', 'PERCENTAGE', '10'),
      promo('cat-a', 'CATEGORY', 'PERCENTAGE', '10'),
      promo('menu-a', 'MENU', 'PERCENTAGE', '10'),
      promo('cart-b', 'CART', 'FIXED_AMOUNT', '5.00'),
      promo('cart-a', 'CART', 'FIXED_AMOUNT', '5.00'),
      promo('dlv-b', 'DELIVERY', 'FIXED_AMOUNT', '10.00'),
      promo('dlv-a', 'DELIVERY', 'FIXED_AMOUNT', '10.00'),
    ];
    const project = (result: EngineResult) =>
      JSON.stringify({
        strategy: result.strategy,
        lines: result.lines.map((l) => [
          l.itemWinner?.promotionId ?? l.itemWinner?.source ?? null,
          l.promotionAllocations.map((a) => [a.promotionId, s(a.amount)]),
          s(l.netLineTotal),
        ]),
        cart: result.cartDiscount?.promotionId ?? null,
        delivery: result.deliveryDiscount?.promotionId ?? null,
        applied: result.applied.map((a) => [a.promotionId, s(a.amount)]),
        total: s(result.grandTotal),
        statuses: [...result.evaluations]
          .sort((x, y) => (x.promotionId < y.promotionId ? -1 : 1))
          .map((e) => [e.promotionId, e.status]),
      });
    const reference = project(run(lines(), candidates, delivery('30.00')));
    const orders = [
      [...candidates].reverse(),
      [3, 6, 0, 5, 2, 4, 1].map((i) => candidates[i]),
      candidates,
    ];
    for (const order of orders) {
      expect(project(run(lines(), order, delivery('30.00')))).toBe(reference);
    }
    const result = run(lines(), candidates, delivery('30.00'));
    // line 0: legacy 10 = cat-a 10 = cat-b 10 = menu 10 -> legacy (priority 0); line 1: menu-a 10 beats legacy 5
    expect(result.lines.map((l) => l.itemWinner?.source)).toEqual([
      'PRODUCT_DISCOUNT',
      'PROMOTION',
    ]);
    expect(result.lines[1].itemWinner?.promotionId).toBe('menu-a');
    expect(result.deliveryDiscount?.promotionId).toBe('dlv-a');
  });

  it('at most one independent delivery-fee promotion is applied, never a sum', () => {
    const result = run(
      lines(),
      [
        promo('dlv-a', 'DELIVERY', 'FIXED_AMOUNT', '10.00'),
        promo('dlv-b', 'DELIVERY', 'PERCENTAGE', '50'), // 15.00
        promo('dlv-c', 'DELIVERY', 'FIXED_AMOUNT', '15.00', { priority: 1 }),
        promo('cart50', 'CART', 'FIXED_AMOUNT', '50.00'),
      ],
      delivery('30.00'),
    );
    const deliveryRows = result.applied.filter((a) => a.scope === 'DELIVERY');
    expect(deliveryRows).toHaveLength(1);
    expect(deliveryRows[0].promotionId).toBe('dlv-c'); // 15 = 15 -> priority 1 beats 100
    expect(deliveryRows[0].allocations).toEqual([]);
    expect(s(result.deliveryDiscount?.amount ?? d('0'))).toBe('15.00');
    expect(s(result.deliveryFeePayable)).toBe('15.00');
    expect(statusOf(result, 'dlv-a').status).toBe('LOST_TO_BETTER_OFFER');
    expect(statusOf(result, 'dlv-b').status).toBe('LOST_TO_BETTER_OFFER');
    // independent of the merchandise strategy, which is decided on its own
    expect(result.strategy).toBe('CART');
    expect(s(result.grandTotal)).toBe('165.00');
  });
});

describe('allocateProportionally', () => {
  it('sums exactly, never exceeds a basis and is deterministic', () => {
    const bases = [d('33.33'), d('33.33'), d('33.34'), d('0.00'), d('0.01')];
    const first = allocateProportionally(d('10.00'), bases);
    const second = allocateProportionally(d('10.00'), bases);
    expect(first.map(s)).toEqual(second.map(s));
    expect(s(first.reduce((acc, v) => acc.plus(v), d('0')))).toBe('10.00');
    first.forEach((share, i) =>
      expect(share.greaterThan(bases[i])).toBe(false),
    );
    expect(s(first[3])).toBe('0.00');
  });

  it('largest remainder, ties by position ascending', () => {
    // 0.10 over three equal bases -> 0.03 each by floor, 1 cent left to the first.
    expect(
      allocateProportionally(d('0.10'), [d('1.00'), d('1.00'), d('1.00')]).map(
        s,
      ),
    ).toEqual(['0.04', '0.03', '0.03']);
    // 1.00 over 1:2 -> 0.333.. / 0.666.. -> 0.33 / 0.66 + 1 cent to the larger remainder (second).
    expect(
      allocateProportionally(d('1.00'), [d('10.00'), d('20.00')]).map(s),
    ).toEqual(['0.33', '0.67']);
  });

  it('full allocation (total = sum of bases) gives each line its basis', () => {
    const bases = [d('12.34'), d('0.66'), d('7.00')];
    expect(allocateProportionally(d('20.00'), bases).map(s)).toEqual([
      '12.34',
      '0.66',
      '7.00',
    ]);
  });

  it('many lines with awkward amounts still sum exactly', () => {
    // Bases built from integer cents (713 * i + 37), never from floating point.
    const bases = Array.from({ length: 17 }, (_, i) =>
      d(String(713 * i + 37)).dividedBy(100),
    );
    const total = d('23.57');
    const shares = allocateProportionally(total, bases);
    expect(s(shares.reduce((acc, v) => acc.plus(v), d('0')))).toBe('23.57');
    shares.forEach((share, i) =>
      expect(share.greaterThan(bases[i])).toBe(false),
    );
  });

  it('refuses a total above the bases', () => {
    expect(() => allocateProportionally(d('5.00'), [d('4.99')])).toThrow();
  });
});

describe('validatePromotionInput', () => {
  function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
    return {
      internalName: 'Weekend pizza',
      scope: 'CATEGORY',
      discountType: 'PERCENTAGE',
      value: d('15'),
      priority: 100,
      startsOn: null,
      endsOn: null,
      minimumSubtotal: null,
      minimumQuantity: null,
      quantityBasis: null,
      branchIds: [],
      menuIds: [],
      categoryIds: ['cat-a'],
      productIds: [],
      deliveryZoneIds: [],
      translations: [{ locale: 'ar', title: 'خصم البيتزا' }],
      ...overrides,
    };
  }
  const codes = (value: PromotionInput) =>
    validatePromotionInput(value, 'ar').map((problem) => problem.code);

  it('accepts a valid promotion of every scope', () => {
    expect(codes(input())).toEqual([]);
    expect(
      codes(input({ scope: 'MENU', categoryIds: [], menuIds: ['m1'] })),
    ).toEqual([]);
    expect(
      codes(
        input({
          scope: 'CART',
          discountType: 'FIXED_AMOUNT',
          value: d('50.00'),
          categoryIds: [],
          minimumSubtotal: d('300.00'),
        }),
      ),
    ).toEqual([]);
    expect(
      codes(
        input({
          scope: 'QUANTITY',
          categoryIds: [],
          productIds: ['p1'],
          minimumQuantity: 3,
          quantityBasis: 'UNITS',
        }),
      ),
    ).toEqual([]);
    expect(
      codes(
        input({
          scope: 'DELIVERY',
          value: d('100'),
          categoryIds: [],
          deliveryZoneIds: ['z1'],
          branchIds: ['b1'],
        }),
      ),
    ).toEqual([]);
  });

  it('rejects FIXED_AMOUNT for CATEGORY and MENU', () => {
    expect(
      codes(input({ discountType: 'FIXED_AMOUNT', value: d('10') })),
    ).toContain('ITEM_SCOPE_REQUIRES_PERCENTAGE');
    expect(
      codes(
        input({
          scope: 'MENU',
          categoryIds: [],
          menuIds: ['m'],
          discountType: 'FIXED_AMOUNT',
        }),
      ),
    ).toContain('ITEM_SCOPE_REQUIRES_PERCENTAGE');
  });

  it('value rules: > 0, percentage <= 100, at most 2 decimals', () => {
    expect(codes(input({ value: d('0') }))).toContain('VALUE_INVALID');
    expect(codes(input({ value: d('-5') }))).toContain('VALUE_INVALID');
    expect(codes(input({ value: d('100.01') }))).toContain(
      'PERCENTAGE_ABOVE_100',
    );
    expect(codes(input({ value: d('100') }))).toEqual([]);
    expect(codes(input({ value: d('10.005') }))).toContain('VALUE_INVALID');
    expect(
      codes(
        input({
          scope: 'CART',
          categoryIds: [],
          discountType: 'FIXED_AMOUNT',
          value: d('5000'),
        }),
      ),
    ).toEqual([]);
  });

  it('dates and priority', () => {
    expect(
      codes(input({ startsOn: '2026-12-02', endsOn: '2026-12-01' })),
    ).toContain('DATES_ORDER_INVALID');
    expect(
      codes(input({ startsOn: '2026-12-01', endsOn: '2026-12-01' })),
    ).toEqual([]);
    expect(codes(input({ startsOn: '2026-02-30' }))).toContain('DATE_INVALID');
    expect(codes(input({ priority: -1 }))).toContain('PRIORITY_INVALID');
    expect(codes(input({ priority: 1001 }))).toContain('PRIORITY_INVALID');
    expect(codes(input({ priority: 1.5 }))).toContain('PRIORITY_INVALID');
    expect(codes(input({ priority: 0 }))).toEqual([]);
    expect(codes(input({ priority: 1000 }))).toEqual([]);
  });

  it('quantity rules', () => {
    const base = { scope: 'QUANTITY', categoryIds: [] as string[] };
    expect(codes(input({ ...base, quantityBasis: 'UNITS' }))).toContain(
      'MINIMUM_QUANTITY_REQUIRED',
    );
    expect(
      codes(input({ ...base, minimumQuantity: 0, quantityBasis: 'UNITS' })),
    ).toContain('MINIMUM_QUANTITY_INVALID');
    expect(codes(input({ ...base, minimumQuantity: 2 }))).toContain(
      'QUANTITY_BASIS_REQUIRED',
    );
    expect(
      codes(input({ ...base, minimumQuantity: 2, quantityBasis: 'KILOS' })),
    ).toContain('QUANTITY_BASIS_INVALID');
    expect(codes(input({ minimumQuantity: 2 }))).toContain(
      'MINIMUM_QUANTITY_NOT_ALLOWED',
    );
    expect(codes(input({ quantityBasis: 'UNITS' }))).toContain(
      'QUANTITY_BASIS_NOT_ALLOWED',
    );
  });

  it('minimum subtotal: not for item scope, never negative', () => {
    expect(codes(input({ minimumSubtotal: d('10') }))).toContain(
      'MINIMUM_SUBTOTAL_NOT_ALLOWED',
    );
    expect(
      codes(
        input({ scope: 'CART', categoryIds: [], minimumSubtotal: d('-1') }),
      ),
    ).toContain('MINIMUM_SUBTOTAL_INVALID');
    expect(
      codes(input({ scope: 'CART', categoryIds: [], minimumSubtotal: d('0') })),
    ).toEqual([]);
  });

  it('targets allowed per scope', () => {
    expect(codes(input({ categoryIds: [] }))).toContain('TARGETS_REQUIRED');
    expect(codes(input({ scope: 'MENU', categoryIds: [] }))).toContain(
      'TARGETS_REQUIRED',
    );
    expect(codes(input({ menuIds: ['m1'] }))).toContain('TARGETS_NOT_ALLOWED');
    expect(codes(input({ productIds: ['p1'] }))).toContain(
      'TARGETS_NOT_ALLOWED',
    );
    expect(
      codes(input({ scope: 'CART', categoryIds: [], deliveryZoneIds: ['z1'] })),
    ).toContain('TARGETS_NOT_ALLOWED');
    expect(codes(input({ scope: 'DELIVERY', categoryIds: ['c1'] }))).toContain(
      'TARGETS_NOT_ALLOWED',
    );
    expect(codes(input({ categoryIds: ['c1', 'c1'] }))).toContain(
      'TARGETS_DUPLICATE',
    );
  });

  it('requires a title in the restaurant default locale and an internal name', () => {
    expect(
      codes(input({ translations: [{ locale: 'en', title: 'Pizza deal' }] })),
    ).toContain('TITLE_REQUIRED_DEFAULT_LOCALE');
    expect(
      codes(input({ translations: [{ locale: 'ar', title: '   ' }] })),
    ).toContain('TITLE_REQUIRED_DEFAULT_LOCALE');
    expect(codes(input({ internalName: ' ' }))).toContain(
      'INTERNAL_NAME_REQUIRED',
    );
  });

  it('length rules mirror the database CHECKs', () => {
    expect(codes(input({ internalName: 'x'.repeat(121) }))).toContain(
      'INTERNAL_NAME_TOO_LONG',
    );
    expect(
      codes(
        input({ translations: [{ locale: 'ar', title: 'x'.repeat(121) }] }),
      ),
    ).toContain('TITLE_INVALID');
    expect(
      codes(
        input({
          translations: [
            { locale: 'ar', title: 'عرض' },
            { locale: 'en', title: ' ' },
          ],
        }),
      ),
    ).toContain('TITLE_INVALID');
    expect(
      codes(
        input({
          translations: [
            { locale: 'ar', title: 'عرض', description: 'x'.repeat(501) },
          ],
        }),
      ),
    ).toContain('DESCRIPTION_TOO_LONG');
  });

  it('rejects unknown scope / discount type', () => {
    expect(codes(input({ scope: 'PRODUCT' }))).toContain('SCOPE_INVALID');
    expect(codes(input({ discountType: 'BOGO' }))).toContain(
      'DISCOUNT_TYPE_INVALID',
    );
  });
});
