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

export interface PreviewInput {
  draft: PromotionDraft;
  promotionId?: string;
  branchId: string;
  orderType: PreviewOrderType;
  deliveryZoneId?: string;
  items: { productId: string; quantity: number }[];
}

export type PreviewDiagnostic = 'APPLIED' | 'LOST_TO_BETTER_OFFER' | 'NOT_STARTED' | 'EXPIRED' |
  'INACTIVE' | 'WRONG_BRANCH' | 'WRONG_ORDER_TYPE' | 'WRONG_ZONE' | 'NO_ELIGIBLE_ITEMS' |
  'NO_DELIVERY_FEE' | 'NO_EFFECTIVE_DISCOUNT' | 'BELOW_MINIMUM_SUBTOTAL' |
  'BELOW_MINIMUM_QUANTITY' | 'INVALID_CONFIGURATION';

export interface PromotionPreview {
  strategy: 'ITEM' | 'CART' | 'NONE';
  merchandiseOriginal: string;
  merchandisePayable: string;
  deliveryFeeOriginal: string;
  deliveryFeePayable: string;
  grandTotal: string;
  appliedSaving: string;
  diagnostic: {
    status: PreviewDiagnostic;
    potentialSaving: string | null;
    remainingAmount: string | null;
    remainingQuantity: number | null;
  };
  zoneMinimumShortfall: string | null;
}

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

export async function previewPromotion(restaurantId: string, input: PreviewInput, signal?: AbortSignal): Promise<PromotionPreview> {
  const { data } = await apiFetch<{ data: PromotionPreview }>(`${base(restaurantId)}/preview`, { method: 'POST', body: input, signal });
  return data;
}
