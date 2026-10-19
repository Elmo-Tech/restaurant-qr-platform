import type { RestaurantContact } from '../contact/types';

/** Mirrors the Backend's public Guest Menu response shape exactly (FT-3) -- never a Staff `menu/types.ts` type, since the public payload's shape (flattened, already-resolved names/descriptions, no translation rows) is genuinely different. */
/** What the Backend says about a Branch's opening hours; clock strings are in the Branch's own time. */
export interface PublicHours {
  open: boolean;
  temporarilyClosed: boolean;
  /** The next opening: 0 = later today, 1 = tomorrow ... and the weekday it falls on (0 = Sunday). */
  opensAt: { dayOffset: number; time: string; dayOfWeek: number } | null;
  /** While open on a schedule: the closing clock "HH:MM". */
  closesAt: string | null;
}

export interface PublicAnnouncement {
  id: string;
  style: 'INFO' | 'PROMO' | 'WARNING';
  text: string;
}

export interface PublicMenuContext {
  qrType: 'TABLE' | 'GENERIC';
  /** Table Sessions: TABLE QR only (null for GENERIC). Advisory -- the order endpoint re-checks. */
  tableOrdering: 'AVAILABLE' | 'CLOSED' | 'DISABLED' | null;
  restaurant: {
    name: string;
    currencyCode: string;
    logoAssetPath: string | null;
    /** Guest hero cover image; `null` keeps the default branded hero. */
    coverAssetPath: string | null;
    /** How the menu is laid out (DEC-044); presentation only. */
    menuTemplate?: string;
    /** Contact details for the Guest Menu; a field is null when not set. */
    contact: RestaurantContact;
    /** Public code of the Restaurant's own (generic) QR: the link the Guest may share; never a Table QR. Null = nothing to share. */
    shareCode: string | null;
    /** Opening-hours summary for the badge (DEC-042); null = always open, show nothing. */
    hours: PublicHours | null;
  };
  branch: { name: string } | null;
  table: { number: string } | null;
  /** Live announcements for the banner (DEC-042), already in the Guest's language; at most three. */
  announcements: PublicAnnouncement[];
  /** Smart suggestions are on (DEC-042): the cart may ask for "Complete your meal" products. */
  suggestions?: boolean;
  /** Order tracking is available (DEC-043); `false` hides the track-order control. */
  tracking?: boolean;
  /** Menu templates other than Classic are allowed (DEC-043). */
  templatesAllowed?: boolean;
  /** The templates the package allows (DEC-051), as the API names them; a preview of any other is ignored. */
  allowedTemplates?: string[];
  /** How a GENERIC QR order is taken (DEC-042); null for a TABLE QR. Absent on an older Backend = the app takes both, no WhatsApp. */
  ordering?: { pickup: boolean; delivery: boolean; whatsapp: boolean } | null;
  /** FT-7: GENERIC QR only (null for TABLE) -- the ACTIVE Branches eligible for Pickup. Empty = Pickup unavailable. */
  pickupBranches: { id: string; name: string; hours: PublicHours | null }[] | null;
  /** FT-8: GENERIC QR only -- ACTIVE Branches with at least one ACTIVE Delivery zone. Empty = Delivery unavailable. Display data only: the Backend re-resolves fee/minimum on submit. */
  deliveryBranches: PublicDeliveryBranch[] | null;
}

export interface PublicProductDiscount {
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  /** The configured value: a percentage ("20.00") or an amount. */
  value: string;
  /** Amount taken off one unit of `basePrice`. */
  amountOff: string;
  /** Unit price after the discount (before paid extras). */
  discountedPrice: string;
  /** Last day the discount applies (YYYY-MM-DD), or null when open-ended. */
  endsOn: string | null;
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  /** Exact decimal strings -- never run through Number()/parseFloat(). */
  deliveryFee: string;
  minimumOrder: string;
}

export interface PublicDeliveryBranch {
  id: string;
  name: string;
  /** Opening hours of this Branch (DEC-042); null = always open. */
  hours: PublicHours | null;
  zones: PublicDeliveryZone[];
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

/**
 * Product Variants (DEC-041): one size a Guest can pick. `price` is the size's full price;
 * `discountedPrice` is present only when the Product discount currently applies to THIS size.
 */
export interface PublicMenuVariant {
  id: string;
  name: string;
  price: string;
  discountedPrice: string | null;
  isDefault: boolean;
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  /** The ORIGINAL price. While `discount` is present the Guest pays `discount.discountedPrice` per unit instead. */
  basePrice: string;
  /** Product Discounts V1: present only while a discount currently applies; absent means normal pricing. */
  discount: PublicProductDiscount | null;
  primaryImageAssetPath: string | null;
  availability: PublicProductAvailability;
  featured: boolean;
  modifierGroups: PublicMenuModifierGroup[];
  /** Sizes (DEC-041). Absent or empty = a single price. */
  variants?: PublicMenuVariant[];
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
  /** The chosen size (DEC-041), or null for a product without sizes. */
  variantName: string | null;
  quantity: number;
  /** Price of one unit BEFORE any product discount. */
  unitPrice: string;
  /** Product Discounts V1: total discount taken off this line ("0.00" when none). `lineTotal` is already net of it. */
  discountAmount: string;
  lineTotal: string;
  modifiers: GuestOrderItemModifierView[];
}

export type GuestOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
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
  type: 'DINE_IN' | 'PICKUP' | 'DELIVERY';
  /** Null for a PICKUP Order. */
  table: { number: string } | null;
  /** FT-7: PICKUP only -- the safe Branch display name. */
  pickupBranch: { name: string } | null;
  /** FT-8: DELIVERY only. */
  delivery: { branchName: string; zoneName: string } | null;
  /** FT-8: exact breakdown -- subtotal + deliveryFee = total. `subtotal` is net of product discounts. */
  subtotal: string;
  deliveryFee: string;
  /** Product Discounts V1: sum of the items' discounts ("0.00" when none). */
  discountTotal: string;
  items: GuestOrderItemView[];
}
