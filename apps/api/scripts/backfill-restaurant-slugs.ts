/**
 * DEC-066: gives EVERY Restaurant its readable Guest Menu link (`/q/{restaurant-name}`).
 * Idempotent and repeatable: a Restaurant that already has a slug is never touched, so running it
 * again changes nothing. (The API runs the same backfill by itself at start-up; this script is for
 * checking it by hand first or re-running it.)
 *
 * Safe by default: with no flags it is a DRY RUN that writes nothing and prints what would happen.
 * Pass --apply to write.
 *
 * Usage (from apps/api, PowerShell):
 *   npm run backfill:restaurant-slugs
 *   npm run backfill:restaurant-slugs -- --apply
 *
 * Exit codes: 0 ok; 2 unexpected error.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { backfillRestaurantSlugs } from '../src/restaurants/restaurant-slug-store';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const summary = await backfillRestaurantSlugs(prisma, { dryRun: !apply });
    console.log(
      apply ? 'APPLIED.' : 'DRY RUN (nothing written; pass --apply to write).',
    );
    console.log(
      `  Restaurants that already had a link: ${summary.alreadyHadSlug}`,
    );
    console.log(
      `  Restaurants ${apply ? 'given' : 'that would be given'} a link: ${summary.assigned.length}`,
    );
    for (const row of summary.assigned) {
      console.log(`    /q/${row.slug}    <-  ${row.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
