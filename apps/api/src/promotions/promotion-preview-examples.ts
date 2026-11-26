import { Prisma } from '../generated/prisma/client';
import type { ProductDiscountConfig } from '../menu/product-discount';
import type {
  AppliedPromotionSnapshot,
  EngineResult,
  EngineStrategy,
  PromotionEvaluation,
  PromotionEvaluationStatus,
  PromotionScopeName,
} from './promotion-engine';
import type { PromotionConfig } from './promotion-config';

/**
 * DEC-077 B3: deterministic example baskets for the contextual preview.
 *
 * This module decides WHICH basket to show, never what it costs. Every money figure of an example is produced by the
 * caller-supplied `evaluate` function (the shared `evaluatePromotions` engine on the same candidates, Branch date and
 * context the Guest quote uses). Quantities are found by asking the engine whether a basket reaches the draft's
 * threshold (a monotone yes / no), so there is no second implementation of eligibility, discount or rounding here.
 */

const ZERO = new Prisma.Decimal(0);

/** A Guest line holds 1..99 units (the same bound as the Guest cart and the preview items). */
export const MAX_LINE_QUANTITY = 99;
/** A basket holds at most this many lines (the same bound as the legacy preview items). */
export const MAX_BASKET_LINES = 20;

export type ExampleKind = 'QUALIFYING' | 'BELOW_THRESHOLD' | 'SINGLE';

export type OmittedExampleReason =
  /** One sample unit already reaches the threshold, so no real basket can fall below it. */
  | 'SINGLE_UNIT_REACHES_THRESHOLD'
  /** Even the largest basket built from the sample does not reach the threshold. */
  | 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE'
  /** A distinct-products threshold needs more different applicable products than exist. */
  | 'NOT_ENOUGH_DISTINCT_PRODUCTS'
  /** The draft does not apply in this context (Branch, zone, order type, schedule, fee), so no threshold pair exists. */
  | 'DRAFT_NOT_APPLICABLE_IN_CONTEXT';

/** One catalog product (REAL) or Backend-held sample (ILLUSTRATIVE) a basket line is made of. */
export interface PreviewSample {
  /** The id shown to Staff; null for an ILLUSTRATIVE sample (it is not a restaurant product). */
  productId: string | null;
  /** The id the engine sees: the real product id, or a stable placeholder that matches the draft's targets. */
  engineProductId: string;
  categoryId: string;
  menuId: string;
  variantId: string | null;
  sizeDiscountApplies: boolean;
  unitPrice: Prisma.Decimal;
  productDiscount: ProductDiscountConfig | null;
  label: string;
}

export interface BasketLine {
  sample: PreviewSample;
  quantity: number;
}

export interface BasketEvaluation {
  result: EngineResult;
  /** The draft's own evaluation inside `result`. */
  evaluation: PromotionEvaluation;
  /** The draft's applied snapshot, null when it did not win. */
  applied: AppliedPromotionSnapshot | null;
}

export interface ExampleEnvironment {
  /** Prices the basket with the shared engine. Pure; the only source of every figure. */
  evaluate(basket: readonly BasketLine[]): BasketEvaluation;
  /**
   * Prices the basket with the draft alone and without legacy Product discounts: the draft's own saving, independent of
   * competition. The engine reports no potential saving for an item promotion that lost, so this supplies it.
   */
  evaluateAlone(basket: readonly BasketLine[]): BasketEvaluation;
  /** The zone minimum shortfall for a priced basket (null when no zone or the minimum is met). */
  zoneMinimumShortfall(result: EngineResult): string | null;
  /** The Staff-facing name of another active promotion, when known. */
  promotionName(promotionId: string): string | null;
  draftId: string;
}

export interface CompetingWinner {
  source: 'PROMOTION' | 'PRODUCT_DISCOUNT';
  promotionId: string | null;
  scope: PromotionScopeName | 'PRODUCT';
  name: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  value: string | null;
  /** The winner's saving as reported by the engine (`applied[].amount`, or the legacy discount total). */
  saving: string;
}

export interface ExampleLine {
  productId: string | null;
  label: string;
  unitPrice: string;
  quantity: number;
}

export interface ContextualExample {
  kind: ExampleKind;
  lines: ExampleLine[];
  strategy: EngineStrategy;
  merchandiseOriginal: string;
  merchandisePayable: string;
  deliveryFeeOriginal: string;
  deliveryFeePayable: string;
  grandTotal: string;
  appliedSaving: string;
  diagnostic: {
    status: PromotionEvaluationStatus;
    potentialSaving: string;
    remainingAmount: string | null;
    remainingQuantity: number | null;
  };
  zoneMinimumShortfall: string | null;
  competingWinner?: CompetingWinner;
}

