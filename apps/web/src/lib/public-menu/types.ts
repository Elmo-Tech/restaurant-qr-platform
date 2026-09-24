/** Mirrors the Backend's public Guest Menu response shape exactly (FT-3) -- never a Staff `menu/types.ts` type, since the public payload's shape (flattened, already-resolved names/descriptions, no translation rows) is genuinely different. */
export interface PublicMenuContext {
  qrType: 'TABLE' | 'GENERIC';
  restaurant: { name: string; currencyCode: string };
  branch: { name: string } | null;
  table: { number: string } | null;
  /** FT-7: GENERIC QR only (null for TABLE) -- the ACTIVE Branches eligible for Pickup. Empty = Pickup unavailable. */
  pickupBranches: { id: string; name: string }[] | null;
}

export interface PublicMenuLocale {
  requested: string | null;
  resolved: string;
  default: string;
  available: string[];
}

export type PublicProductAvailability = 'AVAILABLE' | 'SOLD_OUT';

/** FT-6A: mirrors the Backend's `PublicMenuModifierOption` exactly -- `priceAdjustment` is the authoritative decimal string, never run through Number()/parseFloat() (CLAUDE.md #27). Only ever ACTIVE options for an ACTIVE Group are ever included here. */
export interface PublicMenuModifierOption {
  id: string;
  name: string;
  priceAdjustment: string;
}

export interface PublicMenuModifierGroup {
  id: string;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  options: PublicMenuModifierOption[];
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  primaryImageAssetPath: string | null;
  availability: PublicProductAvailability;
  featured: boolean;
  modifierGroups: PublicMenuModifierGroup[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description: string | null;
  imageAssetPath: string | null;
  products: PublicMenuProduct[];
}

export interface PublicMenuData {
  context: PublicMenuContext;
  locale: PublicMenuLocale;
  menu: {
    id: string;
    name: string;
    description: string | null;
    categories: PublicMenuCategory[];
  };
}

/** Mirrors the Backend's `GuestOrderView` exactly (FT-5, extended FT-6A). Never restaurantId/branchId/tableId/qrCodeId. */
export interface GuestOrderItemModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface GuestOrderItemView {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  modifiers: GuestOrderItemModifierView[];
}

export type GuestOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface GuestOrderView {
  id: string;
  status: GuestOrderStatus;
  currencyCode: string;
  total: string;
  createdAt: string;
  /** FT-7: DINE_IN (TABLE QR) or PICKUP (GENERIC QR). */
  type: 'DINE_IN' | 'PICKUP';
  /** Null for a PICKUP Order. */
  table: { number: string } | null;
  /** FT-7: PICKUP only -- the safe Branch display name. */
  pickupBranch: { name: string } | null;
  items: GuestOrderItemView[];
}
