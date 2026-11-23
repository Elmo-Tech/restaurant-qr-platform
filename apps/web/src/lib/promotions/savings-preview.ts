import type { PreviewInput, Promotion, PromotionDraft, PromotionPreview, PromotionTargets } from './api.ts';
import { toPromotionDraft, type DraftFields } from './draft.ts';
import { fromMinorUnits as fromCents, toMinorUnits as toCents } from '../public-menu/money.ts';

/**
 * Plans the automatic Savings Preview in the Promotion editor.
 *
 * This module only CHOOSES an example basket (which real product, branch,
 * delivery area and quantity to ask about). Every real saving shown to Staff
 * comes from the existing read-only Backend preview endpoint, which runs the
 * real promotion engine. The only local arithmetic is the clearly labelled
 * illustrative example used when no real example can be built; it never
 * carries product IDs and is never sent to the API.
 */

export const PREVIEW_DEBOUNCE_MS = 450;
/** Backend preview limits (`PromotionPreviewDto`). */
const MAX_LINE_QUANTITY = 99;
const MAX_LINES = 20;

export type PreviewProduct = PromotionTargets['products'][number];
export type PreviewBranch = PromotionTargets['branches'][number];
export type PreviewZone = PromotionTargets['deliveryZones'][number];

export interface PreviewLine { product: PreviewProduct; quantity: number }

export type IncompleteReason = 'VALUE_MISSING' | 'VALUE_INVALID' | 'CATEGORY_TARGETS' | 'MENU_TARGETS' |
  'MINIMUM_QUANTITY' | 'MINIMUM_SUBTOTAL' | 'DATES' | 'PRIORITY' | 'ZONE_BRANCH' | 'OTHER';
export type IllustrativeReason = 'NO_BRANCH' | 'NO_PRODUCTS' | 'NO_ZONE' | 'NOT_ENOUGH_PRODUCTS' | 'QUANTITY_TOO_LARGE';

export interface IllustrativeExample {
  /** Units in the example basket (or distinct items for a distinct-product threshold). */
  quantity: number;
  distinct: boolean;
  original: string;
  payable: string;
  saving: string;
  deliveryFee: string | null;
  deliveryFeePayable: string | null;
}

export type SavingsPreviewPlan =
  | { kind: 'incomplete'; reason: IncompleteReason }
  | { kind: 'illustrative'; reason: IllustrativeReason; requiredQuantity: number | null; example: IllustrativeExample }
  | {
    kind: 'live';
    input: PreviewInput;
    lines: PreviewLine[];
    branch: PreviewBranch;
    zone: PreviewZone | null;
    /** Set when the example was sized to meet a quantity threshold. */
    requiredQuantity: number | null;
  };

// Names never affect pricing. A fixed neutral name keeps the preview working on a
// blank new draft and stops typing a title from triggering new calculations.
const PREVIEW_NAME = 'Savings preview';

function previewFields(fields: DraftFields, targets: PromotionTargets): DraftFields {
  return { ...fields, internalName: PREVIEW_NAME, translations: [{ locale: targets.defaultLocale, title: PREVIEW_NAME, description: null }] };
}

function incompleteReason(fields: DraftFields, error: string): IncompleteReason {
  switch (error) {
    case 'promotions.validation.value': return 'VALUE_INVALID';
    case 'promotions.validation.targets': return fields.scope === 'MENU' ? 'MENU_TARGETS' : 'CATEGORY_TARGETS';
    case 'promotions.validation.minimumQuantity': return 'MINIMUM_QUANTITY';
    case 'promotions.validation.minimumSubtotal': return 'MINIMUM_SUBTOTAL';
    case 'promotions.validation.dates': return 'DATES';
    case 'promotions.validation.priority': return 'PRIORITY';
    case 'promotions.validation.zoneBranch': return 'ZONE_BRANCH';
    default: return 'OTHER';
  }
}

/**
 * Active, available products in an active category and menu, in menu order.
 * Branch Product Overrides are not part of the targets catalog, so the Backend
 * remains the authority on per-branch availability.
 */
export function orderableProducts(targets: PromotionTargets): PreviewProduct[] {
  const menuIndex = new Map(targets.menus.map((menu, index) => [menu.id, index]));
  const categoryIndex = new Map(targets.categories.map((category, index) => [category.id, index]));
  const productIndex = new Map(targets.products.map((product, index) => [product.id, index]));
  const categoryById = new Map(targets.categories.map((category) => [category.id, category]));
  const menuById = new Map(targets.menus.map((menu) => [menu.id, menu]));
  const order = (product: PreviewProduct) => {
    const category = categoryById.get(product.categoryId);
    return [menuIndex.get(category?.menuId ?? '') ?? 0, categoryIndex.get(product.categoryId) ?? 0, productIndex.get(product.id) ?? 0];
  };
  return targets.products.filter((product) => {
    const category = categoryById.get(product.categoryId);
    const menu = category ? menuById.get(category.menuId) : undefined;
    return product.status === 'ACTIVE' && product.availability === 'AVAILABLE' && category?.status === 'ACTIVE' && menu?.status === 'ACTIVE';
  }).sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
}

