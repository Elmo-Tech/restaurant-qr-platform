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
  translation: ProductTranslation;
}

/** FT-6A: mirrors `apps/api/src/menu/modifiers.service.ts`'s safe response shapes. V1 scope: default-locale name/helperText only -- secondary-locale Modifier translation editing is not implemented in this batch. */
export type ModifierGroupStatus = 'ACTIVE' | 'INACTIVE';
export type ModifierOptionStatus = 'ACTIVE' | 'INACTIVE';

/** `priceAdjustment` is the Backend's authoritative decimal string, exactly like `Product.basePrice` -- never run through Number()/parseFloat(). */
export interface ModifierOption {
  id: string;
  status: ModifierOptionStatus;
  name: string;
  priceAdjustment: string;
  displayOrder: number;
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
}
