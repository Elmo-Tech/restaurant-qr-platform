import { Prisma } from '../generated/prisma/client';
import {
  computeUnitDiscount,
  isValidCalendarDate,
  resolveActiveDiscount,
  type ProductDiscountConfig,
  type ProductDiscountKind,
} from '../menu/product-discount';

/**
 * Unified Promotions Engine -- milestone B1. Winner policy accepted by the
 * Product Owner on 2026-11-21 (DEC-075, maximum savings first; amends
 * PROMOTIONS_SPEC.md #27-#29 and AGENTS.md #36 for this engine). See
 * PROMOTIONS_SPEC.md "Implementation Amendment: Unified Promotions",
 * PROMOTIONS_STACKING_EXAMPLES.md and UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md.
 * Not wired into ordering yet (B2).
 *
 * Pure and clock-free like `product-discount.ts`: the caller loads the priced
 * cart lines and the candidate promotions, computes `today` in the ORDER
 * Branch timezone (`localDateIn`) and passes everything in. No Prisma client,
 * no `Date.now()`, money is `Prisma.Decimal` only (allocation uses exact
 * integer cents as `bigint`), every rounding is explicit ROUND_HALF_UP.
 *
 * Bounded, explicit policy -- not a rule interpreter:
 *   R1 item scope   per product line, the legacy Product discount (only when
 *                   the chosen size has `discountApplies`), CATEGORY and MENU
 *                   promotions (PERCENTAGE or, since DEC-077 B1, FIXED_AMOUNT
 *                   per purchased unit, capped at the unit's original price,
 *                   paid extras excluded) compete; the greatest line saving
 *                   wins; exact tie -> lower priority number -> PRODUCT >
 *                   CATEGORY > MENU -> promotion id ascending.
 *   R2 cart scope   CART and QUANTITY promotions compete for ONE winner over
 *                   the eligible product lines (offers never count).
 *   R3 strategy     item total (A) vs cart winner (B): B only when B > A
 *                   strictly; never combined. The cart discount is allocated
 *                   to its eligible lines by largest remainder.
 *   R4 delivery     one DELIVERY winner on the delivery fee, independent of R3.
 *   R5 offer lines  never discounted, never counted for item / cart rules,
 *                   but part of the payable total and of the delivery basis.
 * The Delivery Zone minimum order (DEC-036) is NOT checked here: the caller
 * checks it on `merchandisePayable` after the engine (no fallback strategy).
 */

export type PromotionScopeName =
  'CATEGORY' | 'MENU' | 'CART' | 'QUANTITY' | 'DELIVERY';
export type PromotionDiscountTypeName = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PromotionStatusName = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type PromotionQuantityBasisName = 'UNITS' | 'DISTINCT_PRODUCTS';
export type EngineOrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

/**
 * The legacy Product discount (`products.discount_*`) is not a Promotion row;
 * it enters the item-scope competition with this effective priority (the
 * highest possible, so it wins every exact-saving tie by priority).
 */
export const LEGACY_PRODUCT_DISCOUNT_PRIORITY = 0;

/** Item-scope specificity used as the third tie-break (lower wins). */
const SPECIFICITY = { PRODUCT: 0, CATEGORY: 1, MENU: 2 } as const;

/** One Promotion as the engine needs it (targets already loaded as id lists). */
export interface EnginePromotion {
  id: string;
  scope: PromotionScopeName;
  discountType: PromotionDiscountTypeName;
  value: Prisma.Decimal;
  status: PromotionStatusName;
  priority: number;
  /** Inclusive calendar dates `YYYY-MM-DD`, or null for open-ended. */
  startsOn: string | null;
  endsOn: string | null;
  minimumSubtotal: Prisma.Decimal | null;
  minimumQuantity: number | null;
  quantityBasis: PromotionQuantityBasisName | null;
  /** Empty = every Branch of the Restaurant. */
  branchIds: readonly string[];
  /** MENU scope targets (required non-empty for MENU). */
  menuIds: readonly string[];
  /** CATEGORY scope targets; optional restriction for CART / QUANTITY. */
  categoryIds: readonly string[];
  /** Optional restriction for CART / QUANTITY. */
  productIds: readonly string[];
  /** DELIVERY only. Empty = every zone of the eligible Branches. */
  deliveryZoneIds: readonly string[];
}

export interface EngineProductLine {
  index: number;
  kind: 'PRODUCT';
  productId: string;
  categoryId: string;
  menuId: string;
  variantId: string | null;
  /** The chosen size's `discountApplies`; true for a Product without sizes. */
  sizeDiscountApplies: boolean;
  quantity: number;
  /** Pre-discount unit price: the chosen size price, else the Product base price. */
  unitPrice: Prisma.Decimal;
  /** Sum of the paid modifier adjustments of ONE unit. */
  modifiersUnitTotal: Prisma.Decimal;
  /** The Product's legacy discount configuration (null = none configured). */
  productDiscount: ProductDiscountConfig | null;
}

export interface EngineOfferLine {
  index: number;
  kind: 'OFFER';
  quantity: number;
  /** Offer price + chosen adjustments for ONE unit (`resolveOfferChoices().unitTotal`). */
  offerUnitTotal: Prisma.Decimal;
}

export type EngineLine = EngineProductLine | EngineOfferLine;

