import { apiFetch } from '../api/client';
import type { LocalizedNameSource } from '../i18n/localized-name';

export const promotionScopes = ['CATEGORY', 'MENU', 'CART', 'QUANTITY', 'DELIVERY'] as const;
export const promotionStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type PromotionScope = (typeof promotionScopes)[number];
export type PromotionStatus = (typeof promotionStatuses)[number];
export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type QuantityBasis = 'UNITS' | 'DISTINCT_PRODUCTS';
export type PromotionAction = 'activate' | 'deactivate' | 'archive' | 'delete';

export interface PromotionTranslation {
  locale: string;
  title: string;
  description: string | null;
}

export interface PromotionDraft {
  internalName: string;
  scope: PromotionScope;
  discountType: DiscountType;
  value: string;
  priority: number;
  startsOn: string | null;
  endsOn: string | null;
  minimumSubtotal: string | null;
  minimumQuantity: number | null;
  quantityBasis: QuantityBasis | null;
  branchIds: string[];
  menuIds: string[];
  categoryIds: string[];
  productIds: string[];
  deliveryZoneIds: string[];
  translations: PromotionTranslation[];
}

export interface Promotion extends PromotionDraft {
  id: string;
  status: PromotionStatus;
  updatedAt: string;
  createdAt: string;
  archivedAt: string | null;
  canDelete: boolean;
  /** DEC-077 B2 (informational): a legacy CART promotion without a minimum above 0. The Backend decides every write. */
  needsMinimumSubtotal: boolean;
}

export interface PromotionOption extends LocalizedNameSource {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PromotionTargets {
  defaultLocale: string;
  /** DEC-077 B1 write gate: whether the backend currently accepts creating / activating / changing to a fixed CATEGORY or MENU promotion. */
  fixedItemScopeEnabled: boolean;
  activeLocales: string[];
  branches: (PromotionOption & { timezone: string })[];
  menus: PromotionOption[];
  categories: (PromotionOption & { menuId: string })[];
  products: (PromotionOption & { categoryId: string; availability: 'AVAILABLE' | 'SOLD_OUT' })[];
  deliveryZones: (PromotionOption & { branchId: string })[];
}

export interface PromotionFilters {
  status?: PromotionStatus;
  scope?: PromotionScope;
  search?: string;
  zoneId?: string;
  page: number;
}

export const PROMOTIONS_PAGE_SIZE = 20;

export interface PromotionsPage {
  data: Promotion[];
  meta: { page: number; pageSize: number; total: number };
}

export type PreviewOrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

/**
 * DEC-077 B3 `CONTEXTUAL_V1`: the authoritative preview contract. The browser sends the draft and a context (Branch,
 * order type); the Backend builds the baskets and prices them with the real engine. Every amount in the answer is a
 * Backend decimal string that is only displayed, never computed on.
 */
export interface PreviewRequest {
  contract: 'CONTEXTUAL_V1';
  /** Echoed back; an answer to any other id is never shown (`^[A-Za-z0-9._-]{8,64}$`). */
  requestId: string;
  draft: PromotionDraft;
  /** An existing promotion being edited: the draft replaces it instead of competing with itself. */
  promotionId?: string;
  branchId: string;
  orderType: PreviewOrderType;
  deliveryZoneId?: string;
}

export type PreviewState = 'REAL' | 'ILLUSTRATIVE' | 'INCOMPLETE';
export type PreviewExampleKind = 'QUALIFYING' | 'BELOW_THRESHOLD' | 'SINGLE';
export type PreviewDiagnostic = 'APPLIED' | 'LOST_TO_BETTER_OFFER' | 'NOT_STARTED' | 'EXPIRED' |
  'INACTIVE' | 'WRONG_BRANCH' | 'WRONG_ORDER_TYPE' | 'WRONG_ZONE' | 'NO_ELIGIBLE_ITEMS' |
  'NO_DELIVERY_FEE' | 'NO_EFFECTIVE_DISCOUNT' | 'BELOW_MINIMUM_SUBTOTAL' |
  'BELOW_MINIMUM_QUANTITY' | 'INVALID_CONFIGURATION';
export type CompetitionReason = 'ITEM_OFFER_BEATEN_ON_SAME_ITEMS' | 'ITEM_OFFER_BEATEN_BY_CART_LEVEL' |
  'CART_LEVEL_BEATEN_BY_ITEM_OFFERS' | 'CART_LEVEL_BEATEN_BY_BETTER_CART_LEVEL' | 'DELIVERY_BEATEN_BY_BETTER_DELIVERY';
export type OmittedExampleReason = 'SINGLE_UNIT_REACHES_THRESHOLD' | 'THRESHOLD_NOT_REACHABLE_WITH_SAMPLE' |
  'NOT_ENOUGH_DISTINCT_PRODUCTS' | 'DRAFT_NOT_APPLICABLE_IN_CONTEXT';
export type IllustrativeReason = 'NO_DELIVERY_ZONE' | 'NO_ORDERABLE_APPLICABLE_PRODUCT';

export interface PreviewProblem { code: string; field: string }

/** An INCOMPLETE answer is exactly these four keys: it carries no financial figure of any kind. */
export interface IncompletePreview {
  state: 'INCOMPLETE';
  requestId: string;
  evaluatedAt: string;
  problems: PreviewProblem[];
}

export interface PreviewExampleLine {
  /** null for an ILLUSTRATIVE sample: it is not a product of this restaurant. */
  productId: string | null;
  label: string;
  unitPrice: string;
  quantity: number;
}

export interface CompetingWinnerPart {
  source: 'PROMOTION' | 'PRODUCT_DISCOUNT';
  promotionId: string | null;
  scope: string;
  name: string | null;
  discountType: DiscountType;
  value: string;
  saving: string;
}

export interface CompetingWinner {
  reason: CompetitionReason;
  combined: boolean;
  saving: string;
  comparedSaving: string;
  winners: CompetingWinnerPart[];
}

export interface PreviewExample {
  kind: PreviewExampleKind;
  lines: PreviewExampleLine[];
  strategy: 'ITEM' | 'CART' | 'NONE';
  merchandiseOriginal: string;
  merchandisePayable: string;
  deliveryFeeOriginal: string;
  deliveryFeePayable: string;
  grandTotal: string;
  /** What THIS promotion saves in this basket (0.00 when it lost or did not qualify). */
  appliedSaving: string;
  diagnostic: {
    status: PreviewDiagnostic;
    /** What it would save on its own, also when another offer wins. Not what is applied. */
    potentialSaving: string;
    remainingAmount: string | null;
    remainingQuantity: number | null;
  };
  /** Not null: the Guest quote would refuse this basket for the delivery area's minimum. Pricing stays accurate. */
  zoneMinimumShortfall: string | null;
  uncertainty: { code: 'UNSAVED_DRAFT_ID_TIE_BREAK'; alternative: { status: PreviewDiagnostic; appliedSaving: string } } | null;
  competingWinner?: CompetingWinner;
}

export interface ApplicableProduct {
  productId: string;
  name: string;
  unitPrice: string;
  unitSaving?: string;
  unitPriceAfter?: string;
}

export interface ReadyPreview {
  state: 'REAL' | 'ILLUSTRATIVE';
  requestId: string;
  evaluatedAt: string;
  branchLocalDate: string;
  assumptions: {
    simulatedAsActive: true;
    size: 'FIRST_ACTIVE_SIZE';
    paidExtrasIncluded: false;
    branchId: string;
    orderType: PreviewOrderType;
    deliveryZoneId: string | null;
    sampleProductId: string | null;
    schedule: 'CURRENT' | 'NOT_STARTED' | 'EXPIRED';
    basket: 'BUILT_BY_BACKEND' | 'STAFF_ITEMS';
    illustrativeReasons: IllustrativeReason[];
  };
  applicableProducts: {
    total: number;
    /** More products qualify than were read: `total` is then a lower bound. */
    truncated: boolean;
    items: ApplicableProduct[];
    excluded: { code: string; count: number }[];
  };
  examples: PreviewExample[];
  omittedExamples: { kind: 'QUALIFYING' | 'BELOW_THRESHOLD'; reason: OmittedExampleReason }[];
}

export type ContextualPreview = IncompletePreview | ReadyPreview;

const base = (restaurantId: string) => `/restaurants/${encodeURIComponent(restaurantId)}/promotions`;
const resource = (restaurantId: string, id: string) => `${base(restaurantId)}/${encodeURIComponent(id)}`;

export function listPromotions(restaurantId: string, filters: PromotionFilters): Promise<PromotionsPage> {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: String(PROMOTIONS_PAGE_SIZE) });
  if (filters.status) query.set('status', filters.status);
  if (filters.scope) query.set('scope', filters.scope);
  if (filters.search) query.set('search', filters.search);
  if (filters.zoneId) query.set('zoneId', filters.zoneId);
  return apiFetch<PromotionsPage>(`${base(restaurantId)}?${query}`);
}

