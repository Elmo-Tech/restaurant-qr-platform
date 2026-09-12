import type { Prisma } from '../generated/prisma/client';

/** Safe Translation shape shared by Menu/Category/Product Translation resources -- never a raw Prisma row (no `id`, no parent entity id). */
export interface TranslationView {
  locale: string;
  name: string;
  description: string | null;
}

/**
 * LOC-2B (Section 8): a Translation mutation may target only a locale that
 * is currently ACTIVE for the authorized Restaurant -- this is the one
 * check shared identically by Menu/Category/Product's PUT and DELETE
 * Translation logic, so it lives here once rather than being copy-pasted
 * three times.
 *
 * Deliberately a plain function taking an already-open transaction client,
 * not an injectable service: MenuModule must not depend on RestaurantsModule
 * merely to reuse `RestaurantLocalesService` (Section 18) -- `RestaurantLocale`
 * is queried directly via Prisma, exactly like every other Tenant-scoped
 * query in this codebase, using the same `restaurantId_locale` composite key
 * `RestaurantLocalesService.setLocaleState` itself uses. This function never
 * creates or repairs a `RestaurantLocale` row -- a missing row is simply
 * "not active", identical to an existing row with `isActive: false`.
 */
export async function isRestaurantLocaleActive(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  locale: string,
): Promise<boolean> {
  const row = await tx.restaurantLocale.findUnique({
    where: { restaurantId_locale: { restaurantId, locale } },
    select: { isActive: true },
  });
  return row?.isActive === true;
}

/**
 * LOC-2B (Section 8/27): the one shared 409 response for a Translation
 * mutation targeting a locale that is not currently active for the
 * Restaurant -- identical across Menu/Category/Product, never a
 * per-entity variant (`MENU_LOCALE_NOT_ACTIVE` etc. do not exist).
 */
export const LOCALE_NOT_ACTIVE_RESPONSE = {
  error: {
    code: 'LOCALE_NOT_ACTIVE',
    message: 'The locale is not active for this Restaurant.',
  },
};

/**
 * LOC-2B (Section 13/27): the one shared 409 response for attempting to
 * delete the Restaurant's current default-locale Translation -- identical
 * across Menu/Category/Product.
 */
export const DEFAULT_TRANSLATION_REQUIRED_RESPONSE = {
  error: {
    code: 'DEFAULT_TRANSLATION_REQUIRED',
    message: 'The default locale translation cannot be deleted.',
  },
};
