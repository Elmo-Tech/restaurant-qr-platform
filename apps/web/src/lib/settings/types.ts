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

/** Mirrors the Backend's Restaurant Profile response (`PATCH /restaurants/:id`, `POST /restaurants/:id/logo`). */
export interface RestaurantProfile {
  name: string;
  logoAssetPath: string | null;
  coverAssetPath: string | null;
}
