/** Mirrors the Backend's public Guest Menu response shape exactly (FT-3) -- never a Staff `menu/types.ts` type, since the public payload's shape (flattened, already-resolved names/descriptions, no translation rows) is genuinely different. */
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
  };
  branch: { name: string } | null;
  table: { number: string } | null;
  /** FT-7: GENERIC QR only (null for TABLE) -- the ACTIVE Branches eligible for Pickup. Empty = Pickup unavailable. */
  pickupBranches: { id: string; name: string }[] | null;
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