/** Products the draft targets, mirroring the engine's eligibility inputs (category, menu, item restrictions). */
export function eligibleProducts(draft: PromotionDraft, targets: PromotionTargets): PreviewProduct[] {
  const menuOf = new Map(targets.categories.map((category) => [category.id, category.menuId]));
  const restricted = draft.categoryIds.length > 0 || draft.productIds.length > 0;
  return orderableProducts(targets).filter((product) => {
    switch (draft.scope) {
      case 'CATEGORY': return draft.categoryIds.includes(product.categoryId);
      case 'MENU': return draft.menuIds.includes(menuOf.get(product.categoryId) ?? '');
      case 'CART':
      case 'QUANTITY': return !restricted || draft.categoryIds.includes(product.categoryId) || draft.productIds.includes(product.id);
      case 'DELIVERY': return true;
    }
  });
}

// ---- local illustration (integer cents only, never floats) -----------------

// The tsconfig target (ES2017) has the BigInt global but not `0n` literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const PERCENT_SCALE = BigInt(10000);
const SAMPLE_UNIT_CENTS = BigInt(15000);
const SAMPLE_DELIVERY_FEE_CENTS = BigInt(2500);

/** Half-up division of non-negative integers. */
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * TWO + denominator) / (denominator * TWO);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - ONE) / denominator;
}

function amountOff(base: bigint, draft: PromotionDraft): bigint {
  const value = toCents(draft.value);
  if (draft.discountType === 'PERCENTAGE') return halfUp(base * value, PERCENT_SCALE);
  return value < base ? value : base;
}

export function illustrativeExample(draft: PromotionDraft): IllustrativeExample {
  const distinct = draft.scope === 'QUANTITY' && draft.quantityBasis === 'DISTINCT_PRODUCTS';
  let quantity = BigInt(draft.scope === 'QUANTITY' ? draft.minimumQuantity ?? 1 : 1);
  if (draft.minimumSubtotal !== null) {
    const needed = ceilDiv(toCents(draft.minimumSubtotal), SAMPLE_UNIT_CENTS);
    if (needed > quantity) quantity = needed;
  }
  const original = SAMPLE_UNIT_CENTS * quantity;
  if (draft.scope === 'DELIVERY') {
    const saving = amountOff(SAMPLE_DELIVERY_FEE_CENTS, draft);
    return {
      quantity: Number(quantity), distinct: false, original: fromCents(original), payable: fromCents(original), saving: fromCents(saving),
      deliveryFee: fromCents(SAMPLE_DELIVERY_FEE_CENTS), deliveryFeePayable: fromCents(SAMPLE_DELIVERY_FEE_CENTS - saving),
    };
  }
  // Item scopes discount each unit; cart scopes discount the basket.
  const saving = draft.scope === 'CATEGORY' || draft.scope === 'MENU'
    ? amountOff(SAMPLE_UNIT_CENTS, draft) * quantity
    : amountOff(original, draft);
  return {
    quantity: Number(quantity), distinct, original: fromCents(original), payable: fromCents(original - saving), saving: fromCents(saving),
    deliveryFee: null, deliveryFeePayable: null,
  };
}

// ---- planning --------------------------------------------------------------