export interface EngineContext {
  /** `YYYY-MM-DD` in the ORDER Branch timezone (`localDateIn`). */
  today: string;
  branchId: string;
  orderType: EngineOrderType;
  deliveryZoneId: string | null;
  /** The zone fee before any promotion; null when not a delivery order. */
  deliveryFee: Prisma.Decimal | null;
}

export interface EngineInput {
  lines: readonly EngineLine[];
  promotions: readonly EnginePromotion[];
  context: EngineContext;
}

export type ItemWinner =
  | {
      source: 'PRODUCT_DISCOUNT';
      promotionId: null;
      scope: 'PRODUCT';
      discountType: ProductDiscountKind;
      value: Prisma.Decimal;
    }
  | {
      source: 'PROMOTION';
      promotionId: string;
      scope: 'CATEGORY' | 'MENU';
      discountType: PromotionDiscountTypeName;
      value: Prisma.Decimal;
    };

/** One new-promotion share of a line (never the legacy Product discount). */
export interface LinePromotionAllocation {
  promotionId: string;
  scope: 'CATEGORY' | 'MENU' | 'CART' | 'QUANTITY';
  amount: Prisma.Decimal;
}

/**
 * Per line, in the shape the historical snapshot needs (PO decision 2026-11-21,
 * UNIFIED_PROMOTIONS_HISTORICAL_SNAPSHOTS.md):
 *   lineTotal    = (unit - legacyUnitDiscount + modifiers) x qty   -> order_items.line_total
 *   netLineTotal = lineTotal - sum(promotionAllocations)
 * `legacy*` is non-zero ONLY when the item strategy won AND the legacy Product
 * discount won this line; a CATEGORY / MENU winner or a winning cart discount
 * is carried by `promotionAllocations` only.
 */
export interface EngineLineResult {
  index: number;
  kind: 'PRODUCT' | 'OFFER';
  /** The applied item-scope winner of this line (null when none applied or the cart strategy won). */
  itemWinner: ItemWinner | null;
  legacyUnitDiscount: Prisma.Decimal;
  legacyLineDiscount: Prisma.Decimal;
  /** CATEGORY / MENU discount of ONE unit when such a winner applied (display only; the allocation is unit x qty). */
  promotionUnitDiscount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  promotionAllocations: LinePromotionAllocation[];
  netLineTotal: Prisma.Decimal;
}

/** One applied NEW promotion (the legacy Product discount lives on the order line only, never here). */
export interface AppliedPromotionSnapshot {
  promotionId: string;
  scope: PromotionScopeName;
  discountType: PromotionDiscountTypeName;
  value: Prisma.Decimal;
  amount: Prisma.Decimal;
  /** Per-line split of `amount` for merchandise scopes (sums exactly to it, only positive shares); [] for DELIVERY. */
  allocations: { lineIndex: number; amount: Prisma.Decimal }[];
}

export type PromotionEvaluationStatus =
  | 'APPLIED'
  | 'LOST_TO_BETTER_OFFER'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'INACTIVE'
  | 'WRONG_BRANCH'
  | 'WRONG_ORDER_TYPE'
  | 'WRONG_ZONE'
  | 'NO_ELIGIBLE_ITEMS'
  | 'NO_DELIVERY_FEE'
  | 'NO_EFFECTIVE_DISCOUNT'
  | 'BELOW_MINIMUM_SUBTOTAL'
  | 'BELOW_MINIMUM_QUANTITY'
  | 'INVALID_CONFIGURATION';

interface ThresholdProgress<Basis, Value> {
  basis: Basis;
  current: Value;
  required: Value;
  remaining: Value;
}

export interface PromotionThresholdProgress {
  subtotal: ThresholdProgress<
    'ELIGIBLE_PRODUCT_SUBTOTAL' | 'MERCHANDISE_SUBTOTAL',
    Prisma.Decimal
  > | null;
  quantity: ThresholdProgress<PromotionQuantityBasisName, number> | null;
}

export interface PromotionEvaluation {
  promotionId: string;
  scope: PromotionScopeName;
  status: PromotionEvaluationStatus;
  /** What it would have saved when it was eligible (0 otherwise). */
  potentialSaving: Prisma.Decimal;
  /** Money still missing to reach `minimumSubtotal` (when below it). */
  remainingAmount: Prisma.Decimal | null;
  /** Units / distinct products still missing to reach `minimumQuantity`. */
  remainingQuantity: number | null;
  /** Present only for progress that an otherwise relevant Guest cart can act on. */
  thresholdProgress?: PromotionThresholdProgress;
}

export type EngineStrategy = 'NONE' | 'ITEM' | 'CART';

export interface EngineResult {
  lines: EngineLineResult[];
  strategy: EngineStrategy;
  cartDiscount: { promotionId: string; amount: Prisma.Decimal } | null;
  /** Pre-promotion merchandise: product lines incl. paid extras + offer lines. */
  merchandiseOriginal: Prisma.Decimal;
  /** Sum of the applied legacy Product discounts (order_items.discount_amount). */
  legacyDiscountTotal: Prisma.Decimal;
  /** Sum of the NEW merchandise promotion allocations (CATEGORY / MENU / CART / QUANTITY). */
  promotionMerchandiseDiscountTotal: Prisma.Decimal;
  /** legacy + new merchandise discounts (orders.discount_total_amount). */
  merchandiseDiscountTotal: Prisma.Decimal;
  /** sum(lineTotal) - sum(allocations) = merchandiseOriginal - merchandiseDiscountTotal (orders.subtotal_amount). */
  merchandisePayable: Prisma.Decimal;
  deliveryFeeOriginal: Prisma.Decimal;
  deliveryDiscount: { promotionId: string; amount: Prisma.Decimal } | null;
  deliveryFeePayable: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  applied: AppliedPromotionSnapshot[];
  evaluations: PromotionEvaluation[];
}

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

