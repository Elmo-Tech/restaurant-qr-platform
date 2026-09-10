/**
 * LOC-2A, approved LOC-1 contract (Section 3/4): the ONE canonical
 * Platform-supported-locale registry -- every locale value anywhere in the
 * Restaurant Languages feature (`RestaurantLocale.locale`, the `:locale`
 * route param, `Restaurant.defaultLocale`) is validated against this exact
 * array, never a separate/duplicated list. Mirrors `PERMISSIONS`/
 * `ALL_PERMISSIONS`'s own pattern of one canonical source array driving
 * both the runtime value set and its derived type (`auth/permission/
 * permission.ts`).
 *
 * V1 supports EXACTLY `en` and `ar` (approved final decision -- do not
 * accept regional BCP-47 forms such as `en-US`/`ar-EG` in V1). The
 * `restaurant_locales.locale`/`restaurants.default_locale` DB columns are
 * already unconstrained `TEXT` (no CHECK constraint, no migration here or
 * ever needed to add a language later, LOC-1 Section 20) -- expanding
 * Platform language support later means appending to this one array, with
 * real canonicalization added at that time for any regional form, never by
 * relaxing this V1 allowlist prematurely.
 */
export const PLATFORM_SUPPORTED_LOCALES = ['en', 'ar'] as const;

export type PlatformSupportedLocale =
  (typeof PLATFORM_SUPPORTED_LOCALES)[number];

/**
 * Normalizes a raw locale value (`trim` -> lowercase`) and checks Platform
 * allowlist membership in one step -- the same `trim`-then-validate shape
 * already established by every Menu/Category/Product DTO's `trim`/
 * `trimToNull` helpers, applied here to locale identity instead of free
 * text. Returns `null` for anything that is not a `string` or does not
 * normalize to an exact allowlist member -- the allowlist is authoritative;
 * this never accepts a value merely because it looks language-code-shaped
 * (e.g. `fr`, `en-us`, `ENGLISH` are all rejected, not silently coerced).
 */
export function normalizePlatformLocale(
  value: unknown,
): PlatformSupportedLocale | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return isPlatformSupportedLocale(normalized) ? normalized : null;
}

/** Type-guard form of the same allowlist check, for call sites that already have a normalized `string` in hand. */
export function isPlatformSupportedLocale(
  value: string,
): value is PlatformSupportedLocale {
  return (PLATFORM_SUPPORTED_LOCALES as readonly string[]).includes(value);
}
