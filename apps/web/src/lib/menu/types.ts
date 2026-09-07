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
