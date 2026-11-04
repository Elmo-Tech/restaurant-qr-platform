import { Prisma } from '../generated/prisma/client';
import type { PrismaClient } from '../generated/prisma/client';
import {
  allocateRestaurantSlug,
  slugProblem,
  type SlugProblem,
} from './restaurant-slug';

/** Writes for the readable Guest Menu link (DEC-066). Plain functions over Prisma so the CLI script and the API share them. */
export type SlugStoreDb = Pick<
  PrismaClient,
  '$transaction' | 'restaurant' | 'restaurantSlug'
>;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export interface BackfilledSlug {
  restaurantId: string;
  name: string;
  slug: string;
}

export interface BackfillSummary {
  /** Restaurants that had no slug and got one (or would get one in a dry run). */
  assigned: BackfilledSlug[];
  /** Restaurants that already had a slug. */
  alreadyHadSlug: number;
}

/**
 * Gives EVERY Restaurant without a slug its readable link. Idempotent and repeatable: a Restaurant
 * that already has a slug (current or former) is never touched, so running it twice changes nothing.
 * Oldest Restaurants first, so the oldest of two same-named Restaurants keeps the plain name.
 */
export async function backfillRestaurantSlugs(
  db: SlugStoreDb,
  options: { dryRun?: boolean } = {},
): Promise<BackfillSummary> {
  const missing = await db.restaurant.findMany({
    where: { slugs: { none: {} } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });
  const total = await db.restaurant.count();
  const planned = new Set<string>(); // a dry run writes nothing, so it remembers its own picks
  const assigned: BackfilledSlug[] = [];

  for (const restaurant of missing) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const slug = await db.$transaction(async (tx) => {
          const chosen = await allocateRestaurantSlug(
            tx,
            restaurant.name,
            planned,
          );
          if (!options.dryRun) {
            await tx.restaurantSlug.create({
              data: {
                slug: chosen,
                restaurantId: restaurant.id,
                isCurrent: true,
              },
            });
          }
          return chosen;
        });
        planned.add(slug);
        assigned.push({
          restaurantId: restaurant.id,
          name: restaurant.name,
          slug,
        });
        break;
      } catch (error) {
        // Lost a race for the same slug to a concurrent run: pick again.
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }
  }
  return { assigned, alreadyHadSlug: total - missing.length };
}

/** The Restaurant's current slug, giving it one first if it has none (for tools that print the link). */
export async function ensureRestaurantSlug(
  db: SlugStoreDb,
  restaurantId: string,
): Promise<string | null> {
  const current = await db.restaurantSlug.findFirst({
    where: { restaurantId, isCurrent: true },
    select: { slug: true },
  });
  if (current) return current.slug;
  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });
  if (!restaurant) return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const slug = await allocateRestaurantSlug(tx, restaurant.name);
        await tx.restaurantSlug.create({
          data: { slug, restaurantId, isCurrent: true },
        });
        return slug;
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  return null;
}

export type ChangeSlugResult =
  | { outcome: 'updated'; slug: string; previousSlug: string | null }
  | { outcome: 'unchanged'; slug: string }
  | { outcome: 'invalid'; problem: SlugProblem }
  | { outcome: 'taken' }
  | { outcome: 'notFound' };

/**
 * The Platform team's edit of a Restaurant's link. The previous slug is kept (as a former slug) so
 * every link already shared keeps opening the menu. A Restaurant may go back to one of its own former slugs;
 * another Restaurant's slug, current or former, is never available.
 */
export async function changeRestaurantSlug(
  db: SlugStoreDb,
  restaurantId: string,
  requested: string,
): Promise<ChangeSlugResult> {
  const slug = requested.trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem) return { outcome: 'invalid', problem };

  try {
    return await db.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true },
      });
      if (!restaurant) return { outcome: 'notFound' as const };

      const existing = await tx.restaurantSlug.findUnique({
        where: { slug },
        select: { id: true, restaurantId: true, isCurrent: true },
      });
      if (existing && existing.restaurantId !== restaurantId)
        return { outcome: 'taken' as const };
      if (existing?.isCurrent) return { outcome: 'unchanged' as const, slug };

      const current = await tx.restaurantSlug.findFirst({
        where: { restaurantId, isCurrent: true },
        select: { id: true, slug: true },
      });
      // Demote first: the "one current slug per Restaurant" index would refuse two at once.
      if (current) {
        await tx.restaurantSlug.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      }
      if (existing) {
        await tx.restaurantSlug.update({
          where: { id: existing.id },
          data: { isCurrent: true },
        });
      } else {
        await tx.restaurantSlug.create({
          data: { slug, restaurantId, isCurrent: true },
        });
      }
      return {
        outcome: 'updated' as const,
        slug,
        previousSlug: current?.slug ?? null,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: 'taken' };
    throw error;
  }
}