function roundHalfUp(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** value% of `amount`, half-up to cents, never above `amount`, never below 0. */
function percentageOf(
  amount: Prisma.Decimal,
  percent: Prisma.Decimal,
): Prisma.Decimal {
  const raw = roundHalfUp(amount.times(percent).dividedBy(HUNDRED));
  if (raw.lessThan(ZERO)) return ZERO;
  return raw.greaterThan(amount) ? amount : raw;
}

/** One cart-level / delivery discount: percentage half-up, fixed taken once and capped. */
function amountOff(
  basis: Prisma.Decimal,
  type: PromotionDiscountTypeName,
  value: Prisma.Decimal,
): Prisma.Decimal {
  if (type === 'PERCENTAGE') return percentageOf(basis, value);
  if (value.lessThan(ZERO)) return ZERO;
  return value.greaterThan(basis) ? basis : value;
}

function toCents(value: Prisma.Decimal): bigint {
  // Every money value is a 2-decimal Decimal(14,2); toFixed(0) of value*100 is exact.
  return BigInt(value.times(100).toFixed(0));
}

function fromCents(cents: bigint): Prisma.Decimal {
  return new Prisma.Decimal(cents.toString()).dividedBy(100);
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Splits `total` across `bases` proportionally: floor to cents, then the
 * remaining cents one at a time to the largest fractional remainder, ties by
 * position ascending. Exact integer arithmetic; requires total <= sum(bases).
 */
export function allocateProportionally(
  total: Prisma.Decimal,
  bases: readonly Prisma.Decimal[],
): Prisma.Decimal[] {
  const totalCents = toCents(total);
  const baseCents = bases.map(toCents);
  const sum = baseCents.reduce((acc, value) => acc + value, 0n);
  if (totalCents <= 0n || sum <= 0n) return bases.map(() => ZERO);
  if (totalCents > sum) {
    throw new Error('allocateProportionally: total exceeds the sum of bases');
  }
  const shares = baseCents.map((base) => (totalCents * base) / sum);
  const remainders = baseCents.map((base) => (totalCents * base) % sum);
  let left = totalCents - shares.reduce((acc, value) => acc + value, 0n);
  const order = baseCents
    .map((_, position) => position)
    .sort((a, b) => {
      if (remainders[a] !== remainders[b]) {
        return remainders[a] > remainders[b] ? -1 : 1;
      }
      return a - b;
    });
  for (const position of order) {
    if (left === 0n) break;
    shares[position] += 1n;
    left -= 1n;
  }
  return shares.map(fromCents);
}

type BaseCheck =
  { ok: true } | { ok: false; status: PromotionEvaluationStatus };

function baseEligibility(
  promotion: EnginePromotion,
  context: EngineContext,
): BaseCheck {
  if (promotion.status !== 'ACTIVE') return { ok: false, status: 'INACTIVE' };
  if (promotion.startsOn !== null && context.today < promotion.startsOn) {
    return { ok: false, status: 'NOT_STARTED' };
  }
  if (promotion.endsOn !== null && context.today > promotion.endsOn) {
    return { ok: false, status: 'EXPIRED' };
  }
  if (
    promotion.branchIds.length > 0 &&
    !promotion.branchIds.includes(context.branchId)
  ) {
    return { ok: false, status: 'WRONG_BRANCH' };
  }
  return { ok: true };
}

interface ItemCandidate {
  winner: ItemWinner;
  priority: number;
  specificity: number;
  id: string;
  unitDiscount: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
}

function betterItemCandidate(a: ItemCandidate, b: ItemCandidate): number {
  const saving = b.lineDiscount.comparedTo(a.lineDiscount);
  if (saving !== 0) return saving; // greater saving first
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.specificity !== b.specificity) return a.specificity - b.specificity;
  return compareIds(a.id, b.id);
}

interface CartCandidate {
  promotion: EnginePromotion;
  amount: Prisma.Decimal;
  lineIndexes: number[];
  bases: Prisma.Decimal[];
}

function evaluation(
  promotion: EnginePromotion,
  status: PromotionEvaluationStatus,
  extra: Partial<
    Pick<
      PromotionEvaluation,
      | 'potentialSaving'
      | 'remainingAmount'
      | 'remainingQuantity'
      | 'thresholdProgress'
    >
  > = {},
): PromotionEvaluation {
  return {
    promotionId: promotion.id,
    scope: promotion.scope,
    status,
    potentialSaving: extra.potentialSaving ?? ZERO,
    remainingAmount: extra.remainingAmount ?? null,
    remainingQuantity: extra.remainingQuantity ?? null,
    ...(extra.thresholdProgress && {
      thresholdProgress: extra.thresholdProgress,
    }),
  };
}

function assertLine(line: EngineLine): void {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new Error(`line ${line.index}: quantity must be an integer >= 1`);
  }
  const money =
    line.kind === 'PRODUCT'
      ? [line.unitPrice, line.modifiersUnitTotal]
      : [line.offerUnitTotal];
  if (money.some((value) => value.lessThan(ZERO))) {
    throw new Error(`line ${line.index}: money must not be negative`);
  }
}

