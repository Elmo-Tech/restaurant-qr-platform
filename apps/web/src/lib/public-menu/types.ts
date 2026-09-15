/** Mirrors the Backend's public Guest Menu response shape exactly (FT-3) -- never a Staff `menu/types.ts` type, since the public payload's shape (flattened, already-resolved names/descriptions, no translation rows) is genuinely different. */
export interface PublicMenuContext {
  qrType: 'TABLE' | 'GENERIC';
  restaurant: { name: string; currencyCode: string };
  branch: { name: string } | null;
  table: { number: string } | null;
}

export interface PublicMenuLocale {
  requested: string | null;
  resolved: string;
  default: string;
  available: string[];
}

export type PublicProductAvailability = 'AVAILABLE' | 'SOLD_OUT';

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  primaryImageAssetPath: string | null;
  availability: PublicProductAvailability;
  featured: boolean;
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
