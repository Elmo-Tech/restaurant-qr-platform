import type { Prisma } from '../generated/prisma/client';
import {
  seedMenu,
  type MenuSeed,
  type MenuSeedResult,
  type SeedAssets,
} from './seed-menu';
import { seedOffers } from './seed-offers';

/**
 * Operations-only: puts a reviewed menu seed onto a Restaurant that ALREADY EXISTS (created from the Platform console
 * or by `provision:restaurant`) instead of provisioning a new one. The Restaurant is found from its OWNER's e-mail, so
 * the operator never types an internal id and no second Restaurant can appear.
 *
 * Safe by construction:
 * - it touches exactly one Restaurant (the one the owner e-mail resolves to) and nothing of any other tenant;
 * - a Restaurant that already has a menu is REFUSED unless the operator explicitly asks to replace it, and a replace
 *   never deletes (the old Menus are switched off, see `seedMenu`), so Orders and history stay intact;
 * - everything the database receives is one transaction; photos are written to the upload folder first and removed
 *   again if the transaction fails, so a failed run leaves neither rows nor orphan files;
 * - with `apply: false` it only reads (who owns what, is there a menu already) and reports the plan.
 */

export interface OwnedRestaurant {
  id: string;
  publicId: string;
  name: string;
}

/** The minimal Prisma shape this needs (a real PrismaClient, or a test double). */
export interface ApplyMenuPrisma {
  user: { findUnique(args: unknown): Promise<{ id: string } | null> };
  restaurantMembership: {
    findMany(args: unknown): Promise<Array<{ restaurant: OwnedRestaurant }>>;
  };
  menu: { count(args: unknown): Promise<number> };
  $transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

/** Photo storage for an apply run: `discard` removes what a failed run already wrote. */
export interface ApplyAssets extends SeedAssets {
  discard?(assetPaths: string[]): Promise<void>;
}

export type ApplyMenuOutcome =
  | { outcome: 'ownerNotFound' }
  | { outcome: 'noRestaurant' }
  | { outcome: 'ambiguous'; restaurants: OwnedRestaurant[] }
  | { outcome: 'menuExists'; restaurant: OwnedRestaurant; existingMenus: number }
  | {
      outcome: 'dryRun';
      restaurant: OwnedRestaurant;
      existingMenus: number;
      willReplace: boolean;
    }
  | {
      outcome: 'applied';
      restaurant: OwnedRestaurant;
      result: Extract<MenuSeedResult, { outcome: 'seeded' }>;
    };

export interface ApplyMenuInput {
  seed: MenuSeed;
  ownerEmail: string;
  /** Needed only when the owner owns several Restaurants (the public id printed by the dry run). */
  restaurantPublicId?: string;
  apply: boolean;
  /** Switch off the Restaurant's current menu(s) and put this one in their place. */
  replaceMenu: boolean;
  /** Required when `apply` is true and the seed has photos. */
  assets?: ApplyAssets;
}

export async function findRestaurantByOwnerEmail(
  prisma: ApplyMenuPrisma,
  ownerEmail: string,
  restaurantPublicId?: string,
): Promise<
  | { outcome: 'found'; restaurant: OwnedRestaurant }
  | Extract<ApplyMenuOutcome, { outcome: 'ownerNotFound' | 'noRestaurant' | 'ambiguous' }>
> {
  const emailNormalized = ownerEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { emailNormalized },
    select: { id: true },
  });
  if (!user) return { outcome: 'ownerNotFound' };

  const memberships = await prisma.restaurantMembership.findMany({
    where: { userId: user.id, role: 'OWNER', status: 'ACTIVE' },
    select: { restaurant: { select: { id: true, publicId: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const owned = memberships.map((membership) => membership.restaurant);
  const candidates = restaurantPublicId
    ? owned.filter((restaurant) => restaurant.publicId === restaurantPublicId)
    : owned;
  if (candidates.length === 0) return { outcome: 'noRestaurant' };
  if (candidates.length > 1)
    return { outcome: 'ambiguous', restaurants: candidates };
  return { outcome: 'found', restaurant: candidates[0] };
}

export async function applyMenuToExistingRestaurant(
  prisma: ApplyMenuPrisma,
  input: ApplyMenuInput,
): Promise<ApplyMenuOutcome> {
  const found = await findRestaurantByOwnerEmail(
    prisma,
    input.ownerEmail,
    input.restaurantPublicId,
  );
  if (found.outcome !== 'found') return found;
  const { restaurant } = found;

  const existingMenus = await prisma.menu.count({
    where: { restaurantId: restaurant.id },
  });
  if (existingMenus > 0 && !input.replaceMenu)
    return { outcome: 'menuExists', restaurant, existingMenus };
  if (!input.apply)
    return {
      outcome: 'dryRun',
      restaurant,
      existingMenus,
      willReplace: existingMenus > 0,
    };

  // Photos land on disk before the transaction commits; remember them so a failure can take them away again.
  const stored: string[] = [];
  const assets: SeedAssets | undefined = input.assets && {
    store: async (image) => {
      const assetPath = await input.assets!.store(image);
      stored.push(assetPath);
      return assetPath;
    },
  };
  try {
    const result = await prisma.$transaction(
      (tx) =>
        seedMenu(tx, restaurant.id, input.seed, assets, {
          replaceMenu: input.replaceMenu,
        }),
      { timeout: 120_000, maxWait: 10_000 },
    );
    if (result.outcome === 'alreadySeeded') {
      // Another run filled it between the check and the transaction: nothing was written.
      await input.assets?.discard?.(stored);
      return { outcome: 'menuExists', restaurant, existingMenus: 1 };
    }
    return { outcome: 'applied', restaurant, result };
  } catch (error) {
    await input.assets?.discard?.(stored).catch(() => undefined);
    throw error;
  }
}

export type ApplyOffersOutcome =
  | Extract<ApplyMenuOutcome, { outcome: 'ownerNotFound' | 'noRestaurant' | 'ambiguous' }>
  | { outcome: 'noOffers' }
  | { outcome: 'dryRun'; restaurant: OwnedRestaurant; offers: number }
  | {
      outcome: 'applied';
      restaurant: OwnedRestaurant;
      created: string[];
      skipped: string[];
    };

/**
 * Operations-only (DEC-069): applies ONLY the `offers` of a menu seed to a Restaurant that already has its menu
 * (`--offers-only`). Same owner lookup, one transaction, photos removed again on failure. Repeatable: an offer whose name
 * already exists is left untouched, and offers are created switched off unless the seed says `active: true`.
 */
export async function applyOffersToExistingRestaurant(
  prisma: ApplyMenuPrisma,
  input: {
    seed: MenuSeed;
    ownerEmail: string;
    restaurantPublicId?: string;
    apply: boolean;
    assets?: ApplyAssets;
  },
): Promise<ApplyOffersOutcome> {
  if (!input.seed.offers || input.seed.offers.length === 0) return { outcome: 'noOffers' };
  const found = await findRestaurantByOwnerEmail(prisma, input.ownerEmail, input.restaurantPublicId);
  if (found.outcome !== 'found') return found;
  const { restaurant } = found;
  if (!input.apply) {
    return { outcome: 'dryRun', restaurant, offers: input.seed.offers.length };
  }
  const stored: string[] = [];
  const photo = async (image: string | undefined): Promise<string | null> => {
    if (!image) return null;
    if (!input.assets) throw new Error('The seed has photos but no photo store was provided.');
    const assetPath = await input.assets.store(image);
    stored.push(assetPath);
    return assetPath;
  };
  try {
    const result = await prisma.$transaction(
      (tx) =>
        seedOffers(tx, restaurant.id, input.seed.restaurant.defaultLocale, input.seed.offers, photo),
      { timeout: 60_000, maxWait: 10_000 },
    );
    // Photos of offers that were skipped (already there) are not needed.
    if (result.created.length === 0) await input.assets?.discard?.(stored);
    return { outcome: 'applied', restaurant, ...result };
  } catch (error) {
    await input.assets?.discard?.(stored).catch(() => undefined);
    throw error;
  }
}