/** Evaluates one cart: item vs cart strategy, then the delivery fee. */
export function evaluatePromotions(input: EngineInput): EngineResult {
  const { lines, promotions, context } = input;
  lines.forEach(assertLine);

  const evaluations = new Map<string, PromotionEvaluation>();
  const eligible: EnginePromotion[] = [];
  for (const promotion of promotions) {
    const check = baseEligibility(promotion, context);
    if (!check.ok) {
      evaluations.set(promotion.id, evaluation(promotion, check.status));
    } else {
      eligible.push(promotion);
    }
  }

  const productLines = lines.filter(
    (line): line is EngineProductLine => line.kind === 'PRODUCT',
  );

  // ---- R1: item scope ------------------------------------------------------
  const itemPromotions = eligible.filter(
    (promotion) => promotion.scope === 'CATEGORY' || promotion.scope === 'MENU',
  );
  const itemMatched = new Set<string>();
  const itemWon = new Map<string, Prisma.Decimal>();
  const itemWinners = new Map<number, ItemCandidate>();
  for (const line of productLines) {
    const candidates: ItemCandidate[] = [];
    if (line.sizeDiscountApplies && line.productDiscount) {
      const legacy = resolveActiveDiscount(
        line.unitPrice,
        line.productDiscount,
        context.today,
      );
      if (legacy) {
        candidates.push({
          winner: {
            source: 'PRODUCT_DISCOUNT',
            promotionId: null,
            scope: 'PRODUCT',
            discountType: legacy.type,
            value: legacy.value,
          },
          priority: LEGACY_PRODUCT_DISCOUNT_PRIORITY,
          specificity: SPECIFICITY.PRODUCT,
          id: '',
          unitDiscount: legacy.unitDiscount,
          lineDiscount: legacy.unitDiscount.times(line.quantity),
        });
      }
    }
    for (const promotion of itemPromotions) {
      const targeted =
        promotion.scope === 'CATEGORY'
          ? promotion.categoryIds.includes(line.categoryId)
          : promotion.menuIds.includes(line.menuId);
      if (!targeted) continue;
      // DEC-077 D1: the promotion's own type; a fixed amount is taken per purchased unit and capped at the
      // ORIGINAL unit price (paid extras are not part of `unitPrice`). The shared helper also caps and rounds.
      const unitDiscount = computeUnitDiscount(
        line.unitPrice,
        promotion.discountType,
        promotion.value,
      );
      // A zero-price line (or a sub-half-cent saving) gives nothing to win.
      if (!unitDiscount.greaterThan(ZERO)) continue;
      itemMatched.add(promotion.id);
      candidates.push({
        winner: {
          source: 'PROMOTION',
          promotionId: promotion.id,
          scope: promotion.scope as 'CATEGORY' | 'MENU',
          discountType: promotion.discountType,
          value: promotion.value,
        },
        priority: promotion.priority,
        specificity: SPECIFICITY[promotion.scope as 'CATEGORY' | 'MENU'],
        id: promotion.id,
        unitDiscount,
        lineDiscount: unitDiscount.times(line.quantity),
      });
    }
    if (candidates.length === 0) continue;
    candidates.sort(betterItemCandidate);
    const best = candidates[0];
    itemWinners.set(line.index, best);
    const wonId = best.winner.promotionId;
    if (wonId !== null) {
      itemWon.set(wonId, (itemWon.get(wonId) ?? ZERO).plus(best.lineDiscount));
    }
  }
  const itemSaving = [...itemWinners.values()].reduce(
    (acc, candidate) => acc.plus(candidate.lineDiscount),
    ZERO,
  );

  // ---- R2: cart scope ------------------------------------------------------
  const cartCandidates: CartCandidate[] = [];
  for (const promotion of eligible) {
    if (promotion.scope !== 'CART' && promotion.scope !== 'QUANTITY') continue;
    const restricted =
      promotion.categoryIds.length > 0 || promotion.productIds.length > 0;
    const eligibleLines = productLines.filter(
      (line) =>
        !restricted ||
        promotion.categoryIds.includes(line.categoryId) ||
        promotion.productIds.includes(line.productId),
    );
    if (eligibleLines.length === 0) {
      evaluations.set(promotion.id, evaluation(promotion, 'NO_ELIGIBLE_ITEMS'));
      continue;
    }
    const bases = eligibleLines.map((line) =>
      line.unitPrice.plus(line.modifiersUnitTotal).times(line.quantity),
    );
    const basis = bases.reduce((acc, value) => acc.plus(value), ZERO);
    const minimumSubtotal = promotion.minimumSubtotal;
    const remainingAmount =
      minimumSubtotal !== null && basis.lessThan(minimumSubtotal)
        ? minimumSubtotal.minus(basis)
        : null;
    let quantity: PromotionThresholdProgress['quantity'] = null;
    if (promotion.scope === 'QUANTITY') {
      const minimum = promotion.minimumQuantity;
      const quantityBasis = promotion.quantityBasis;
      if (minimum === null || quantityBasis === null) {
        evaluations.set(
          promotion.id,
          evaluation(promotion, 'INVALID_CONFIGURATION'),
        );
        continue;
      }
      const count =
        quantityBasis === 'DISTINCT_PRODUCTS'
          ? new Set(eligibleLines.map((line) => line.productId)).size
          : eligibleLines.reduce((acc, line) => acc + line.quantity, 0);
      quantity = {
        basis: quantityBasis,
        current: count,
        required: minimum,
        remaining: Math.max(0, minimum - count),
      };
    }
    const remainingQuantity = quantity?.remaining || null;
    if (remainingQuantity !== null || remainingAmount !== null) {
      evaluations.set(
        promotion.id,
        evaluation(
          promotion,
          remainingQuantity !== null
            ? 'BELOW_MINIMUM_QUANTITY'
            : 'BELOW_MINIMUM_SUBTOTAL',
          {
            remainingAmount,
            remainingQuantity,
            thresholdProgress: {
              subtotal:
                minimumSubtotal === null
                  ? null
                  : {
                      basis: 'ELIGIBLE_PRODUCT_SUBTOTAL',
                      current: basis,
                      required: minimumSubtotal,
                      remaining: remainingAmount ?? ZERO,
                    },
              quantity,
            },
          },
        ),
      );
      continue;
    }
    const amount = amountOff(basis, promotion.discountType, promotion.value);
    if (!amount.greaterThan(ZERO)) {
      evaluations.set(promotion.id, evaluation(promotion, 'NO_ELIGIBLE_ITEMS'));
      continue;
    }
    cartCandidates.push({
      promotion,
      amount,
      lineIndexes: eligibleLines.map((line) => line.index),
      bases,
    });
  }
  cartCandidates.sort((a, b) => {
    const saving = b.amount.comparedTo(a.amount);
    if (saving !== 0) return saving;
    if (a.promotion.priority !== b.promotion.priority) {
      return a.promotion.priority - b.promotion.priority;
    }
    return compareIds(a.promotion.id, b.promotion.id);
  });
  const cartWinner = cartCandidates[0] ?? null;

  // ---- R3: strategy --------------------------------------------------------
  let strategy: EngineStrategy = 'NONE';
  if (cartWinner && cartWinner.amount.greaterThan(itemSaving)) {
    strategy = 'CART';
  } else if (itemSaving.greaterThan(ZERO)) {
    strategy = 'ITEM';
  }

  // Cart allocation (largest remainder). Only positive shares are kept.
  const cartShareByLine = new Map<number, Prisma.Decimal>();
  if (strategy === 'CART' && cartWinner) {
    const shares = allocateProportionally(cartWinner.amount, cartWinner.bases);
    cartWinner.lineIndexes.forEach((lineIndex, position) => {
      if (shares[position].greaterThan(ZERO)) {
        cartShareByLine.set(lineIndex, shares[position]);
      }
    });
  }

  const lineResults: EngineLineResult[] = lines.map((line) => {
    if (line.kind === 'OFFER') {
      // R5: an Offer line is never discounted again.
      const total = line.offerUnitTotal.times(line.quantity);
      return {
        index: line.index,
        kind: 'OFFER',
        itemWinner: null,
        legacyUnitDiscount: ZERO,
        legacyLineDiscount: ZERO,
        promotionUnitDiscount: ZERO,
        lineTotal: total,
        promotionAllocations: [],
        netLineTotal: total,
      };
    }
    const winner = strategy === 'ITEM' ? itemWinners.get(line.index) : null;
    const legacyUnitDiscount =
      winner && winner.winner.source === 'PRODUCT_DISCOUNT'
        ? winner.unitDiscount
        : ZERO;
    const promotionUnitDiscount =
      winner && winner.winner.source === 'PROMOTION'
        ? winner.unitDiscount
        : ZERO;
    const lineTotal = line.unitPrice
      .minus(legacyUnitDiscount)
      .plus(line.modifiersUnitTotal)
      .times(line.quantity);
    const promotionAllocations: LinePromotionAllocation[] = [];
    if (winner && winner.winner.source === 'PROMOTION') {
      promotionAllocations.push({
        promotionId: winner.winner.promotionId,
        scope: winner.winner.scope,
        amount: winner.lineDiscount,
      });
    }
    const cartShare = cartShareByLine.get(line.index);
    if (cartShare && cartWinner) {
      promotionAllocations.push({
        promotionId: cartWinner.promotion.id,
        scope: cartWinner.promotion.scope as 'CART' | 'QUANTITY',
        amount: cartShare,
      });
    }
    const allocated = promotionAllocations.reduce(
      (acc, allocation) => acc.plus(allocation.amount),
      ZERO,
    );
    return {
      index: line.index,
      kind: 'PRODUCT',
      itemWinner: winner ? winner.winner : null,
      legacyUnitDiscount,
      legacyLineDiscount: legacyUnitDiscount.times(line.quantity),
      promotionUnitDiscount,
      lineTotal,
      promotionAllocations,
      netLineTotal: lineTotal.minus(allocated),
    };
  });

  const merchandiseOriginal = lines.reduce(
    (acc, line) =>
      acc.plus(
        line.kind === 'OFFER'
          ? line.offerUnitTotal.times(line.quantity)
          : line.unitPrice.plus(line.modifiersUnitTotal).times(line.quantity),
      ),
    ZERO,
  );
  const legacyDiscountTotal = lineResults.reduce(
    (acc, line) => acc.plus(line.legacyLineDiscount),
    ZERO,
  );
  const promotionMerchandiseDiscountTotal = lineResults.reduce(
    (acc, line) =>
      line.promotionAllocations.reduce(
        (inner, allocation) => inner.plus(allocation.amount),
        acc,
      ),
    ZERO,
  );
  const merchandiseDiscountTotal = legacyDiscountTotal.plus(
    promotionMerchandiseDiscountTotal,
  );
  const merchandisePayable = merchandiseOriginal.minus(
    merchandiseDiscountTotal,
  );

  // Item / cart diagnostics.
  for (const promotion of itemPromotions) {
    const won = itemWon.get(promotion.id);
    if (won) {
      evaluations.set(
        promotion.id,
        evaluation(
          promotion,
          strategy === 'ITEM' ? 'APPLIED' : 'LOST_TO_BETTER_OFFER',
          { potentialSaving: won },
        ),
      );
    } else if (itemMatched.has(promotion.id)) {
      evaluations.set(
        promotion.id,
        evaluation(promotion, 'LOST_TO_BETTER_OFFER'),
      );
    } else {
      evaluations.set(promotion.id, evaluation(promotion, 'NO_ELIGIBLE_ITEMS'));
    }
  }
  for (const candidate of cartCandidates) {
    const applied = strategy === 'CART' && candidate === cartWinner;
    evaluations.set(
      candidate.promotion.id,
      evaluation(
        candidate.promotion,
        applied ? 'APPLIED' : 'LOST_TO_BETTER_OFFER',
        { potentialSaving: candidate.amount },
      ),
    );
  }

  // ---- R4: delivery fee ----------------------------------------------------
  const deliveryFeeOriginal =
    context.orderType === 'DELIVERY' && context.deliveryFee
      ? context.deliveryFee
      : ZERO;
  const deliveryCandidates: {
    promotion: EnginePromotion;
    amount: Prisma.Decimal;
  }[] = [];
  for (const promotion of eligible) {
    if (promotion.scope !== 'DELIVERY') continue;
    if (context.orderType !== 'DELIVERY') {
      evaluations.set(promotion.id, evaluation(promotion, 'WRONG_ORDER_TYPE'));
      continue;
    }
    if (
      context.deliveryZoneId === null ||
      (promotion.deliveryZoneIds.length > 0 &&
        !promotion.deliveryZoneIds.includes(context.deliveryZoneId))
    ) {
      evaluations.set(promotion.id, evaluation(promotion, 'WRONG_ZONE'));
      continue;
    }
    if (!deliveryFeeOriginal.greaterThan(ZERO)) {
      evaluations.set(promotion.id, evaluation(promotion, 'NO_DELIVERY_FEE'));
      continue;
    }
    const amount = amountOff(
      deliveryFeeOriginal,
      promotion.discountType,
      promotion.value,
    );
    if (
      promotion.minimumSubtotal !== null &&
      merchandiseOriginal.lessThan(promotion.minimumSubtotal)
    ) {
      const remainingAmount =
        promotion.minimumSubtotal.minus(merchandiseOriginal);
      evaluations.set(
        promotion.id,
        evaluation(promotion, 'BELOW_MINIMUM_SUBTOTAL', {
          remainingAmount,
          // Adding merchandise cannot turn a fee discount that rounds to zero into a saving.
          thresholdProgress: amount.greaterThan(ZERO)
            ? {
                subtotal: {
                  basis: 'MERCHANDISE_SUBTOTAL',
                  current: merchandiseOriginal,
                  required: promotion.minimumSubtotal,
                  remaining: remainingAmount,
                },
                quantity: null,
              }
            : undefined,
        }),
      );
      continue;
    }
    if (!amount.greaterThan(ZERO)) {
      evaluations.set(
        promotion.id,
        evaluation(promotion, 'NO_EFFECTIVE_DISCOUNT'),
      );
      continue;
    }
    deliveryCandidates.push({ promotion, amount });
  }
  deliveryCandidates.sort((a, b) => {
    const saving = b.amount.comparedTo(a.amount);
    if (saving !== 0) return saving;
    if (a.promotion.priority !== b.promotion.priority) {
      return a.promotion.priority - b.promotion.priority;
    }
    return compareIds(a.promotion.id, b.promotion.id);
  });
  const deliveryWinner = deliveryCandidates[0] ?? null;
  for (const candidate of deliveryCandidates) {
    evaluations.set(
      candidate.promotion.id,
      evaluation(
        candidate.promotion,
        candidate === deliveryWinner ? 'APPLIED' : 'LOST_TO_BETTER_OFFER',
        { potentialSaving: candidate.amount },
      ),
    );
  }
  const deliveryDiscountAmount = deliveryWinner ? deliveryWinner.amount : ZERO;
  const deliveryFeePayable = deliveryFeeOriginal.minus(deliveryDiscountAmount);

  // ---- applied NEW promotions (legacy discounts stay on the lines) ---------
  const applied: AppliedPromotionSnapshot[] = [];
  const byPromotion = new Map<string, AppliedPromotionSnapshot>();
  const promotionById = new Map(promotions.map((p) => [p.id, p]));
  for (const line of lineResults) {
    for (const allocation of line.promotionAllocations) {
      let snapshot = byPromotion.get(allocation.promotionId);
      if (!snapshot) {
        const promotion = promotionById.get(allocation.promotionId);
        if (!promotion) throw new Error('allocation without its promotion');
        snapshot = {
          promotionId: promotion.id,
          scope: promotion.scope,
          discountType: promotion.discountType,
          value: promotion.value,
          amount: ZERO,
          allocations: [],
        };
        byPromotion.set(promotion.id, snapshot);
        applied.push(snapshot);
      }
      snapshot.amount = snapshot.amount.plus(allocation.amount);
      snapshot.allocations.push({
        lineIndex: line.index,
        amount: allocation.amount,
      });
    }
  }
  if (deliveryWinner) {
    applied.push({
      promotionId: deliveryWinner.promotion.id,
      scope: 'DELIVERY',
      discountType: deliveryWinner.promotion.discountType,
      value: deliveryWinner.promotion.value,
      amount: deliveryWinner.amount,
      allocations: [],
    });
  }

  return {
    lines: lineResults,
    strategy,
    cartDiscount:
      strategy === 'CART' && cartWinner
        ? { promotionId: cartWinner.promotion.id, amount: cartWinner.amount }
        : null,
    merchandiseOriginal,
    legacyDiscountTotal,
    promotionMerchandiseDiscountTotal,
    merchandiseDiscountTotal,
    merchandisePayable,
    deliveryFeeOriginal,
    deliveryDiscount: deliveryWinner
      ? {
          promotionId: deliveryWinner.promotion.id,
          amount: deliveryWinner.amount,
        }
      : null,
    deliveryFeePayable,
    grandTotal: merchandisePayable.plus(deliveryFeePayable),
    applied,
    // Input order, so a Staff "why not applied" list is stable.
    evaluations: promotions
      .map((promotion) => evaluations.get(promotion.id))
      .filter((value): value is PromotionEvaluation => value !== undefined),
  };
}

