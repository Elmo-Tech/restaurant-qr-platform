import type { CompetitionReason, ContextualPreview, OmittedExampleReason, PreviewDiagnostic, PreviewExample, ReadyPreview } from './api.ts';
import type { IncompleteReason } from './preview-plan.ts';
import type { MessageKey } from '../i18n/messages';

/**
 * Pure helpers that turn the Backend's stable codes into Staff message keys. Nothing here computes money: amounts are
 * the Backend's decimal strings and are only compared as text to decide what to show.
 *
 * The code lists mirror the Backend unions. `preview-view.test.mjs` checks every list against the API source and
 * checks that each code has an English and an Arabic message, so a new Backend code cannot silently show raw text.
 */

export const PROBLEM_CODES = [
  'INTERNAL_NAME_REQUIRED', 'INTERNAL_NAME_TOO_LONG', 'SCOPE_INVALID', 'DISCOUNT_TYPE_INVALID', 'FIXED_ITEM_SCOPE_NOT_ENABLED',
  'VALUE_INVALID', 'PERCENTAGE_ABOVE_100', 'PRIORITY_INVALID', 'DATE_INVALID', 'DATES_ORDER_INVALID',
  'MINIMUM_SUBTOTAL_REQUIRED', 'MINIMUM_SUBTOTAL_NOT_POSITIVE', 'MINIMUM_SUBTOTAL_INVALID', 'MINIMUM_SUBTOTAL_NOT_ALLOWED',
  'MINIMUM_QUANTITY_REQUIRED', 'MINIMUM_QUANTITY_INVALID', 'MINIMUM_QUANTITY_NOT_ALLOWED',
  'QUANTITY_BASIS_REQUIRED', 'QUANTITY_BASIS_INVALID', 'QUANTITY_BASIS_NOT_ALLOWED',
  'TARGETS_REQUIRED', 'TARGETS_NOT_ALLOWED', 'TARGETS_DUPLICATE',
  'TITLE_REQUIRED_DEFAULT_LOCALE', 'TITLE_INVALID', 'DESCRIPTION_TOO_LONG',
  'LOCALE_NOT_ACTIVE', 'TRANSLATION_LOCALE_DUPLICATE', 'INVALID_PROMOTION_TARGET',
  'DELIVERY_ZONE_REQUIRED', 'ITEMS_EMPTY', 'ITEM_PRODUCT_INACTIVE', 'ITEM_PRODUCT_SOLD_OUT',
  'ITEM_CATEGORY_INACTIVE', 'ITEM_OUTSIDE_PRIMARY_MENU', 'ITEM_NAME_MISSING', 'ITEM_SIZE_UNAVAILABLE',
  'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA', 'ITEM_REQUIRED_CHOICE_UNAVAILABLE', 'ITEM_DUPLICATE', 'ITEM_NOT_ORDERABLE',
] as const;

export const EXCLUDED_CODES = [
  'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA', 'ITEM_REQUIRED_CHOICE_UNAVAILABLE', 'ITEM_SIZE_UNAVAILABLE', 'ITEM_NAME_MISSING', 'ITEM_NOT_ORDERABLE',
] as const;

export const COMPETITION_REASONS: readonly CompetitionReason[] = [
  'ITEM_OFFER_BEATEN_ON_SAME_ITEMS', 'ITEM_OFFER_BEATEN_BY_CART_LEVEL', 'CART_LEVEL_BEATEN_BY_ITEM_OFFERS',
  'CART_LEVEL_BEATEN_BY_BETTER_CART_LEVEL', 'DELIVERY_BEATEN_BY_BETTER_DELIVERY',
];

export const OMITTED_REASONS: readonly OmittedExampleReason[] = [
  'SINGLE_UNIT_REACHES_THRESHOLD', 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE', 'NOT_ENOUGH_DISTINCT_PRODUCTS', 'DRAFT_NOT_APPLICABLE_IN_CONTEXT',
];