export function planSavingsPreview(fields: DraftFields, targets: PromotionTargets, original: Pick<Promotion, 'id'> | null): SavingsPreviewPlan {
  if (!fields.value.trim()) return { kind: 'incomplete', reason: 'VALUE_MISSING' };
  const validated = toPromotionDraft(previewFields(fields, targets), targets);
  if ('error' in validated) return { kind: 'incomplete', reason: incompleteReason(fields, validated.error) };
  const { draft } = validated;
  const illustrative = (reason: IllustrativeReason, requiredQuantity: number | null = null): SavingsPreviewPlan =>
    ({ kind: 'illustrative', reason, requiredQuantity, example: illustrativeExample(draft) });
  const requiredQuantity = draft.scope === 'QUANTITY' ? draft.minimumQuantity : null;

  const branches = targets.branches.filter((branch) => branch.status === 'ACTIVE' && (!draft.branchIds.length || draft.branchIds.includes(branch.id)));
  if (!branches.length) return illustrative('NO_BRANCH', requiredQuantity);

  let branch = branches[0];
  let zone: PreviewZone | null = null;
  if (draft.scope === 'DELIVERY') {
    const zones = targets.deliveryZones.filter((item) => item.status === 'ACTIVE' && (!draft.deliveryZoneIds.length || draft.deliveryZoneIds.includes(item.id)));
    const match = branches.find((candidate) => zones.some((item) => item.branchId === candidate.id));
    if (!match) return illustrative('NO_ZONE');
    branch = match;
    zone = zones.find((item) => item.branchId === match.id) ?? null;
  }

  const products = eligibleProducts(draft, targets);
  let lines: PreviewLine[];
  if (draft.scope === 'DELIVERY') {
    // A simple order: one real item (if any) plus the zone's real delivery fee.
    lines = products.length ? [{ product: products[0], quantity: 1 }] : [];
  } else if (!products.length) {
    return illustrative('NO_PRODUCTS', requiredQuantity);
  } else if (draft.scope === 'QUANTITY' && draft.quantityBasis === 'DISTINCT_PRODUCTS') {
    const needed = draft.minimumQuantity ?? 1;
    if (needed > MAX_LINES || products.length < needed) return illustrative('NOT_ENOUGH_PRODUCTS', needed);
    lines = products.slice(0, needed).map((product) => ({ product, quantity: 1 }));
  } else if (draft.scope === 'QUANTITY') {
    const needed = draft.minimumQuantity ?? 1;
    if (needed > MAX_LINE_QUANTITY) return illustrative('QUANTITY_TOO_LARGE', needed);
    lines = [{ product: products[0], quantity: needed }];
  } else {
    lines = [{ product: products[0], quantity: 1 }];
  }

  return {
    kind: 'live',
    branch,
    zone,
    lines,
    requiredQuantity: requiredQuantity !== null && requiredQuantity > 1 ? requiredQuantity : null,
    input: {
      draft,
      ...(original ? { promotionId: original.id } : {}),
      branchId: branch.id,
      orderType: zone ? 'DELIVERY' : 'PICKUP',
      ...(zone ? { deliveryZoneId: zone.id } : {}),
      items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
    },
  };
}

/**
 * When a single-item example misses the promotion's minimum order, returns the
 * same request with enough units to reach it (or `null` when that is not
 * possible within the preview limits). The unit price comes from the engine's
 * own result, so no price is guessed.
 */
export function quantityForMinimum(input: PreviewInput, result: PromotionPreview): PreviewInput | null {
  const { status, remainingAmount } = result.diagnostic;
  if (status !== 'BELOW_MINIMUM_SUBTOTAL' || remainingAmount === null || input.items.length !== 1) return null;
  const [line] = input.items;
  const original = toCents(result.merchandiseOriginal);
  const quantity = BigInt(line.quantity);
  if (original <= ZERO || original % quantity !== ZERO) return null;
  const needed = ceilDiv(original + toCents(remainingAmount), original / quantity);
  if (needed <= quantity || needed > BigInt(MAX_LINE_QUANTITY)) return null;
  return { ...input, items: [{ productId: line.productId, quantity: Number(needed) }] };
}

export interface LiveOutcome {
  result: PromotionPreview;
  /** The request the shown result answers (it may have more units than planned). */
  input: PreviewInput;
  adjustedForMinimum: boolean;
}

export type PreviewFetcher = (input: PreviewInput, signal: AbortSignal) => Promise<PromotionPreview>;

export async function runSavingsPreview(input: PreviewInput, fetcher: PreviewFetcher, signal: AbortSignal): Promise<LiveOutcome> {
  const result = await fetcher(input, signal);
  const adjusted = signal.aborted ? null : quantityForMinimum(input, result);
  if (!adjusted) return { result, input, adjustedForMinimum: false };
  try {
    const second = await fetcher(adjusted, signal);
    // Use the adjusted example only if it really reaches the minimum.
    return second.diagnostic.status === 'BELOW_MINIMUM_SUBTOTAL' ? { result, input, adjustedForMinimum: false } : { result: second, input: adjusted, adjustedForMinimum: true };
  } catch (caught) {
    if (signal.aborted) throw caught;
    return { result, input, adjustedForMinimum: false };
  }
}

/**
 * Debounces one preview request and guarantees that a cancelled (superseded)
 * request can never report back: the in-flight fetch is aborted and any late
 * answer is dropped. Returns the cancel function (a React effect cleanup).
 */
export function schedulePreview(input: PreviewInput, options: {
  fetcher: PreviewFetcher;
  delayMs?: number;
  onPending: () => void;
  onResult: (outcome: LiveOutcome) => void;
  onError: (caught: unknown) => void;
}): () => void {
  let cancelled = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (cancelled) return;
    options.onPending();
    runSavingsPreview(input, options.fetcher, controller.signal).then(
      (outcome) => { if (!cancelled) options.onResult(outcome); },
      (caught: unknown) => { if (!cancelled) options.onError(caught); },
    );
  }, options.delayMs ?? PREVIEW_DEBOUNCE_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
  };
}

export function isZeroAmount(value: string): boolean {
  return toCents(value) === ZERO;
}