// ---- Staff input validation (pure shape rules) -----------------------------

export interface PromotionInput {
  internalName: string;
  scope: string;
  discountType: string;
  value: Prisma.Decimal;
  priority: number;
  startsOn: string | null;
  endsOn: string | null;
  minimumSubtotal: Prisma.Decimal | null;
  minimumQuantity: number | null;
  quantityBasis: string | null;
  branchIds: readonly string[];
  menuIds: readonly string[];
  categoryIds: readonly string[];
  productIds: readonly string[];
  deliveryZoneIds: readonly string[];
  translations: readonly {
    locale: string;
    title: string;
    description?: string | null;
  }[];
}

export type PromotionInputProblemCode =
  | 'INTERNAL_NAME_REQUIRED'
  | 'INTERNAL_NAME_TOO_LONG'
  | 'SCOPE_INVALID'
  | 'DISCOUNT_TYPE_INVALID'
  | 'FIXED_ITEM_SCOPE_NOT_ENABLED'
  | 'VALUE_INVALID'
  | 'PERCENTAGE_ABOVE_100'
  | 'PRIORITY_INVALID'
  | 'DATE_INVALID'
  | 'DATES_ORDER_INVALID'
  | 'MINIMUM_SUBTOTAL_INVALID'
  | 'MINIMUM_SUBTOTAL_NOT_ALLOWED'
  | 'MINIMUM_QUANTITY_REQUIRED'
  | 'MINIMUM_QUANTITY_INVALID'
  | 'MINIMUM_QUANTITY_NOT_ALLOWED'
  | 'QUANTITY_BASIS_REQUIRED'
  | 'QUANTITY_BASIS_INVALID'
  | 'QUANTITY_BASIS_NOT_ALLOWED'
  | 'TARGETS_REQUIRED'
  | 'TARGETS_NOT_ALLOWED'
  | 'TARGETS_DUPLICATE'
  | 'TITLE_REQUIRED_DEFAULT_LOCALE'
  | 'TITLE_INVALID'
  | 'DESCRIPTION_TOO_LONG';

