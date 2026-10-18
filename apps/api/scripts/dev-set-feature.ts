/**
 * LOCAL DEV / QA ONLY -- allows or removes a platform feature (DEC-043) for one Restaurant, so the
 * gated behaviour can be tried before the platform control dashboard exists. It is NOT part of the
 * product and refuses to run when NODE_ENV=production.
 *
 * SAFE BY DEFAULT: with no --apply it only prints what it WOULD do (zero writes).
 *
 * Usage (from apps/api, PowerShell):
 *   npm run dev:set-feature -- --restaurant-name "elmo cafe" --list
 *   npm run dev:set-feature -- --restaurant-name "elmo cafe" --feature WHATSAPP_ORDERING --off
 *   npm run dev:set-feature -- --restaurant-name "elmo cafe" --feature WHATSAPP_ORDERING --off --apply
 *   npm run dev:set-feature -- --restaurant-name "elmo cafe" --feature WHATSAPP_ORDERING --reset --apply
 * Or select the restaurant with --restaurant-public-id <publicId>. `--on` stores an explicit allow,
 * `--off` an explicit deny, `--reset` removes the override (back to the default, every feature).
 *
 * Exit codes: 0 ok / dry-run; 1 invalid input; 2 unexpected error.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DEFAULT_ENTITLEMENT,
  FEATURE_KEYS,
  resolveFeatures,
  type FeatureKey,
} from '../src/entitlements/features';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to run: NODE_ENV=production. This is a local development tool.',
    );
    process.exitCode = 1;
    return;
  }

  const restaurantPublicId = readFlag('restaurant-public-id');
  const restaurantName = readFlag('restaurant-name');
  if (!restaurantPublicId && !restaurantName) {
    console.error(
      'Required: one of --restaurant-public-id <id> | --restaurant-name <name>.',
    );
    process.exitCode = 1;
    return;
  }
  const isApply = process.argv.includes('--apply');
  const isList = process.argv.includes('--list');
  const feature = readFlag('feature');
  const action = process.argv.includes('--on')
    ? 'on'
    : process.argv.includes('--off')
      ? 'off'
      : process.argv.includes('--reset')
        ? 'reset'
        : null;

  if (!isList) {
    if (
      !feature ||
      !(FEATURE_KEYS as readonly string[]).includes(feature) ||
      !action
    ) {
      console.error(
        `Required: --list, or --feature <${FEATURE_KEYS.join(' | ')}> with one of --on | --off | --reset.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const restaurants = await prisma.restaurant.findMany({
      where: restaurantPublicId
        ? { publicId: restaurantPublicId }
        : { name: { equals: restaurantName, mode: 'insensitive' } },
      select: { id: true, publicId: true, name: true },
    });
    if (restaurants.length !== 1) {
      console.error(
        restaurants.length === 0
          ? 'No restaurant matches. Nothing was changed.'
          : `${restaurants.length} restaurants match -- use --restaurant-public-id to pick one. Nothing was changed.`,
      );
      process.exitCode = 1;
      return;
    }
    const restaurant = restaurants[0];
    console.log(`Restaurant: ${restaurant.name} (${restaurant.publicId})`);
    console.log(
      `Default for a feature without an override: ${DEFAULT_ENTITLEMENT ? 'allowed' : 'not allowed'}`,
    );

    if (!isList && feature && action) {
      const key = feature as FeatureKey;
      console.log(
        `${isApply ? 'APPLY' : 'DRY RUN'}: ${key} -> ${action === 'reset' ? 'remove the override' : action === 'on' ? 'allowed' : 'NOT allowed'}`,
      );
      if (isApply) {
        if (action === 'reset') {
          await prisma.restaurantFeature.deleteMany({
            where: { restaurantId: restaurant.id, feature: key },
          });
        } else {
          await prisma.restaurantFeature.upsert({
            where: {
              restaurantId_feature: {
                restaurantId: restaurant.id,
                feature: key,
              },
            },
            create: {
              restaurantId: restaurant.id,
              feature: key,
              enabled: action === 'on',
            },
            update: { enabled: action === 'on' },
          });
        }
      }
    }

    const overrides = await prisma.restaurantFeature.findMany({
      where: { restaurantId: restaurant.id },
      select: { feature: true, enabled: true },
    });
    const features = resolveFeatures(overrides);
    console.log('Features now:');
    for (const key of FEATURE_KEYS) {
      const hasOverride = overrides.some((row) => row.feature === key);
      console.log(
        `  ${key.padEnd(20)} ${features[key] ? 'allowed' : 'NOT allowed'}${hasOverride ? '  (override)' : ''}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 2;
});
