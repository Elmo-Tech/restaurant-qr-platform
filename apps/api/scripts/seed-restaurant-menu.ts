/**
 * Operations CLI: provisions ONE Restaurant (like provision-restaurant.ts) and fills its bilingual menu from a reviewed
 * seed file in `apps/api/seed-data/<seed>/menu.json`: Menu, Categories, Products with their Arabic and English names,
 * sizes (Product Variants), add-ons and required choices (Modifier Groups), the Branch address and phone, contact numbers,
 * the logo and the photos in `<seed>/images/` (stored through the same validator and storage the dashboard upload uses)
 * and, when the file asks for it, the Restaurant's exclusive design (VERDE or El Sherbiny). Onboarding content for a real
 * restaurant, not QA data.
 *
 * SAFE BY DEFAULT: with no --apply it only validates the seed and prints the plan (zero writes). The owner password is
 * read ONLY from PROVISION_OWNER_PASSWORD (never a command-line argument) and is never printed. Safe to re-run: an
 * already provisioned Restaurant that already has a menu is left untouched.
 *
 * Usage (from apps/api):
 *   PowerShell:  $env:PROVISION_OWNER_PASSWORD = '<a strong password>'
 *   npm run seed:restaurant-menu -- --seed verde-napoletana --owner-email owner@example.com
 *   npm run seed:restaurant-menu -- --seed verde-napoletana --owner-email owner@example.com --apply
 *   npm run seed:restaurant-menu -- --seed el-sherbiny --owner-email owner@example.com --apply
 *
 * Photos are written under UPLOAD_LOCAL_DIR (the folder the API serves at /media), so on a server run it with the
 * API's own UPLOAD_LOCAL_DIR; without --apply nothing is read into storage, only checked.
 *
 * Exit codes: 0 ok / dry-run / nothing to do; 1 invalid input or an identity conflict (nothing written); 2 unexpected error.
 */
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
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
import { createSeedPhotoReader, seedPhotoNames } from '../src/provisioning/seed-photos';
import { ImageStorageService } from '../src/storage/image-storage.service';
import {
  menuSeedCounts,
  menuSeedProblems,
  seedMenu,
  type MenuSeed,
  type SeedAssets,
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

  // Every photo the seed names must exist and pass the same checks as a dashboard upload, before anything is written.
  const imagesDir = path.resolve(__dirname, '..', 'seed-data', seedName, 'images');
  const readImage = createSeedPhotoReader(imagesDir);
  const named = seedPhotoNames(seed);
  for (const name of named) {
    try {
      await readImage(name);
    } catch {
      console.error(`The photo "${name}" is missing or is not a valid JPEG / PNG / WebP of at most 5 MB (nothing written).`);
      process.exitCode = 1;
      return;
    }
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
  console.log(`  Photos:      ${named.size} files from seed-data/${seedName}/images`);
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

    const storage = new ImageStorageService(
      new ConfigService({ UPLOAD_LOCAL_DIR: process.env.UPLOAD_LOCAL_DIR ?? '' }) as never,
    );
    const assets: SeedAssets = {
      store: async (name) => {
        const file = await readImage(name);
        return (await storage.saveImage(file.buffer, file.mimetype)).assetPath;
      },
    };
    const seeded = await prisma.$transaction(
      (tx) => seedMenu(tx, restaurant.id, seed, assets),
      {
        timeout: 120_000,
        maxWait: 10_000,
      },
    );
    if (seeded.outcome === 'alreadySeeded') {
      console.log('The Restaurant already has a menu. Nothing was changed.');
    } else {
      console.log(
        `SEEDED ${seeded.counts.categories} categories, ${seeded.counts.products} products, ${seeded.photos} photos.`,
      );
      if (seeded.exclusiveDesign === 'assigned')
        console.log(
          `  Exclusive design ${seed.restaurant.exclusiveDesign?.rendererKey} assigned and published.`,
        );
      if (seeded.exclusiveDesign === 'rendererTaken') {
        console.warn(
          '  WARNING: another Restaurant already holds this exclusive design, so this one keeps a stock template.',
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