export interface PromotionInputProblem {
  code: PromotionInputProblemCode;
  field: string;
}

const SCOPES: readonly string[] = [
  'CATEGORY',
  'MENU',
  'CART',
  'QUANTITY',
  'DELIVERY',
];
const DISCOUNT_TYPES: readonly string[] = ['PERCENTAGE', 'FIXED_AMOUNT'];
const QUANTITY_BASES: readonly string[] = ['UNITS', 'DISTINCT_PRODUCTS'];
export const PROMOTION_PRIORITY_MIN = 0;
export const PROMOTION_PRIORITY_MAX = 1000;
/** Mirrors the migration CHECKs on internal_name / title (1..120 trimmed) and description (<= 500). */
export const PROMOTION_NAME_MAX_LENGTH = 120;
export const PROMOTION_DESCRIPTION_MAX_LENGTH = 500;

type TargetField =
  'branchIds' | 'menuIds' | 'categoryIds' | 'productIds' | 'deliveryZoneIds';

/** Which target lists each scope accepts ('required' = must be non-empty). */
const TARGET_RULES: Record<
  PromotionScopeName,
  Partial<Record<TargetField, 'required' | 'optional'>>
> = {
  CATEGORY: { branchIds: 'optional', categoryIds: 'required' },
  MENU: { branchIds: 'optional', menuIds: 'required' },
  CART: {
    branchIds: 'optional',
    categoryIds: 'optional',
    productIds: 'optional',
  },
  QUANTITY: {
    branchIds: 'optional',
    categoryIds: 'optional',
    productIds: 'optional',
  },
  DELIVERY: { branchIds: 'optional', deliveryZoneIds: 'optional' },
};
const TARGET_FIELDS: readonly TargetField[] = [
  'branchIds',
  'menuIds',
  'categoryIds',
  'productIds',
  'deliveryZoneIds',
];

