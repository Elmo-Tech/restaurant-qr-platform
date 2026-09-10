import {
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from './platform-locales';

/**
 * LOC-2A, code review corrections: the standalone backfill's planning and
 * execution logic, extracted from the CLI script
 * (apps/api/scripts/backfill-restaurant-locales.ts) into plain, framework-
 * agnostic functions so it can be unit-tested with an in-memory/mock
 * `BackfillPrismaClient` -- the CLI file itself stays a thin wrapper
 * (dotenv, real PrismaClient + PrismaPg construction, console output,
 * process.exitCode) around `buildBackfillPlan`/`applyBackfillPlan`/
 * `verifyBackfill` below. This file is not a NestJS provider and has no
 * dependency on PrismaService/ConfigService -- it is used by both the
 * real standalone script and its Jest spec.
 */

export interface BackfillRestaurantRow {
  id: string;
  publicId: string;
  defaultLocale: string;
}

export interface BackfillLocaleRow {
  restaurantId: string;
  locale: string;
  isActive: boolean;
}

/**
 * The minimal slice of a Prisma client this module needs -- deliberately
 * NOT the full generated PrismaClient type, so a plain mock object
 * satisfies it in tests without constructing a real client or a database
 * connection. The real CLI script passes its real PrismaClient instance at
 * this narrowed type (see that file for the cast).
 */
export interface BackfillPrismaClient {
  restaurant: {
    findMany(args: {
      select: { id: true; publicId: true; defaultLocale: true };
    }): Promise<BackfillRestaurantRow[]>;
  };
  restaurantLocale: {
    findMany(args: {
      where: { restaurantId: { in: string[] } };
      select: { restaurantId: true; locale: true; isActive: true };
    }): Promise<BackfillLocaleRow[]>;
    upsert(args: {
      where: {
        restaurantId_locale: { restaurantId: string; locale: string };
      };
      create: { restaurantId: string; locale: string; isActive: true };
      update: { isActive: true };
    }): Promise<unknown>;
  };
}

/**
 * `canonical`: the persisted `defaultLocale` is EXACTLY a Platform-
 * supported value (e.g. `"en"`) -- proceeds.
 * `unsupported`: the persisted value does not normalize to any
 * Platform-supported locale at all (e.g. `"fr"`) -- aborts.
 * `nonCanonical`: the persisted value normalizes to a valid Platform
 * locale but is not itself written in that canonical form (e.g. `"EN"`
 * normalizes to `"en"`) -- this MUST also abort, never silently proceed
 * using the normalized form, because creating an active
 * `RestaurantLocale("en")` while `Restaurant.defaultLocale` itself remains
 * the non-canonical `"EN"` would not actually satisfy the invariant
 * ("every Restaurant has an active RestaurantLocale row matching its
 * defaultLocale" means matching the persisted value byte-for-byte, not a
 * normalized reading of it). Fixing non-canonical persisted data is a
 * `Restaurant.defaultLocale` correction, which this batch explicitly does
 * not perform.
 */
export type DefaultLocaleValidation =
  | { status: 'canonical' }
  | { status: 'unsupported' }
  | { status: 'nonCanonical'; normalized: PlatformSupportedLocale };

export function validateDefaultLocale(
  defaultLocale: string,
): DefaultLocaleValidation {
  const normalized = normalizePlatformLocale(defaultLocale);
  if (normalized === null) {
    return { status: 'unsupported' };
  }
  if (normalized !== defaultLocale) {
    return { status: 'nonCanonical', normalized };
  }
  return { status: 'canonical' };
}

export interface InvalidDefaultLocale {
  restaurant: BackfillRestaurantRow;
  validation: Exclude<DefaultLocaleValidation, { status: 'canonical' }>;
}

export type BackfillActionType = 'create' | 'activate' | 'noop';

export interface BackfillAction {
  type: BackfillActionType;
  restaurant: BackfillRestaurantRow;
}

export function classifyAction(
  restaurant: BackfillRestaurantRow,
  existingRow: BackfillLocaleRow | undefined,
): BackfillAction {
  if (!existingRow) {
    return { type: 'create', restaurant };
  }
  if (!existingRow.isActive) {
    return { type: 'activate', restaurant };
  }
  return { type: 'noop', restaurant };
}

export type BackfillPlan =
  | { ok: true; restaurantsScanned: number; actions: BackfillAction[] }
  | {
      ok: false;
      restaurantsScanned: number;
      invalid: InvalidDefaultLocale[];
    };

/**
 * Section 16 algorithm, steps 1-4: read every Restaurant, validate every
 * defaultLocale BEFORE any write is even planned, and -- only if every one
 * is canonical -- classify each Restaurant's RestaurantLocale row. Performs
 * no writes itself under any circumstance; `ok: false` means the caller
 * must abort with zero writes.
 */
export async function buildBackfillPlan(
  prisma: BackfillPrismaClient,
): Promise<BackfillPlan> {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, publicId: true, defaultLocale: true },
  });

  const invalid: InvalidDefaultLocale[] = [];
  for (const restaurant of restaurants) {
    const validation = validateDefaultLocale(restaurant.defaultLocale);
    if (validation.status !== 'canonical') {
      invalid.push({ restaurant, validation });
    }
  }

  if (invalid.length > 0) {
    return { ok: false, restaurantsScanned: restaurants.length, invalid };
  }

  if (restaurants.length === 0) {
    return { ok: true, restaurantsScanned: 0, actions: [] };
  }

  const existingRows = await prisma.restaurantLocale.findMany({
    where: { restaurantId: { in: restaurants.map((r) => r.id) } },
    select: { restaurantId: true, locale: true, isActive: true },
  });
  const rowByKey = new Map(
    existingRows.map((row) => [`${row.restaurantId}:${row.locale}`, row]),
  );

  const actions = restaurants.map((restaurant) =>
    classifyAction(
      restaurant,
      rowByKey.get(`${restaurant.id}:${restaurant.defaultLocale}`),
    ),
  );

  return { ok: true, restaurantsScanned: restaurants.length, actions };
}

