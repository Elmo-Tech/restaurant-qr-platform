/**
 * Types mirroring the Backend's Restaurant Languages response shape exactly
 * (`apps/api/src/restaurants/restaurant-locales.service.ts`, API_CONVENTIONS.md
 * #108D) -- typing only. The Platform-supported-locale registry itself is
 * NOT duplicated here: the Web app iterates whatever `locales` rows the
 * Backend actually returns, never a hardcoded `['en', 'ar']` (LOC-3, Section
 * 14).
 */

export interface RestaurantLocaleRow {
  locale: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface RestaurantLocalesResponse {
  defaultLocale: string;
  locales: RestaurantLocaleRow[];
}

/** DEC-037: the content kinds that need a name in a language before it can become the default. */
export type DefaultLocaleEntityKind =
  | 'menus'
  | 'categories'
  | 'products'
  | 'modifierGroups'
  | 'modifierOptions'
  | 'modifierPresets'
  | 'modifierPresetOptions'
  | 'branches'
  | 'deliveryZones';

/** Mirrors `GET .../locales/:locale/default-readiness`. */
export interface DefaultLocaleReadiness {
  locale: string;
  ready: boolean;
  missing: Record<DefaultLocaleEntityKind, number>;
  totalMissing: number;
}

/** Mirrors the Backend's Restaurant Profile response (`PATCH /restaurants/:id`, `POST /restaurants/:id/logo`). */
export interface RestaurantProfile {
  name: string;
  logoAssetPath: string | null;
  coverAssetPath: string | null;
}

/** Mirrors the Backend's `PATCH /restaurants/:id/ordering-options` response. */
export interface RestaurantOrderingOptions {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  tableOrderingEnabled: boolean;
}
