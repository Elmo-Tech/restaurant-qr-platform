/**
 * Types mirroring the Backend's safe Menu/Category/Product response shapes
 * exactly (`apps/api/src/menu/{menus,categories,products}.service.ts`) --
 * typing only, no business logic. The Backend remains the sole authority on
 * pricing, availability, and Promotion resolution (CLAUDE.md #27/#28).
 */

export type MenuStatus = 'ACTIVE' | 'INACTIVE';
export type CategoryStatus = 'ACTIVE' | 'INACTIVE';
export type ProductStatus = 'ACTIVE' | 'INACTIVE';
export type ProductAvailability = 'AVAILABLE' | 'SOLD_OUT';

export interface MenuTranslation {
  locale: string;
  name: string;
  description: string | null;
}

export interface Menu {
  id: string;
  nameInternal: string;
  status: MenuStatus;
  displayOrder: number;
  isPrimary: boolean;
  translation: MenuTranslation;
}

export interface CategoryTranslation {
  locale: string;
  name: string;
  description: string | null;
}

export interface Category {
  id: string;
  menuId: string;
  status: CategoryStatus;
  displayOrder: number;
  imageAssetPath: string | null;
  translation: CategoryTranslation;
}

export interface ProductTranslation {
  locale: string;
  name: string;
  description: string | null;
}

export type ProductDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type ProductDiscountState = 'DISABLED' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';

/** Product Discounts V1 as Staff see it. `discountedPrice` is the unit price Guests pay right now (null unless ACTIVE). */
export interface ProductDiscount {
  enabled: boolean;
  type: ProductDiscountType;
  /** Decimal string: a percentage ("20.00") or an amount. */
  value: string;
  startsOn: string | null;
  endsOn: string | null;
  state: ProductDiscountState;
  discountedPrice: string | null;
}

/** `basePrice` is the Backend's authoritative decimal string -- never run through Number()/parseFloat() (CLAUDE.md #27). */
export interface Product {
  id: string;
  publicId: string;
  categoryId: string;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: string;
  primaryImageAssetPath: string | null;
  displayOrder: number;
  allowCustomerNotes: boolean;
  featured: boolean;
  /** Null when no discount is configured. */
  discount: ProductDiscount | null;
  translation: ProductTranslation;
}

/** FT-6A (closeout: EN/AR editing added; FT-6B: Preset linking added): mirrors `apps/api/src/menu/modifiers.service.ts`'s safe response shapes. */
export type ModifierGroupStatus = 'ACTIVE' | 'INACTIVE';
export type ModifierOptionStatus = 'ACTIVE' | 'INACTIVE';

/** `priceAdjustment` is the Backend's authoritative decimal string, exactly like `Product.basePrice` -- never run through Number()/parseFloat(). */
export interface ModifierOption {
  id: string;
  status: ModifierOptionStatus;
  name: string;
  priceAdjustment: string;
  displayOrder: number;
  /** FT-6B: null for a Custom Option; identifies the source `ModifierPresetOption` when created via "Use Preset". */
  sourcePresetOptionId: string | null;
  /** FT-6B: true once Staff has overridden this Product's price away from the linked Preset Option's current default. */
  priceIsOverridden: boolean;
  /** FT-6B closeout: true only when this Option has never been snapshotted into a historical Order -- "Delete" is offered only when true. */
  canDelete: boolean;
}

/** `minimumSelections`/`maximumSelections` alone express required/optional/single/multi-select -- required = minimumSelections >= 1, optional = 0, single-select = maximumSelections = 1, multi-select = maximumSelections > 1. */
export interface ModifierGroup {
  id: string;
  status: ModifierGroupStatus;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
  options: ModifierOption[];
  /** FT-6B: null for a Group created via "Create Custom"; identifies the source `ModifierPreset` when created via "Use Preset". */
  sourcePresetId: string | null;
  /** FT-6B closeout: true only when NEITHER this Group NOR any of its Options has ever been snapshotted into a historical Order -- "Delete"/"Remove from Product" are offered only when true. */
  canDelete: boolean;
}

/** FT-6B: mirrors `apps/api/src/menu/modifier-presets.service.ts`'s safe response shapes -- a Restaurant-scoped reusable Modifier Group TEMPLATE. Never read by the Guest Menu/Cart/Orders (Staff authoring convenience only). */
export type ModifierPresetStatus = 'ACTIVE' | 'INACTIVE';
export type ModifierPresetOptionStatus = 'ACTIVE' | 'INACTIVE';

export interface ModifierPresetOption {
  id: string;
  status: ModifierPresetOptionStatus;
  name: string;
  priceAdjustment: string;
  displayOrder: number;
  /** FT-6B closeout: true only when no Product-local Option currently links to this one -- "Delete" is offered only when true. */
  canDelete: boolean;
}

export interface ModifierPreset {
  id: string;
  status: ModifierPresetStatus;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
  options: ModifierPresetOption[];
  /** FT-6B closeout: true only when no Product currently uses this Preset -- "Delete" is offered only when true. */
  canDelete: boolean;
}
