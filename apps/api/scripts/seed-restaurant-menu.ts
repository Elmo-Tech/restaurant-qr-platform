/**
 * Operations CLI: provisions ONE Restaurant (like provision-restaurant.ts) and fills its bilingual menu from a reviewed
 * seed file in `apps/api/seed-data/<seed>/menu.json`: Menu, Categories, Products with their Arabic and English names,
 * sizes (Product Variants), add-ons (Modifier Groups) and, when the file asks for it, the Restaurant's exclusive VERDE
 * design. Onboarding content for a real restaurant, not QA data.
 *
 * SAFE BY DEFAULT: with no --apply it only validates the seed and prints the plan (zero writes). The owner password is
 * read ONLY from PROVISION_OWNER_PASSWORD (never a command-line argument) and is never printed. Safe to re-run: an
 * already provisioned Restaurant that already has a menu is left untouched.
 *
 * Usage (from apps/api):
 *   PowerShell:  $env:PROVISION_OWNER_PASSWORD = '<a strong password>'
 *   npm run seed:restaurant-menu -- --seed verde-napoletana --owner-email owner@example.com
 *   npm run seed:restaurant-menu -- --seed verde-napoletana --owner-email owner@example.com --apply
 *
 * Exit codes: 0 ok / dry-run / nothing to do; 1 invalid input or an identity conflict (nothing written); 2 unexpected error.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  provisionRestaurant,
  validateProvisionInput,
  type ProvisioningPrisma,
} from '../src/provisioning/provision-restaurant';
import {
  menuSeedCounts,
  menuSeedProblems,
  seedMenu,
  type MenuSeed,
} from '../src/provisioning/seed-menu';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function readFlag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function main(): Promise<void> {
  const isApply = process.argv.includes('--apply');
  const seedName = readFlag('seed', 'verde-napoletana') as string;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(seedName)) {
    console.error(
      'Invalid --seed name (lowercase letters, digits and dashes only).',
    );
    process.exitCode = 1;
    return;
  }

  let seed: MenuSeed;
  try {
    seed = JSON.parse(
      await readFile(
        path.resolve(__dirname, '..', 'seed-data', seedName, 'menu.json'),
        'utf8',
      ),
    ) as MenuSeed;
  } catch {
    console.error(
      `Seed "${seedName}" was not found (apps/api/seed-data/${seedName}/menu.json).`,
    );
    process.exitCode = 1;
    return;
  }
  const seedProblems = menuSeedProblems(seed);
  if (seedProblems.length > 0) {
    console.error('The seed file is not valid (nothing written):');
    for (const problem of seedProblems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const input = {
    restaurantName: seed.restaurant.name,
    ownerEmail: readFlag('owner-email') ?? '',
    branchName: seed.branch.names.ar,
    defaultLocale: seed.restaurant.defaultLocale,
    currencyCode: seed.restaurant.currencyCode,
    timezone: seed.restaurant.timezone,
    ownerPassword: process.env.PROVISION_OWNER_PASSWORD ?? '',
  };
  const validation = validateProvisionInput(input);
  if (!validation.ok) {
    console.error('Invalid input (nothing written):');
    for (const problem of validation.problems) console.error(`  - ${problem}`);
    console.error(
      'Required: --owner-email and the PROVISION_OWNER_PASSWORD environment variable.',
    );
    process.exitCode = 1;
    return;
  }

  const counts = menuSeedCounts(seed);
  console.log(
    `Menu seed "${seedName}" -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}`,
  );
  console.log(
    `  Restaurant:  ${validation.value.restaurantName} (${validation.value.currencyCode}, default ${validation.value.defaultLocale})`,
  );
  console.log(`  Owner:       ${validation.value.ownerEmail}`);
  console.log(
    `  Menu:        ${counts.categories} categories, ${counts.products} products, ${counts.variants} sizes, ${counts.modifierGroups} add-on groups (Arabic + English)`,
  );
  console.log(
    `  Design:      ${seed.restaurant.exclusiveDesign ? `exclusive ${seed.restaurant.exclusiveDesign.rendererKey}` : 'stock template'}`,
  );
  if (!isApply) {
    console.log(
      'DRY RUN complete. Nothing was written. Re-run with --apply to provision and seed.',
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const provisioned = await provisionRestaurant(
      prisma as unknown as ProvisioningPrisma,
      new PasswordHasherService(),
      input,
    );
    if (provisioned.outcome === 'invalidInput') {
      console.error('Invalid input (nothing written):');
      for (const problem of provisioned.problems)
        console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }
    if (provisioned.outcome === 'conflict') {
      console.error(
        `CONFLICT: a user with e-mail ${validation.value.ownerEmail} already exists and does not own a Restaurant named "${validation.value.restaurantName}". Nothing was written. Use a different owner e-mail.`,
      );
      process.exitCode = 1;
      return;
    }
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { publicId: provisioned.restaurantPublicId },
      select: { id: true },
    });
    console.log(
      provisioned.outcome === 'provisioned'
        ? `PROVISIONED ${provisioned.restaurantPublicId}.`
        : `Already provisioned: ${provisioned.restaurantPublicId}.`,
    );

    const seeded = await prisma.$transaction(
      (tx) => seedMenu(tx, restaurant.id, seed),
      {
        timeout: 120_000,
        maxWait: 10_000,
      },
    );
    if (seeded.outcome === 'alreadySeeded') {
      console.log('The Restaurant already has a menu. Nothing was changed.');
    } else {
      console.log(
        `SEEDED ${seeded.counts.categories} categories, ${seeded.counts.products} products.`,
      );
      if (seeded.exclusiveDesign === 'assigned')
        console.log('  Exclusive design VERDE assigned and published.');
      if (seeded.exclusiveDesign === 'rendererTaken') {
        console.warn(
          '  WARNING: another Restaurant already holds the VERDE design, so this one keeps a stock template.',
        );
        console.warn(
          '  Move it from the Platform console (Restaurants > Exclusive design) if this Restaurant should have it.',
        );
      }
    }

    const qr = await prisma.qrCode.findFirst({
      where: { restaurantId: restaurant.id, type: 'GENERIC' },
      select: { publicCode: true },
    });
    const webUrl = (process.env.WEB_URL ?? '').replace(/\/+$/, '');
    if (qr)
      console.log(
        `  Guest menu URL: ${webUrl ? `${webUrl}/q/${qr.publicCode}` : `<WEB_URL>/q/${qr.publicCode}`}`,
      );
    console.log(`  Owner login e-mail: ${validation.value.ownerEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Never print the input (it contains the password) -- only the error itself.
  console.error(
    'Menu seeding failed with an unexpected error:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 2;
});
