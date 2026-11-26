import { Prisma } from '../generated/prisma/client';
import type {
  EngineLineResult,
  ItemWinner,
  PromotionScopeName,
} from './promotion-engine';
import type {
  BasketEvaluation,
  BasketLine,
  PreviewSample,
} from './promotion-preview-examples';

/**
 * DEC-077 B3: WHY a draft lost, derived from engine runs and never from a second implementation of the rules.
 *
 * The engine decides in three independent places, and a good explanation names the one that actually applied:
 *   - per product line (item scopes): the best of the legacy Product discount, CATEGORY and MENU promotions;
 *   - the basket (CART / QUANTITY): one winner, used only when it saves STRICTLY more than all item winners together;
 *   - the delivery fee: one winner, independent of the other two.
 * A promotion on a product the draft does not target is therefore never the reason an item draft lost its own lines.
 */

const ZERO = new Prisma.Decimal(0);

export type CompetitionReason =
  /** An item draft lost on every product line it targets to a better item offer (legacy discount or promotion). */
  | 'ITEM_OFFER_BEATEN_ON_SAME_ITEMS'
  /** An item draft would win its lines, but a CART / QUANTITY promotion saves strictly more than all item offers together. */
  | 'ITEM_OFFER_BEATEN_BY_CART_LEVEL'
  /** A CART / QUANTITY draft lost because the item offers together save at least as much; the two are never combined. */
  | 'CART_LEVEL_BEATEN_BY_ITEM_OFFERS'
  /** A CART / QUANTITY draft lost to another CART / QUANTITY promotion. */
  | 'CART_LEVEL_BEATEN_BY_BETTER_CART_LEVEL'
  /** A delivery fee draft lost to another delivery fee promotion. */
  | 'DELIVERY_BEATEN_BY_BETTER_DELIVERY';

export interface CompetingWinnerPart {
  source: 'PROMOTION' | 'PRODUCT_DISCOUNT';
  promotionId: string | null;
  scope: PromotionScopeName | 'PRODUCT';
  name: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string;
  /** What this winner saves in the compared scope, as the engine reports it (summed over its lines when it won several). */
  saving: string;
}

export interface CompetingWinner {
  reason: CompetitionReason;
  /** More than one offer wins together (several item offers, or an item offer plus a legacy Product discount). */
  combined: boolean;
  /** The winners' saving together. Distinct from the draft's own `diagnostic.potentialSaving` and from `appliedSaving`. */
  saving: string;
  /**
   * The figure the winners had to beat: the draft's own saving, except for `ITEM_OFFER_BEATEN_BY_CART_LEVEL`, where it is
   * what the item offers (this draft included) would have saved together.
   */
  comparedSaving: string;
  winners: CompetingWinnerPart[];
}

export interface CompetitionEnvironment {
  draftId: string;
  /** The same basket with every CART / QUANTITY competitor removed: the item level on its own. */
  evaluateItemLevel(basket: readonly BasketLine[]): BasketEvaluation;
  /** Does the draft's item scope (CATEGORY / MENU) target this product line? */
  targetsLine(sample: PreviewSample): boolean;
  promotionName(promotionId: string): string | null;
}

interface Accumulator {
  part: Omit<CompetingWinnerPart, 'saving'>;
  saving: Prisma.Decimal;
}

function fromWinner(
  winner: ItemWinner,
  name: string | null,
): Omit<CompetingWinnerPart, 'saving'> {
  return {
    source: winner.source,
    promotionId: winner.promotionId,
    scope: winner.scope,
    name: winner.source === 'PROMOTION' ? name : null,
    discountType: winner.discountType,
    value: winner.value.toFixed(2),
  };
}

/** The saving a line gives to its own item winner. */
function lineSaving(
  line: EngineLineResult,
  winner: ItemWinner,
): Prisma.Decimal {
  if (winner.source === 'PRODUCT_DISCOUNT') return line.legacyLineDiscount;
  return (
    line.promotionAllocations.find(
      ({ promotionId }) => promotionId === winner.promotionId,
    )?.amount ?? ZERO
  );
}

/** Deterministic: the greatest saving first, then the stable id (the legacy discount has none and sorts first). */
function ordered(
  accumulators: Map<string, Accumulator>,
): CompetingWinnerPart[] {
  return [...accumulators.values()]
    .sort((a, b) => {
      const saving = b.saving.comparedTo(a.saving);
      if (saving !== 0) return saving;
      return (a.part.promotionId ?? '').localeCompare(b.part.promotionId ?? '');
    })
    .map(({ part, saving }) => ({ ...part, saving: saving.toFixed(2) }));
}

function total(parts: readonly CompetingWinnerPart[]): Prisma.Decimal {
  return parts.reduce((sum, { saving }) => sum.plus(saving), ZERO);
}

