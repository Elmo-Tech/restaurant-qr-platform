import { apiFetch, apiFetchFormData } from '../api/client';

/** Offers / Bundles (DEC-069): Staff request layer for `/restaurants/{id}/offers`. Money is always a decimal string. */

export type OfferStatus = 'ACTIVE' | 'INACTIVE';
export type OfferBadge = 'OFFER' | 'GIFT' | 'MOST_ORDERED';
export type OfferSlotKind = 'FIXED' | 'SINGLE' | 'MULTI';

export interface OfferOption {
  id: string;
  /** `{ <locale>: name }` for the languages that have one. */
  names: Record<string, string>;
  /** Added to the offer price when chosen ("0.00" = free; always "0.00" for an included item). */
  priceAdjustment: string;
  /** Set when the item IS a menu item (and, with sizes, which size); its names then follow the menu. */
  productId: string | null;
  variantId: string | null;
  /** Units an included item brings. */
  quantity: number;
  /** False while a linked item is sold out or hidden. */
  orderable: boolean;
}

export interface OfferSlot {
  id: string;
  kind: OfferSlotKind;
  /** MULTI: how many to pick in total; SINGLE: 1; FIXED: 0. */
  requiredCount: number;
  titles: Record<string, string>;
  options: OfferOption[];
}

export interface Offer {
  id: string;
  status: OfferStatus;
  badge: OfferBadge;
  price: string;
  /** 0 (Sunday) to 6 (Saturday); empty = every day. */
  daysOfWeek: number[];
  /** Inclusive "YYYY-MM-DD", or null. */
  startsOn: string | null;
  endsOn: string | null;
  imageAssetPath: string | null;
  displayOrder: number;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  /** Where it stands today: shown now, wrong weekday today, not started, ended, or switched off. */
  state: 'LIVE' | 'TODAY_OFF' | 'SCHEDULED' | 'EXPIRED' | 'OFF';
  slots: OfferSlot[];
}

/** One slot as the editor sends it (an existing slot / option keeps its id; new ones have none). */
export interface OfferSlotInput {
  id?: string;
  kind: OfferSlotKind;
  requiredCount?: number;
  titles: Record<string, string | null>;
  options: {
    id?: string;
    names?: Record<string, string | null>;
    priceAdjustment?: string;
    productId?: string | null;
    variantId?: string | null;
    quantity?: number;
  }[];
}

export interface OfferInput {
  status?: OfferStatus;
  badge?: OfferBadge;
  price?: string;
  daysOfWeek?: number[];
  startsOn?: string | null;
  endsOn?: string | null;
  names?: Record<string, string | null>;
  descriptions?: Record<string, string | null>;
  slots?: OfferSlotInput[];
}

const base = (restaurantId: string): string => `/restaurants/${restaurantId}/offers`;

export async function listOffers(restaurantId: string): Promise<Offer[]> {
  const body = await apiFetch<{ data: Offer[] }>(base(restaurantId));
  return body.data;
}

export async function createOffer(restaurantId: string, input: OfferInput): Promise<Offer> {
  const body = await apiFetch<{ data: Offer }>(base(restaurantId), { method: 'POST', body: input });
  return body.data;
}

export async function updateOffer(restaurantId: string, id: string, input: OfferInput): Promise<Offer> {
  const body = await apiFetch<{ data: Offer }>(`${base(restaurantId)}/${id}`, { method: 'PATCH', body: input });
  return body.data;
}

/** "Delete": hides the offer from guests and from this list; past orders keep it. */
export async function deleteOffer(restaurantId: string, id: string): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${id}`, { method: 'DELETE' });
}

/** The full list of offer ids in the order they should show. */
export async function reorderOffers(restaurantId: string, offerIds: string[]): Promise<void> {
  await apiFetch(`${base(restaurantId)}/order`, { method: 'PUT', body: { offerIds } });
}

export async function uploadOfferImage(restaurantId: string, id: string, file: File): Promise<string> {
  // multipart, field name exactly "image" (the Backend's FileInterceptor); `apiFetch` would JSON-encode the file.
  const form = new FormData();
  form.set('image', file);
  const body = await apiFetchFormData<{ data: { imageAssetPath: string } }>(`${base(restaurantId)}/${id}/image`, form);
  return body.data.imageAssetPath;
}

export async function removeOfferImage(restaurantId: string, id: string): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${id}/image`, { method: 'DELETE' });
}

/** One menu item the editor can pick (with its sizes). */
export interface MenuItemChoice {
  id: string;
  names: Record<string, string>;
  categoryNames: Record<string, string>;
  available: boolean;
  variants: { id: string; names: Record<string, string>; price: string }[];
}

export async function listMenuItems(restaurantId: string): Promise<MenuItemChoice[]> {
  const body = await apiFetch<{ data: MenuItemChoice[] }>(`${base(restaurantId)}/menu-items`);
  return body.data;
}