export const DIAGNOSTIC_STATUSES: readonly PreviewDiagnostic[] = [
  'APPLIED', 'LOST_TO_BETTER_OFFER', 'NOT_STARTED', 'EXPIRED', 'INACTIVE', 'WRONG_BRANCH', 'WRONG_ORDER_TYPE', 'WRONG_ZONE',
  'NO_ELIGIBLE_ITEMS', 'NO_DELIVERY_FEE', 'NO_EFFECTIVE_DISCOUNT', 'BELOW_MINIMUM_SUBTOTAL', 'BELOW_MINIMUM_QUANTITY', 'INVALID_CONFIGURATION',
];

export const ILLUSTRATIVE_REASONS = ['NO_DELIVERY_ZONE', 'NO_ORDERABLE_APPLICABLE_PRODUCT'] as const;

export const LOCAL_INCOMPLETE_REASONS: readonly IncompleteReason[] = [
  'VALUE_MISSING', 'VALUE_INVALID', 'NAMES', 'TRANSLATION', 'CATEGORY_TARGETS', 'MENU_TARGETS', 'MINIMUM_QUANTITY', 'MINIMUM_SUBTOTAL', 'DATES', 'PRIORITY', 'ZONE_BRANCH', 'NO_BRANCH', 'OTHER',
];

const known = (list: readonly string[], code: string) => list.includes(code);

/** An unknown Backend code still gets a plain sentence, never the raw code. */
export function problemKey(code: string): MessageKey {
  return `promotions.preview.problem.${known(PROBLEM_CODES, code) ? code : 'OTHER'}` as MessageKey;
}

export function excludedKey(code: string): MessageKey {
  return `promotions.preview.excluded.${known(EXCLUDED_CODES, code) ? code : 'ITEM_NOT_ORDERABLE'}` as MessageKey;
}

export function competitionKey(reason: string): MessageKey {
  return `promotions.preview.winner.${known(COMPETITION_REASONS, reason) ? reason : 'ITEM_OFFER_BEATEN_ON_SAME_ITEMS'}` as MessageKey;
}

export function omittedKey(reason: string): MessageKey {
  return `promotions.preview.omitted.${known(OMITTED_REASONS, reason) ? reason : 'DRAFT_NOT_APPLICABLE_IN_CONTEXT'}` as MessageKey;
}

export function diagnosticKey(status: string): MessageKey {
  return `promotions.diagnostic.${known(DIAGNOSTIC_STATUSES, status) ? status : 'INVALID_CONFIGURATION'}` as MessageKey;
}

export function illustrativeReasonKey(reason: string): MessageKey {
  return `promotions.preview.illustrativeReason.${known(ILLUSTRATIVE_REASONS, reason) ? reason : 'NO_ORDERABLE_APPLICABLE_PRODUCT'}` as MessageKey;
}

export function incompleteKey(reason: IncompleteReason): MessageKey {
  return `promotions.preview.incomplete.${known(LOCAL_INCOMPLETE_REASONS, reason) ? reason : 'OTHER'}` as MessageKey;
}

/** `0`, `0.0`, `0.00`: a display decision on the Backend's string, not arithmetic. */
export function isZeroAmount(value: string | null | undefined): boolean {
  return value === null || value === undefined || !/[1-9]/.test(value);
}

export type ThresholdPair = { below: PreviewExample | null; qualifying: PreviewExample | null; single: PreviewExample | null };

export function pairExamples(answer: ReadyPreview): ThresholdPair {
  const find = (kind: PreviewExample['kind']) => answer.examples.find((example) => example.kind === kind) ?? null;
  return { below: find('BELOW_THRESHOLD'), qualifying: find('QUALIFYING'), single: find('SINGLE') };
}

/** What may be shown as a figure: only a REAL / ILLUSTRATIVE answer, never an INCOMPLETE one. */
export function carriesFigures(answer: ContextualPreview | null | undefined): answer is ReadyPreview {
  return Boolean(answer) && answer?.state !== 'INCOMPLETE';
}

/** Does the example say the draft's own saving applied? (`appliedSaving` is this promotion's, never a competitor's.) */
export function isApplied(example: PreviewExample): boolean {
  return example.diagnostic.status === 'APPLIED' && !isZeroAmount(example.appliedSaving);
}

/** A potential saving is worth saying only when it is a real figure the draft did not get to apply. */
export function showsPotential(example: PreviewExample): boolean {
  return example.diagnostic.status === 'LOST_TO_BETTER_OFFER' && !isZeroAmount(example.diagnostic.potentialSaving);
}