/** The item winners of the given lines, one entry per winning offer with its saving over those lines. */
function itemWinners(
  lines: readonly EngineLineResult[],
  indexes: ReadonlySet<number> | null,
  environment: CompetitionEnvironment,
): CompetingWinnerPart[] {
  const winners = new Map<string, Accumulator>();
  for (const line of lines) {
    if (indexes && !indexes.has(line.index)) continue;
    const { itemWinner } = line;
    if (!itemWinner) continue;
    const key = itemWinner.promotionId ?? 'PRODUCT_DISCOUNT';
    const entry = winners.get(key) ?? {
      part: fromWinner(
        itemWinner,
        itemWinner.promotionId
          ? environment.promotionName(itemWinner.promotionId)
          : null,
      ),
      saving: ZERO,
    };
    entry.saving = entry.saving.plus(lineSaving(line, itemWinner));
    winners.set(key, entry);
  }
  return ordered(winners);
}

function build(
  reason: CompetitionReason,
  winners: CompetingWinnerPart[],
  comparedSaving: Prisma.Decimal,
): CompetingWinner | undefined {
  if (winners.length === 0) return undefined;
  return {
    reason,
    combined: winners.length > 1,
    saving: total(winners).toFixed(2),
    comparedSaving: comparedSaving.toFixed(2),
    winners,
  };
}

/**
 * Explains a `LOST_TO_BETTER_OFFER` draft, or returns undefined when it did not lose (or the engine names no winner).
 * `draftSaving` is the draft's own saving (`potentialSaving`, completed by the caller for an item draft).
 */
export function explainLoss(
  scope: PromotionScopeName,
  basket: readonly BasketLine[],
  evaluated: BasketEvaluation,
  draftSaving: Prisma.Decimal,
  environment: CompetitionEnvironment,
): CompetingWinner | undefined {
  if (evaluated.evaluation.status !== 'LOST_TO_BETTER_OFFER') return undefined;
  const { result } = evaluated;
  const { draftId } = environment;
  const named = (promotionId: string): string | null =>
    environment.promotionName(promotionId);

  if (scope === 'DELIVERY') {
    const winner = result.applied.find(
      (entry) => entry.scope === 'DELIVERY' && entry.promotionId !== draftId,
    );
    if (!winner) return undefined;
    return build(
      'DELIVERY_BEATEN_BY_BETTER_DELIVERY',
      [
        {
          source: 'PROMOTION',
          promotionId: winner.promotionId,
          scope: winner.scope,
          name: named(winner.promotionId),
          discountType: winner.discountType,
          value: winner.value.toFixed(2),
          saving: winner.amount.toFixed(2),
        },
      ],
      draftSaving,
    );
  }

  const cartWinner =
    result.strategy === 'CART' &&
    result.cartDiscount &&
    result.cartDiscount.promotionId !== draftId
      ? result.applied.find(
          ({ promotionId }) => promotionId === result.cartDiscount?.promotionId,
        )
      : undefined;
  const cartPart = (): CompetingWinnerPart[] =>
    cartWinner
      ? [
          {
            source: 'PROMOTION',
            promotionId: cartWinner.promotionId,
            scope: cartWinner.scope,
            name: named(cartWinner.promotionId),
            discountType: cartWinner.discountType,
            value: cartWinner.value.toFixed(2),
            saving: cartWinner.amount.toFixed(2),
          },
        ]
      : [];

  if (scope === 'CART' || scope === 'QUANTITY') {
    if (cartWinner) {
      return build(
        'CART_LEVEL_BEATEN_BY_BETTER_CART_LEVEL',
        cartPart(),
        draftSaving,
      );
    }
    // The item offers of the WHOLE basket (the engine compares totals, not only the draft's own products).
    return build(
      'CART_LEVEL_BEATEN_BY_ITEM_OFFERS',
      itemWinners(result.lines, null, environment),
      draftSaving,
    );
  }

  // CATEGORY / MENU. Judge the item level on its own first: does the draft win any line it targets?
  const itemLevel = environment.evaluateItemLevel(basket);
  const targeted = new Set(
    basket.flatMap(({ sample }, index) =>
      environment.targetsLine(sample) ? [index] : [],
    ),
  );
  const wonALine = itemLevel.result.lines.some(
    (line) =>
      targeted.has(line.index) && line.itemWinner?.promotionId === draftId,
  );
  if (wonALine) {
    // It wins its lines; a basket-level promotion saving strictly more than all item offers together takes the basket.
    return build(
      'ITEM_OFFER_BEATEN_BY_CART_LEVEL',
      cartPart(),
      itemLevel.result.merchandiseDiscountTotal,
    );
  }
  // It wins none of its own lines: only the offers on THOSE lines are the reason.
  return build(
    'ITEM_OFFER_BEATEN_ON_SAME_ITEMS',
    itemWinners(itemLevel.result.lines, targeted, environment),
    draftSaving,
  );
}
