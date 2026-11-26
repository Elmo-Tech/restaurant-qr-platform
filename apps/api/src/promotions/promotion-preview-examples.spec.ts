import { Prisma } from '../generated/prisma/client';
import type { PromotionConfig } from './promotion-config';
import {
  evaluatePromotions,
  type EngineContext,
  type EngineProductLine,
  type EnginePromotion,
} from './promotion-engine';
import {
  MAX_LINE_QUANTITY,
  buildExamples,
  hasThreshold,
  type BasketLine,
  type ExampleEnvironment,
  type PreviewSample,
} from './promotion-preview-examples';
import { toPromotionCandidate } from './promotions.service';

const d = (value: string) => new Prisma.Decimal(value);
const DRAFT_ID = 'preview-draft';
const CONTEXT: EngineContext = {
  today: '2026-11-26',
  branchId: 'branch-1',
  orderType: 'PICKUP',
  deliveryZoneId: null,
  deliveryFee: null,
};

function config(overrides: Partial<PromotionConfig> = {}): PromotionConfig {
  return {
    internalName: 'Draft',
    scope: 'CART',
    discountType: 'PERCENTAGE',
    value: d('10.00'),
    priority: 100,
    startsOn: null,
    endsOn: null,
    minimumSubtotal: d('200.00'),
    minimumQuantity: null,
    quantityBasis: null,
    branchIds: [],
    menuIds: [],
    categoryIds: [],
    productIds: [],
    deliveryZoneIds: [],
    translations: [{ locale: 'en', title: 'Draft', description: null }],
    ...overrides,
  };
}

function sample(
  name: string,
  unitPrice: string,
  overrides: Partial<PreviewSample> = {},
): PreviewSample {
  return {
    productId: `id-${name}`,
    engineProductId: `id-${name}`,
    categoryId: 'cat-1',
    menuId: 'menu-1',
    variantId: null,
    sizeDiscountApplies: true,
    unitPrice: d(unitPrice),
    productDiscount: null,
    label: name,
    ...overrides,
  };
}

const lineOf = (
  { sample: product, quantity }: BasketLine,
  index: number,
): EngineProductLine => ({
  index,
  kind: 'PRODUCT',
  productId: product.engineProductId,
  categoryId: product.categoryId,
  menuId: product.menuId,
  variantId: product.variantId,
  sizeDiscountApplies: product.sizeDiscountApplies,
  quantity,
  unitPrice: product.unitPrice,
  modifiersUnitTotal: d('0'),
  productDiscount: product.productDiscount,
});

/** The environment the service builds, over the REAL engine; `calls` counts engine evaluations. */
function environment(
  draftConfig: PromotionConfig,
  others: EnginePromotion[] = [],
  context: EngineContext = CONTEXT,
) {
  const draft = toPromotionCandidate(
    draftConfig,
    DRAFT_ID,
    'ACTIVE',
    'en',
  ).promotion;
  const calls = { count: 0 };
  const run = (
    basket: readonly BasketLine[],
    promotions: EnginePromotion[],
    plain: boolean,
  ) => {
    calls.count += 1;
    const result = evaluatePromotions({
      lines: basket.map((line, index) =>
        lineOf(
          plain
            ? { ...line, sample: { ...line.sample, productDiscount: null } }
            : line,
          index,
        ),
      ),
      promotions,
      context,
    });
    const evaluation = result.evaluations.find(
      ({ promotionId }) => promotionId === DRAFT_ID,
    )!;
    return {
      result,
      evaluation,
      applied:
        result.applied.find(({ promotionId }) => promotionId === DRAFT_ID) ??
        null,
    };
  };
  const env: ExampleEnvironment = {
    draftId: DRAFT_ID,
    evaluate: (basket) => run(basket, [...others, draft], false),
    evaluateAlone: (basket) => run(basket, [draft], true),
    zoneMinimumShortfall: () => null,
    promotionName: (id) => `name of ${id}`,
  };
  return { env, calls, draft };
}

const burger = sample('Burger', '120.00');
const kinds = (set: ReturnType<typeof buildExamples>) =>
  set.examples.map(({ kind }) => kind);