/**
 * Section 16 step 4/13 (hardened): the actual write, applied only for
 * `create`/`activate` actions (never for `noop`). Uses an idempotent
 * `upsert` keyed on the existing `@@unique([restaurantId, locale])`
 * constraint for BOTH the missing-row and the inactive-row case -- there is
 * no separate raw `.create()` call, so there is no window where a
 * concurrent write (from a second backfill run, or a Restaurant enabling
 * its own default locale via the ordinary PUT endpoint) could collide with
 * the unique constraint. Re-running this against an already-correct plan
 * is always a same-value, safe no-op write.
 */
export async function applyBackfillPlan(
  prisma: BackfillPrismaClient,
  plan: Extract<BackfillPlan, { ok: true }>,
): Promise<void> {
  for (const action of plan.actions) {
    if (action.type === 'noop') {
      continue;
    }
    await prisma.restaurantLocale.upsert({
      where: {
        restaurantId_locale: {
          restaurantId: action.restaurant.id,
          locale: action.restaurant.defaultLocale,
        },
      },
      create: {
        restaurantId: action.restaurant.id,
        locale: action.restaurant.defaultLocale,
        isActive: true,
      },
      update: { isActive: true },
    });
  }
}

/**
 * Section 16 step 5: post-apply verification. Returns every Restaurant
 * that still lacks an active RestaurantLocale row matching its
 * defaultLocale -- an empty array means the invariant now holds for all of
 * them. The caller must treat a non-empty result as a reported FAILURE,
 * never as a partial success.
 */
export async function verifyBackfill(
  prisma: BackfillPrismaClient,
  restaurants: BackfillRestaurantRow[],
): Promise<BackfillRestaurantRow[]> {
  if (restaurants.length === 0) {
    return [];
  }
  const rows = await prisma.restaurantLocale.findMany({
    where: { restaurantId: { in: restaurants.map((r) => r.id) } },
    select: { restaurantId: true, locale: true, isActive: true },
  });
  const rowByKey = new Map(
    rows.map((row) => [`${row.restaurantId}:${row.locale}`, row]),
  );
  return restaurants.filter((restaurant) => {
    const row = rowByKey.get(`${restaurant.id}:${restaurant.defaultLocale}`);
    return !row || !row.isActive;
  });
}