export interface OmittedExample {
  kind: Exclude<ExampleKind, 'SINGLE'>;
  reason: OmittedExampleReason;
}

export interface ExampleSet {
  examples: ContextualExample[];
  omittedExamples: OmittedExample[];
}

/** The draft cannot act on this basket at all (not a threshold shortfall): the threshold pair is meaningless. */
const NOT_APPLICABLE: ReadonlySet<PromotionEvaluationStatus> = new Set([
  'INACTIVE',
  'NOT_STARTED',
  'EXPIRED',
  'WRONG_BRANCH',
  'WRONG_ORDER_TYPE',
  'WRONG_ZONE',
  'NO_DELIVERY_FEE',
  'INVALID_CONFIGURATION',
]);

function belowThreshold(status: PromotionEvaluationStatus): boolean {
  return (
    status === 'BELOW_MINIMUM_SUBTOTAL' || status === 'BELOW_MINIMUM_QUANTITY'
  );
}

/** Does the draft carry a threshold a basket can fall below? (Configuration only; the engine judges the baskets.) */
export function hasThreshold(config: PromotionConfig): boolean {
  switch (config.scope) {
    case 'CART':
    case 'DELIVERY':
      return (
        config.minimumSubtotal !== null && config.minimumSubtotal.greaterThan(0)
      );
    case 'QUANTITY':
      return (
        (config.minimumQuantity !== null && config.minimumQuantity > 0) ||
        (config.minimumSubtotal !== null &&
          config.minimumSubtotal.greaterThan(0))
      );
    default:
      return false;
  }
}

/**
 * The ladder of ever larger baskets, smallest first. Units / spend thresholds grow one sample's quantity; a
 * distinct-products threshold first adds one more distinct product at a time, then grows every line.
 */
function* ladder(
  config: PromotionConfig,
  samples: readonly PreviewSample[],
): Generator<BasketLine[]> {
  if (samples.length === 0) return;
  if (
    config.scope === 'QUANTITY' &&
    config.quantityBasis === 'DISTINCT_PRODUCTS'
  ) {
    const distinct = samples.slice(0, MAX_BASKET_LINES);
    for (let count = 1; count <= distinct.length; count += 1) {
      yield distinct.slice(0, count).map((sample) => ({ sample, quantity: 1 }));
    }
    // More units of the same products only help a spend threshold that comes with the distinct-products one.
    const spend =
      config.minimumSubtotal !== null && config.minimumSubtotal.greaterThan(0);
    for (
      let quantity = 2;
      spend && quantity <= MAX_LINE_QUANTITY;
      quantity += 1
    ) {
      yield distinct.map((sample) => ({ sample, quantity }));
    }
    return;
  }
  for (let quantity = 1; quantity <= MAX_LINE_QUANTITY; quantity += 1) {
    yield [{ sample: samples[0], quantity }];
  }
}

function competingWinner(
  scope: PromotionScopeName,
  evaluated: BasketEvaluation,
  environment: ExampleEnvironment,
): CompetingWinner | undefined {
  if (evaluated.evaluation.status !== 'LOST_TO_BETTER_OFFER') return undefined;
  const { result } = evaluated;
  // A delivery fee promotion competes only with other delivery fee promotions; every other scope with the rest.
  const delivery = scope === 'DELIVERY';
  let best: AppliedPromotionSnapshot | null = null;
  for (const entry of result.applied) {
    if (entry.promotionId === environment.draftId) continue;
    if ((entry.scope === 'DELIVERY') !== delivery) continue;
    if (best === null || entry.amount.greaterThan(best.amount)) best = entry;
  }
  const legacy = delivery ? null : result.legacyDiscountTotal;
  if (
    legacy &&
    legacy.greaterThan(0) &&
    (best === null || legacy.greaterThan(best.amount))
  ) {
    return {
      source: 'PRODUCT_DISCOUNT',
      promotionId: null,
      scope: 'PRODUCT',
      name: null,
      discountType: null,
      value: null,
      saving: legacy.toFixed(2),
    };
  }
  if (best === null) return undefined;
  return {
    source: 'PROMOTION',
    promotionId: best.promotionId,
    scope: best.scope,
    name: environment.promotionName(best.promotionId),
    discountType: best.discountType,
    value: best.value.toFixed(2),
    saving: best.amount.toFixed(2),
  };
}