/**
 * Pure shape validation of a Staff-submitted Promotion. It does NOT check that
 * target ids exist or belong to the Restaurant (the service does that inside
 * the tenant-scoped transaction; the composite FKs are the backstop).
 */
export function validatePromotionInput(
  input: PromotionInput,
  defaultLocale: string,
): PromotionInputProblem[] {
  const problems: PromotionInputProblem[] = [];
  const add = (code: PromotionInputProblemCode, field: string) =>
    problems.push({ code, field });

  const internalName = input.internalName.trim();
  if (internalName.length === 0) {
    add('INTERNAL_NAME_REQUIRED', 'internalName');
  } else if (internalName.length > PROMOTION_NAME_MAX_LENGTH) {
    add('INTERNAL_NAME_TOO_LONG', 'internalName');
  }
  const scopeKnown = SCOPES.includes(input.scope);
  if (!scopeKnown) add('SCOPE_INVALID', 'scope');
  const typeKnown = DISCOUNT_TYPES.includes(input.discountType);
  if (!typeKnown) add('DISCOUNT_TYPE_INVALID', 'discountType');
  const scope = input.scope as PromotionScopeName;
  const itemScope = scope === 'CATEGORY' || scope === 'MENU';

  if (
    !input.value.isFinite() ||
    !input.value.greaterThan(ZERO) ||
    input.value.decimalPlaces() > 2
  ) {
    add('VALUE_INVALID', 'value');
  } else if (
    input.discountType === 'PERCENTAGE' &&
    input.value.greaterThan(HUNDRED)
  ) {
    add('PERCENTAGE_ABOVE_100', 'value');
  }
  if (
    !Number.isInteger(input.priority) ||
    input.priority < PROMOTION_PRIORITY_MIN ||
    input.priority > PROMOTION_PRIORITY_MAX
  ) {
    add('PRIORITY_INVALID', 'priority');
  }

  const startsValid =
    input.startsOn === null || isValidCalendarDate(input.startsOn);
  const endsValid = input.endsOn === null || isValidCalendarDate(input.endsOn);
  if (!startsValid) add('DATE_INVALID', 'startsOn');
  if (!endsValid) add('DATE_INVALID', 'endsOn');
  if (
    startsValid &&
    endsValid &&
    input.startsOn !== null &&
    input.endsOn !== null &&
    input.endsOn < input.startsOn
  ) {
    add('DATES_ORDER_INVALID', 'endsOn');
  }

  if (input.minimumSubtotal !== null) {
    if (itemScope) {
      add('MINIMUM_SUBTOTAL_NOT_ALLOWED', 'minimumSubtotal');
    } else if (
      !input.minimumSubtotal.isFinite() ||
      input.minimumSubtotal.lessThan(ZERO) ||
      input.minimumSubtotal.decimalPlaces() > 2
    ) {
      add('MINIMUM_SUBTOTAL_INVALID', 'minimumSubtotal');
    }
  }

  if (scope === 'QUANTITY') {
    if (input.minimumQuantity === null) {
      add('MINIMUM_QUANTITY_REQUIRED', 'minimumQuantity');
    } else if (
      !Number.isInteger(input.minimumQuantity) ||
      input.minimumQuantity < 1
    ) {
      add('MINIMUM_QUANTITY_INVALID', 'minimumQuantity');
    }
    if (input.quantityBasis === null) {
      add('QUANTITY_BASIS_REQUIRED', 'quantityBasis');
    } else if (!QUANTITY_BASES.includes(input.quantityBasis)) {
      add('QUANTITY_BASIS_INVALID', 'quantityBasis');
    }
  } else {
    if (input.minimumQuantity !== null) {
      add('MINIMUM_QUANTITY_NOT_ALLOWED', 'minimumQuantity');
    }
    if (input.quantityBasis !== null) {
      add('QUANTITY_BASIS_NOT_ALLOWED', 'quantityBasis');
    }
  }

  if (scopeKnown) {
    const rules = TARGET_RULES[scope];
    for (const field of TARGET_FIELDS) {
      const ids = input[field];
      const rule = rules[field];
      if (rule === undefined && ids.length > 0) {
        add('TARGETS_NOT_ALLOWED', field);
      } else if (rule === 'required' && ids.length === 0) {
        add('TARGETS_REQUIRED', field);
      }
      if (new Set(ids).size !== ids.length) add('TARGETS_DUPLICATE', field);
    }
  }

  for (const translation of input.translations) {
    const title = translation.title.trim();
    if (
      translation.locale !== defaultLocale &&
      (title.length === 0 || title.length > PROMOTION_NAME_MAX_LENGTH)
    ) {
      add('TITLE_INVALID', 'translations');
    }
    if (
      translation.description != null &&
      translation.description.length > PROMOTION_DESCRIPTION_MAX_LENGTH
    ) {
      add('DESCRIPTION_TOO_LONG', 'translations');
    }
  }
  const defaultTitle = input.translations.find(
    (translation) => translation.locale === defaultLocale,
  );
  if (!defaultTitle || defaultTitle.title.trim().length === 0) {
    add('TITLE_REQUIRED_DEFAULT_LOCALE', 'translations');
  } else if (defaultTitle.title.trim().length > PROMOTION_NAME_MAX_LENGTH) {
    add('TITLE_INVALID', 'translations');
  }
  return problems;
}