describe('hasThreshold', () => {
  it('is configuration only: a positive minimum on CART / DELIVERY / QUANTITY, a quantity on QUANTITY', () => {
    expect(hasThreshold(config())).toBe(true);
    expect(hasThreshold(config({ minimumSubtotal: null }))).toBe(false);
    expect(hasThreshold(config({ minimumSubtotal: d('0.00') }))).toBe(false);
    expect(
      hasThreshold(config({ scope: 'DELIVERY', minimumSubtotal: d('1.00') })),
    ).toBe(true);
    expect(
      hasThreshold(config({ scope: 'DELIVERY', minimumSubtotal: null })),
    ).toBe(false);
    expect(
      hasThreshold(
        config({
          scope: 'QUANTITY',
          minimumSubtotal: null,
          minimumQuantity: 3,
          quantityBasis: 'UNITS',
        }),
      ),
    ).toBe(true);
    expect(
      hasThreshold(
        config({
          scope: 'CATEGORY',
          categoryIds: ['cat-1'],
          minimumSubtotal: null,
        }),
      ),
    ).toBe(false);
  });
});

describe('buildExamples: the smallest qualifying and the largest below-threshold basket', () => {
  it('finds the boundary exactly: 119.99 < 120.00 = 120.00 < 120.01 (Burger 120.00)', () => {
    const at = buildExamples(
      config({ minimumSubtotal: d('120.00') }),
      [burger],
      environment(config({ minimumSubtotal: d('120.00') })).env,
    );
    expect(kinds(at)).toEqual(['QUALIFYING']);
    expect(at.omittedExamples).toEqual([
      { kind: 'BELOW_THRESHOLD', reason: 'SINGLE_UNIT_REACHES_THRESHOLD' },
    ]);
    const cfg = config({ minimumSubtotal: d('120.01') });
    const over = buildExamples(cfg, [burger], environment(cfg).env);
    expect(kinds(over)).toEqual(['BELOW_THRESHOLD', 'QUALIFYING']);
    expect(over.examples[0].lines).toEqual([
      {
        productId: 'id-Burger',
        label: 'Burger',
        unitPrice: '120.00',
        quantity: 1,
      },
    ]);
    expect(over.examples[0].diagnostic.remainingAmount).toBe('0.01');
    expect(over.examples[1].lines[0].quantity).toBe(2);
  });

  it('every figure is a direct engine result for the same lines', () => {
    const cfg = config();
    const { env, draft } = environment(cfg);
    const set = buildExamples(cfg, [burger], env);
    for (const example of set.examples) {
      const quantity = example.lines[0].quantity;
      const direct = evaluatePromotions({
        lines: [lineOf({ sample: burger, quantity }, 0)],
        promotions: [draft],
        context: CONTEXT,
      });
      expect(example.merchandiseOriginal).toBe(
        direct.merchandiseOriginal.toFixed(2),
      );
      expect(example.merchandisePayable).toBe(
        direct.merchandisePayable.toFixed(2),
      );
      expect(example.grandTotal).toBe(direct.grandTotal.toFixed(2));
      expect(example.strategy).toBe(direct.strategy);
      expect(example.appliedSaving).toBe(
        (direct.applied[0]?.amount ?? d('0')).toFixed(2),
      );
    }
  });

  it('is deterministic and uses a bounded number of engine evaluations', () => {
    const cfg = config({ minimumSubtotal: d('100000.00') });
    const first = environment(cfg);
    const second = environment(cfg);
    const a = buildExamples(cfg, [burger], first.env);
    const b = buildExamples(cfg, [burger], second.env);
    expect(b).toStrictEqual(a);
    expect(first.calls.count).toBeLessThanOrEqual(MAX_LINE_QUANTITY + 2);
    expect(a.omittedExamples).toEqual([
      { kind: 'QUALIFYING', reason: 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE' },
    ]);
    expect(a.examples[0].lines[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it('QUANTITY by units (with or without a spend) and by distinct products', () => {
    const units = config({
      scope: 'QUANTITY',
      minimumSubtotal: null,
      minimumQuantity: 3,
      quantityBasis: 'UNITS',
      discountType: 'FIXED_AMOUNT',
      value: d('30.00'),
    });
    const set = buildExamples(units, [burger], environment(units).env);
    expect(set.examples.map(({ lines }) => lines[0].quantity)).toEqual([2, 3]);
    expect(set.examples[0].diagnostic.remainingQuantity).toBe(1);
    expect(set.examples[1].appliedSaving).toBe('30.00');

    // a spend on top of the units: 3 units are 360.00 < 400.00, so a 4th is needed
    const both = { ...units, minimumSubtotal: d('400.00') };
    const spend = buildExamples(both, [burger], environment(both).env);
    expect(spend.examples.map(({ lines }) => lines[0].quantity)).toEqual([
      3, 4,
    ]);

    const distinct = { ...units, quantityBasis: 'DISTINCT_PRODUCTS' as const };
    const products = [
      burger,
      sample('Cola', '40.00'),
      sample('Cake', '30.00'),
      sample('Mint', '0.50'),
    ];
    const set3 = buildExamples(distinct, products, environment(distinct).env);
    expect(
      set3.examples.map(({ lines }) => lines.map(({ label }) => label)),
    ).toEqual([
      ['Burger', 'Cola'],
      ['Burger', 'Cola', 'Cake'],
    ]);
    // five different products but only four exist
    const five = { ...distinct, minimumQuantity: 5 };
    const impossible = buildExamples(five, products, environment(five).env);
    expect(impossible.omittedExamples).toEqual([
      { kind: 'QUALIFYING', reason: 'NOT_ENOUGH_DISTINCT_PRODUCTS' },
    ]);
    expect(impossible.examples[0].lines).toHaveLength(4);
  });

  it('item scopes give one SINGLE example of one unit (fixed per unit, capped at the unit price)', () => {
    const fixed = config({
      scope: 'CATEGORY',
      categoryIds: ['cat-1'],
      minimumSubtotal: null,
      discountType: 'FIXED_AMOUNT',
      value: d('200.00'),
    });
    const set = buildExamples(fixed, [burger], environment(fixed).env);
    expect(set.omittedExamples).toEqual([]);
    expect(set.examples).toHaveLength(1);
    expect(set.examples[0]).toMatchObject({
      kind: 'SINGLE',
      appliedSaving: '120.00',
      merchandisePayable: '0.00',
    });
  });

  it('names the winner and keeps the draft potential saving when it loses', () => {
    const rival: EnginePromotion = {
      ...toPromotionCandidate(
        config({
          scope: 'CATEGORY',
          categoryIds: ['cat-1'],
          minimumSubtotal: null,
          value: d('40.00'),
        }),
        'rival-id',
        'ACTIVE',
        'en',
      ).promotion,
    };
    const cfg = config({
      scope: 'CATEGORY',
      categoryIds: ['cat-1'],
      minimumSubtotal: null,
      value: d('30.00'),
    });
    const { env } = environment(cfg, [rival]);
    const [single] = buildExamples(cfg, [burger], env).examples;
    expect(single.diagnostic).toMatchObject({
      status: 'LOST_TO_BETTER_OFFER',
      potentialSaving: '36.00',
    });
    expect(single.appliedSaving).toBe('0.00');
    expect(single.competingWinner).toEqual({
      source: 'PROMOTION',
      promotionId: 'rival-id',
      scope: 'CATEGORY',
      name: 'name of rival-id',
      discountType: 'PERCENTAGE',
      value: '40.00',
      saving: '48.00',
    });
    // the legacy Product discount as the winner
    const legacy = sample('Latte', '50.00', {
      productDiscount: {
        type: 'PERCENTAGE',
        value: d('20.00'),
        enabled: true,
        startsOn: null,
        endsOn: null,
      },
    });
    const small = config({
      scope: 'CATEGORY',
      categoryIds: ['cat-1'],
      minimumSubtotal: null,
      value: d('5.00'),
    });
    const [lost] = buildExamples(
      small,
      [legacy],
      environment(small).env,
    ).examples;
    expect(lost.competingWinner).toMatchObject({
      source: 'PRODUCT_DISCOUNT',
      promotionId: null,
      scope: 'PRODUCT',
      saving: '10.00',
    });
    expect(lost.diagnostic.potentialSaving).toBe('2.50');
  });

  it('a draft that cannot act here is one honest example with the threshold pair omitted', () => {
    const elsewhere = config({ branchIds: ['another-branch'] });
    const set = buildExamples(elsewhere, [burger], environment(elsewhere).env);
    expect(kinds(set)).toEqual(['SINGLE']);
    expect(set.examples[0].diagnostic.status).toBe('WRONG_BRANCH');
    expect(set.omittedExamples.map(({ reason }) => reason)).toEqual([
      'DRAFT_NOT_APPLICABLE_IN_CONTEXT',
      'DRAFT_NOT_APPLICABLE_IN_CONTEXT',
    ]);
  });

  it('placeholder samples (ILLUSTRATIVE) keep productId null in every line', () => {
    const illustrative = sample('Sample item 1', '100.00', {
      productId: null,
      engineProductId: '00000000-0000-4000-8000-000000000001',
    });
    const cfg = config({ minimumSubtotal: d('150.00') });
    const set = buildExamples(cfg, [illustrative], environment(cfg).env);
    expect(
      set.examples.flatMap(({ lines }) =>
        lines.map(({ productId }) => productId),
      ),
    ).toEqual([null, null]);
    expect(set.examples[1].appliedSaving).toBe('20.00');
  });
});