export function toExample(
  kind: ExampleKind,
  scope: PromotionScopeName,
  basket: readonly BasketLine[],
  evaluated: BasketEvaluation,
  environment: ExampleEnvironment,
): ContextualExample {
  const { result, evaluation, applied } = evaluated;
  const winner = competingWinner(scope, evaluated, environment);
  // D3.6: a draft that lost shows what it would have saved. Cart and delivery losers carry it already.
  const potentialSaving =
    evaluation.status === 'LOST_TO_BETTER_OFFER' &&
    !evaluation.potentialSaving.greaterThan(ZERO)
      ? environment.evaluateAlone(basket).evaluation.potentialSaving
      : evaluation.potentialSaving;
  return {
    kind,
    lines: basket.map(({ sample, quantity }) => ({
      productId: sample.productId,
      label: sample.label,
      unitPrice: sample.unitPrice.toFixed(2),
      quantity,
    })),
    strategy: result.strategy,
    merchandiseOriginal: result.merchandiseOriginal.toFixed(2),
    merchandisePayable: result.merchandisePayable.toFixed(2),
    deliveryFeeOriginal: result.deliveryFeeOriginal.toFixed(2),
    deliveryFeePayable: result.deliveryFeePayable.toFixed(2),
    grandTotal: result.grandTotal.toFixed(2),
    appliedSaving: (applied?.amount ?? ZERO).toFixed(2),
    diagnostic: {
      status: evaluation.status,
      potentialSaving: potentialSaving.toFixed(2),
      remainingAmount: evaluation.remainingAmount?.toFixed(2) ?? null,
      remainingQuantity: evaluation.remainingQuantity,
    },
    zoneMinimumShortfall: environment.zoneMinimumShortfall(result),
    ...(winner ? { competingWinner: winner } : {}),
  };
}

/**
 * The deterministic example set of one draft over an ordered sample list (the chosen sample first).
 *
 * - No threshold (item scopes, or a CART / QUANTITY / DELIVERY draft without one): one `SINGLE` example of one unit.
 * - Threshold: a `BELOW_THRESHOLD` example (the largest basket still short of it) and a `QUALIFYING` example (the
 *   smallest basket that reaches it). A missing half is listed in `omittedExamples` with the reason.
 */
export function buildExamples(
  config: PromotionConfig,
  samples: readonly PreviewSample[],
  environment: ExampleEnvironment,
): ExampleSet {
  const scope = config.scope;
  const first: BasketLine[] = [{ sample: samples[0], quantity: 1 }];
  const firstEvaluated = environment.evaluate(first);
  const thresholds = hasThreshold(config);

  if (!thresholds) {
    return {
      examples: [
        toExample('SINGLE', scope, first, firstEvaluated, environment),
      ],
      omittedExamples: [],
    };
  }
  if (NOT_APPLICABLE.has(firstEvaluated.evaluation.status)) {
    return {
      examples: [
        toExample('SINGLE', scope, first, firstEvaluated, environment),
      ],
      omittedExamples: [
        { kind: 'BELOW_THRESHOLD', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
        { kind: 'QUALIFYING', reason: 'DRAFT_NOT_APPLICABLE_IN_CONTEXT' },
      ],
    };
  }

  let below: { basket: BasketLine[]; evaluated: BasketEvaluation } | null =
    null;
  let qualifying: { basket: BasketLine[]; evaluated: BasketEvaluation } | null =
    null;
  for (const basket of ladder(config, samples)) {
    const evaluated = environment.evaluate(basket);
    if (belowThreshold(evaluated.evaluation.status)) {
      below = { basket, evaluated };
      continue;
    }
    qualifying = { basket, evaluated };
    break;
  }

  const examples: ContextualExample[] = [];
  const omittedExamples: OmittedExample[] = [];
  if (below) {
    examples.push(
      toExample(
        'BELOW_THRESHOLD',
        scope,
        below.basket,
        below.evaluated,
        environment,
      ),
    );
  } else {
    omittedExamples.push({
      kind: 'BELOW_THRESHOLD',
      reason: 'SINGLE_UNIT_REACHES_THRESHOLD',
    });
  }
  if (qualifying) {
    examples.push(
      toExample(
        'QUALIFYING',
        scope,
        qualifying.basket,
        qualifying.evaluated,
        environment,
      ),
    );
  } else {
    omittedExamples.push({
      kind: 'QUALIFYING',
      reason:
        config.scope === 'QUANTITY' &&
        config.quantityBasis === 'DISTINCT_PRODUCTS' &&
        config.minimumQuantity !== null &&
        samples.length < config.minimumQuantity
          ? 'NOT_ENOUGH_DISTINCT_PRODUCTS'
          : 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE',
    });
  }
  return { examples, omittedExamples };
}
