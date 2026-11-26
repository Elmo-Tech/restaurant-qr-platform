import { Prisma } from '../generated/prisma/client';
import type { PromotionConfig } from './promotion-config';
import type { EngineContext, EnginePromotion } from './promotion-engine';
import { createEnvironment } from './promotion-preview-environment';
import {
  toExample,
  type BasketLine,
  type PreviewSample,
} from './promotion-preview-examples';
import { toPromotionCandidate } from './promotions.service';

const d = (value: string) => new Prisma.Decimal(value);
const DRAFT_ID = 'preview-draft';
const RIVAL = '5f2c0000-0000-4000-8000-000000000001';
const RIVAL_2 = '6a2c0000-0000-4000-8000-000000000002';
const PICKUP: EngineContext = {
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
    minimumSubtotal: null,
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

const promotion = (
  id: string,
  overrides: Partial<PromotionConfig>,
): EnginePromotion =>
  toPromotionCandidate(config(overrides), id, 'ACTIVE', 'en').promotion;

function sample(
  name: string,
  unitPrice: string,
  categoryId: string,
  legacyPercent?: string,
): PreviewSample {
  return {
    productId: `id-${name}`,
    engineProductId: `id-${name}`,
    categoryId,
    menuId: 'menu-1',
    variantId: null,
    sizeDiscountApplies: true,
    unitPrice: d(unitPrice),
    productDiscount: legacyPercent
      ? {
          type: 'PERCENTAGE',
          value: d(legacyPercent),
          enabled: true,
          startsOn: null,
          endsOn: null,
        }
      : null,
    label: name,
  };
}

const burger = sample('Burger', '120.00', 'burgers');
const latte = sample('Latte', '50.00', 'drinks', '20.00'); // legacy 20 % = 10.00
const basket = (...samples: PreviewSample[]): BasketLine[] =>
  samples.map((entry) => ({ sample: entry, quantity: 1 }));

function exampleOf(
  draftConfig: PromotionConfig,
  others: EnginePromotion[],
  lines: BasketLine[],
  options: { saved?: boolean; context?: EngineContext } = {},
) {
  const draft = promotion(DRAFT_ID, draftConfig);
  const environment = createEnvironment({
    draft,
    competitors: others,
    context: options.context ?? PICKUP,
    saved: options.saved ?? false,
    config: draftConfig,
    zoneMinimumShortfall: () => null,
    promotionName: (id) => `name of ${id}`,
  });
  return toExample(
    'SINGLE',
    draftConfig.scope,
    lines,
    environment.evaluate(lines),
    environment,
  );
}

const categoryDraft = (categoryId: string, value: string) =>
  config({
    scope: 'CATEGORY',
    categoryIds: [categoryId],
    value: d(value),
  });

describe('competingWinner explains the loss the engine actually applied', () => {
  it('does not blame a promotion on another product: only the offers on the draft own lines count', () => {
    // Draft: Drinks 5 %. The Latte (its only targeted line) keeps its legacy 20 %. An unrelated Burgers 40 % exists.
    const unrelated = promotion(RIVAL, {
      scope: 'CATEGORY',
      categoryIds: ['burgers'],
      value: d('40.00'),
    });
    const example = exampleOf(
      categoryDraft('drinks', '5.00'),
      [unrelated],
      basket(latte, burger),
    );
    expect(example.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
    expect(example.competingWinner).toMatchObject({
      reason: 'ITEM_OFFER_BEATEN_ON_SAME_ITEMS',
      combined: false,
      saving: '10.00',
      comparedSaving: '2.50',
      winners: [{ source: 'PRODUCT_DISCOUNT', saving: '10.00' }],
    });
    // The unrelated Burgers promotion is applied (to the Burger) but is not the reason.
    expect(example.competingWinner?.winners.map((w) => w.promotionId)).toEqual([
      null,
    ]);
  });

  it('reports several offers that win together, with the combined saving', () => {
    // Draft: CART 10 %. Burgers 40 % (48.00) and the Latte legacy 20 % (10.00) together save 58.00 > 17.00.
    const burgers40 = promotion(RIVAL, {
      scope: 'CATEGORY',
      categoryIds: ['burgers'],
      value: d('40.00'),
    });
    const example = exampleOf(config(), [burgers40], basket(burger, latte));
    expect(example.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
    expect(example.strategy).toBe('ITEM');
    expect(example.competingWinner).toMatchObject({
      reason: 'CART_LEVEL_BEATEN_BY_ITEM_OFFERS',
      combined: true,
      saving: '58.00',
      comparedSaving: '17.00',
    });
    expect(
      example.competingWinner?.winners.map(({ source, saving }) => [
        source,
        saving,
      ]),
    ).toEqual([
      ['PROMOTION', '48.00'],
      ['PRODUCT_DISCOUNT', '10.00'],
    ]);
    // the total is what the Guest actually pays less: nothing but the item offers applied
    expect(example.merchandisePayable).toBe('112.00');
    expect(example.appliedSaving).toBe('0.00');
  });

  it('a CART draft that loses to another CART promotion names that single winner', () => {
    const better = promotion(RIVAL, { value: d('20.00') });
    const example = exampleOf(config(), [better], basket(burger));
    expect(example.competingWinner).toMatchObject({
      reason: 'CART_LEVEL_BEATEN_BY_BETTER_CART_LEVEL',
      combined: false,
      saving: '24.00',
      comparedSaving: '12.00',
      winners: [{ promotionId: RIVAL, scope: 'CART', value: '20.00' }],
    });
  });

  it('an item draft that wins its lines but loses to a basket promotion says so, with both figures', () => {
    // Burgers 10 % (12.00) would win its line; a CART 50 % (60.00) saves strictly more than all item offers together.
    const cart50 = promotion(RIVAL, { value: d('50.00') });
    const example = exampleOf(
      categoryDraft('burgers', '10.00'),
      [cart50],
      basket(burger),
    );
    expect(example.diagnostic).toMatchObject({
      status: 'LOST_TO_BETTER_OFFER',
      potentialSaving: '12.00',
    });
    expect(example.appliedSaving).toBe('0.00');
    expect(example.competingWinner).toMatchObject({
      reason: 'ITEM_OFFER_BEATEN_BY_CART_LEVEL',
      combined: false,
      saving: '60.00',
      comparedSaving: '12.00',
      winners: [{ promotionId: RIVAL, scope: 'CART' }],
    });
  });

  it('a delivery fee draft that loses names the better delivery promotion; potential and applied stay apart', () => {
    const free = promotion(RIVAL, {
      scope: 'DELIVERY',
      value: d('100.00'),
    });
    const context: EngineContext = {
      ...PICKUP,
      orderType: 'DELIVERY',
      deliveryZoneId: 'zone-1',
      deliveryFee: d('30.00'),
    };
    const example = exampleOf(
      config({ scope: 'DELIVERY', value: d('50.00') }),
      [free],
      basket(burger),
      { context },
    );
    expect(example.appliedSaving).toBe('0.00');
    expect(example.diagnostic.potentialSaving).toBe('15.00');
    expect(example.competingWinner).toMatchObject({
      reason: 'DELIVERY_BEATEN_BY_BETTER_DELIVERY',
      combined: false,
      saving: '30.00',
      comparedSaving: '15.00',
      winners: [{ promotionId: RIVAL, scope: 'DELIVERY' }],
    });
  });

  it('there is no competingWinner when the draft is applied', () => {
    const example = exampleOf(
      categoryDraft('burgers', '10.00'),
      [],
      basket(burger),
    );
    expect(example.diagnostic.status).toBe('APPLIED');
    expect(example.competingWinner).toBeUndefined();
    expect(example.appliedSaving).toBe('12.00');
  });
});

describe('an unsaved draft discloses an outcome that depends on its not-yet-existing id', () => {
  // Same saving, priority and scope as the rival: only the promotion id decides.
  const rival = promotion(RIVAL, {
    scope: 'CATEGORY',
    categoryIds: ['burgers'],
    value: d('10.00'),
  });
  const draftConfig = categoryDraft('burgers', '10.00');

  it('flags the exact tie and states the alternative outcome', () => {
    const example = exampleOf(draftConfig, [rival], basket(burger));
    // priced as sorting last: it loses the tie ...
    expect(example.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
    expect(example.appliedSaving).toBe('0.00');
    // ... but a saved id that sorts first would win it
    expect(example.uncertainty).toEqual({
      code: 'UNSAVED_DRAFT_ID_TIE_BREAK',
      alternative: { status: 'APPLIED', appliedSaving: '12.00' },
    });
  });

  it('a saved draft has its final id: no uncertainty', () => {
    const example = exampleOf(draftConfig, [rival], basket(burger), {
      saved: true,
    });
    expect(example.uncertainty).toBeNull();
  });

  it('no tie, no uncertainty: a clearly better or clearly worse draft', () => {
    const better = exampleOf(
      categoryDraft('burgers', '30.00'),
      [rival],
      basket(burger),
    );
    expect(better.diagnostic.status).toBe('APPLIED');
    expect(better.uncertainty).toBeNull();
    const worse = exampleOf(
      categoryDraft('burgers', '5.00'),
      [rival],
      basket(burger),
    );
    expect(worse.diagnostic.status).toBe('LOST_TO_BETTER_OFFER');
    expect(worse.uncertainty).toBeNull();
  });

  it('a tie between two OTHER promotions does not concern the draft', () => {
    const other = promotion(RIVAL_2, {
      scope: 'CATEGORY',
      categoryIds: ['burgers'],
      value: d('10.00'),
    });
    const example = exampleOf(
      categoryDraft('burgers', '1.00'),
      [rival, other],
      basket(burger),
    );
    expect(example.uncertainty).toBeNull();
  });
});
