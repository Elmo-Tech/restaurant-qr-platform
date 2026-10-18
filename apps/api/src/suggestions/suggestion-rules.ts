/**
 * Smart suggestions (DEC-042): the constants and the one pure function that decides what the
 * Guest cart suggests. No database access here, so the rules are easy to test.
 */

/** At most this many suggestions are shown in the cart. */
export const MAX_SUGGESTIONS_SHOWN = 4;

/** At most this many manual rules per product. */
export const MAX_RULES_PER_PRODUCT = 6;

/** Automatic suggestions look at the Restaurant's own served orders of the last N days. */
export const AUTO_WINDOW_DAYS = 180;

/**
 * Automatic suggestions appear only after the Restaurant has this many served orders in the
 * window, and for a pair only after it was ordered together at least `AUTO_MIN_TOGETHER` times:
 * a handful of orders is noise, not a pattern.
 */
export const AUTO_MIN_SERVED_ORDERS = 30;
export const AUTO_MIN_TOGETHER = 3;

export type SuggestionsMode = 'OFF' | 'MANUAL' | 'AUTO' | 'BOTH';

export const usesManualRules = (mode: SuggestionsMode): boolean =>
  mode === 'MANUAL' || mode === 'BOTH';
export const usesAutomatic = (mode: SuggestionsMode): boolean =>
  mode === 'AUTO' || mode === 'BOTH';

/**
 * The suggestions for a cart, best first: the Restaurant's manual rules (in the cart's order,
 * then each rule's own order) come before the automatic ones (strongest pair first). A product
 * already in the cart, a product that is not eligible (not on the menu or not available), and
 * a repeat are never suggested.
 */
export function mergeSuggestions(input: {
  cart: readonly string[];
  /** Manual suggestions, already in the order they should appear. */
  manual: readonly string[];
  /** Automatic suggestions, strongest first. */
  automatic: readonly string[];
  /** Products that may be suggested right now. */
  eligible: ReadonlySet<string>;
  limit?: number;
}): string[] {
  const limit = input.limit ?? MAX_SUGGESTIONS_SHOWN;
  const inCart = new Set(input.cart);
  const result: string[] = [];
  for (const id of [...input.manual, ...input.automatic]) {
    if (result.length >= limit) break;
    if (inCart.has(id) || !input.eligible.has(id) || result.includes(id))
      continue;
    result.push(id);
  }
  return result;
}