export async function getPromotion(restaurantId: string, id: string): Promise<Promotion> {
  const { data } = await apiFetch<{ data: Promotion }>(resource(restaurantId, id));
  return data;
}

export async function listPromotionTargets(restaurantId: string): Promise<PromotionTargets> {
  const { data } = await apiFetch<{ data: PromotionTargets }>(`${base(restaurantId)}/targets`);
  return data;
}

export async function savePromotion(restaurantId: string, draft: PromotionDraft, original: Promotion | null, confirmTargetWidening: boolean, confirmDiscountTypeChange = false): Promise<Promotion> {
  const { data } = await apiFetch<{ data: Promotion }>(original ? resource(restaurantId, original.id) : base(restaurantId), {
    method: original ? 'PATCH' : 'POST',
    body: original
      ? {
        ...draft,
        expectedUpdatedAt: original.updatedAt,
        ...(confirmTargetWidening ? { confirmTargetWidening: true } : {}),
        ...(confirmDiscountTypeChange ? { confirmDiscountTypeChange: true } : {}),
      }
      : draft,
  });
  return data;
}

export async function runPromotionAction(restaurantId: string, promotion: Promotion, action: PromotionAction): Promise<void> {
  const path = resource(restaurantId, promotion.id);
  if (action === 'delete') {
    await apiFetch(path, { method: 'DELETE' });
  } else {
    await apiFetch(`${path}/${action}`, { method: 'POST', body: { expectedUpdatedAt: promotion.updatedAt } });
  }
}

export async function previewPromotion(restaurantId: string, request: PreviewRequest, signal?: AbortSignal): Promise<ContextualPreview> {
  const { data } = await apiFetch<{ data: ContextualPreview }>(`${base(restaurantId)}/preview`, { method: 'POST', body: request, signal });
  return data;
}
