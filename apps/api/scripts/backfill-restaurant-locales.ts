/**
 * LOC-2A, approved LOC-1 contract (Section 15/16/17), hardened per code
 * review corrections: standalone, idempotent backfill for the invariant
 * "every Restaurant has an active RestaurantLocale row matching its
 * Restaurant.defaultLocale" -- required because the invariant did not
 * exist before this feature. NOT wired into any NestJS module, NOT run
 * automatically, and never invoked from application request paths.
 *
 * Safe by default: running with no flags performs a DRY RUN only (zero
 * writes). Pass --apply to perform the actual writes.
 *
 * Usage (from apps/api):
 *   node -r ts-node/register -r ./scripts/nodenext-require-shim.js scripts/backfill-restaurant-locales.ts
 *   node -r ts-node/register -r ./scripts/nodenext-require-shim.js scripts/backfill-restaurant-locales.ts --apply
 *
 * The `nodenext-require-shim.js` require is needed only because the
 * generated Prisma Client uses `nodenext`-style relative `.js` import
 * specifiers that assume a real build step (see that file's own comment
 * for the full explanation) -- it changes no application behavior.
 *
 * This file is a THIN CLI WRAPPER ONLY: argv parsing, dotenv, the real
 * PrismaClient + PrismaPg construction (bypassing Nest DI entirely, since a
 * standalone script has no ConfigService/DI container to run inside),
 * console reporting, and process exit codes. All planning/execution logic
 * -- including the canonical-locale validation and the race-safe upsert --
 * lives in ../src/restaurants/restaurant-locales-backfill.ts, which is
 * unit-tested (restaurant-locales-backfill.spec.ts) against a mock
 * Prisma-shaped object, entirely without touching a real database. Uses
 * only existing devDependencies (ts-node) and existing dependencies
 * (dotenv, @prisma/adapter-pg) -- no new dependency added.
 *
 * Algorithm (Section 16), enforced in this exact order by
 * buildBackfillPlan/applyBackfillPlan/verifyBackfill:
 *   1. Read every Restaurant (id, publicId, defaultLocale).
 *   2. Validate every defaultLocale is CANONICAL -- both "does it
 *      normalize to a Platform-supported locale at all" (unsupported if
 *      not, e.g. "fr") AND "is the persisted value already written in
 *      that exact canonical form" (nonCanonical if not, e.g. "EN" which
 *      normalizes to "en" but is not itself "en" -- this is also treated
 *      as invalid, never silently normalized, because creating
 *      RestaurantLocale("en") while Restaurant.defaultLocale remains "EN"
 *      would not actually satisfy the invariant).
 *   3. If ANY Restaurant fails that validation: report every offender
 *      (with its specific reason), exit non-zero, and perform ZERO writes
 *      -- validation over ALL Restaurants completes before the
 *      classification/write step ever runs.
 *   4. Otherwise, for each Restaurant, ensure an active RestaurantLocale
 *      row for (restaurantId, defaultLocale) via an idempotent `upsert`
 *      keyed on the existing `@@unique([restaurantId, locale])`
 *      constraint -- never a raw `.create()` -- for BOTH the
 *      missing-row and the inactive-row case:
 *        - missing row       -> would create / create (via upsert)
 *        - existing, active  -> already correct, unchanged
 *        - existing, inactive-> would activate / activate (via upsert)
 *   5. In --apply mode, after all writes, re-read every Restaurant and
 *      verify it now has exactly one matching active RestaurantLocale row
 *      -- if not, exit non-zero without claiming success.
 *
 * Re-running --apply is always safe: every write is the same idempotent
 * upsert, so it can never collide with the `@@unique([restaurantId,
 * locale])` constraint, whether re-run by an operator or raced by a
 * Restaurant enabling its own default locale via the ordinary PUT
 * endpoint at the same time.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  applyBackfillPlan,
  buildBackfillPlan,
  verifyBackfill,
  type BackfillPrismaClient,
} from '../src/restaurants/restaurant-locales-backfill';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const isApply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }
  const realPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  // Narrowed to the minimal shape the planning/execution logic needs --
  // see restaurant-locales-backfill.ts for why this is a separate,
  // deliberately small interface rather than the full generated client.
  const prisma = realPrisma as unknown as BackfillPrismaClient;

  try {
    console.log(
      `Restaurant Locale backfill -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}`,
    );

    const plan = await buildBackfillPlan(prisma);

    if (!plan.ok) {
      console.error(
        `ABORTING: ${plan.invalid.length} Restaurant(s) have an unsupported or non-canonical defaultLocale. Zero writes performed.`,
      );
      for (const { restaurant, validation } of plan.invalid) {
        if (validation.status === 'unsupported') {
          console.error(
            `  - Restaurant ${restaurant.publicId} (${restaurant.id}): unsupported defaultLocale=${JSON.stringify(restaurant.defaultLocale)}`,
          );
        } else {
          console.error(
            `  - Restaurant ${restaurant.publicId} (${restaurant.id}): non-canonical defaultLocale=${JSON.stringify(restaurant.defaultLocale)} (normalizes to ${JSON.stringify(validation.normalized)}, but the persisted value itself is not written in canonical form -- this batch does not mutate Restaurant.defaultLocale)`,
          );
        }
      }
      process.exitCode = 1;
      return;
    }

    console.log(`Restaurants scanned: ${plan.restaurantsScanned}`);
    console.log('All Restaurant.defaultLocale values are canonical and Platform-supported.');

    const missing = plan.actions.filter((action) => action.type === 'create');
    const inactive = plan.actions.filter(
      (action) => action.type === 'activate',
    );
    const alreadyCorrect = plan.actions.filter(
      (action) => action.type === 'noop',
    );

    for (const action of missing) {
      console.log(
        `${isApply ? 'CREATE' : 'WOULD CREATE'} active RestaurantLocale for ${action.restaurant.publicId} (${action.restaurant.id}), locale=${action.restaurant.defaultLocale}`,
      );
    }
    for (const action of inactive) {
      console.log(
        `${isApply ? 'ACTIVATE' : 'WOULD ACTIVATE'} existing inactive RestaurantLocale for ${action.restaurant.publicId} (${action.restaurant.id}), locale=${action.restaurant.defaultLocale}`,
      );
    }

    console.log('--- Summary ---');
    console.log(`Restaurants scanned:       ${plan.restaurantsScanned}`);
    console.log(`Missing rows:              ${missing.length}`);
    console.log(`Inactive rows:             ${inactive.length}`);
    console.log(`Already correct:           ${alreadyCorrect.length}`);
    console.log(`Unsupported/non-canonical: 0`);

    if (!isApply) {
      console.log('DRY RUN complete. Zero writes were performed.');
      return;
    }

    await applyBackfillPlan(prisma, plan);

    const stillBroken = await verifyBackfill(
      prisma,
      plan.actions.map((action) => action.restaurant),
    );

    if (stillBroken.length > 0) {
      console.error(
        `VERIFICATION FAILED: ${stillBroken.length} Restaurant(s) still lack an active RestaurantLocale for their defaultLocale.`,
      );
      for (const restaurant of stillBroken) {
        console.error(
          `  - Restaurant ${restaurant.publicId} (${restaurant.id})`,
        );
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      'APPLY complete. Every Restaurant now has exactly one active RestaurantLocale row matching its defaultLocale.',
    );
  } finally {
    await realPrisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Backfill failed with an unexpected error:', error);
  process.exitCode = 1;
});
