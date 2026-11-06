/**
 * Operations CLI: puts a reviewed bilingual menu (apps/api/seed-data/<seed>/menu.json) onto a Restaurant that ALREADY
 * EXISTS -- the one whose OWNER has the given e-mail -- instead of provisioning a new one. Menu, categories, products,
 * sizes, add-ons, photos, the branch address and phone, the restaurant's contact numbers and logo, the exclusive
 * design settings and, when the seed has them, announcements and delivery areas.
 *
 * SAFE BY DEFAULT: with no --apply it only READS (who the owner is, whether a menu exists) and prints the plan.
 *  - owner e-mail unknown / owns no Restaurant  -> refuses, nothing written (it never creates a Restaurant or a user);
 *  - the Restaurant already has a menu          -> refuses, nothing written, unless --replace-menu is given;
 *  - --replace-menu never deletes: the old Menus are switched off and a new primary Menu is created, so Orders and
 *    history keep working;
 *  - the owner owns several Restaurants         -> refuses and lists them; pick one with --restaurant <publicId>;
 *  - the exclusive design is assigned only when no OTHER Restaurant holds it (the Platform console moves it).
 * Every database write is one transaction; photos written to the upload folder are removed again if it fails.
 *
 * Usage (from apps/api; DATABASE_URL and UPLOAD_LOCAL_DIR must be the target's):
 *   npm run apply:restaurant-menu -- --seed el-sherbiny --owner-email elsherbiny@wayta.com
 *   npm run apply:restaurant-menu -- --seed el-sherbiny --owner-email elsherbiny@wayta.com --apply
 *   npm run apply:restaurant-menu -- --seed el-sherbiny --owner-email elsherbiny@wayta.com --apply --replace-menu
 *   npm run apply:restaurant-menu -- --seed meat-lovers --owner-email <account email> --apply
 *   npm run apply:restaurant-menu -- --seed <name> --owner-email <account email> --offers-only [--apply]
 *     (Offers / Bundles, DEC-069: ONLY the seed's "offers", for a restaurant that already has its menu. Repeatable:
 *      an offer whose name already exists is left as it is; new ones are created switched OFF unless the seed says "active": true.)
 *
 * On the server this runs in the tools image with the uploads volume mounted (OPERATIONS_RUNBOOK.md); the photos
 * are written to UPLOAD_LOCAL_DIR, the same folder the API serves at /media.
 *
 * Exit codes: 0 ok / dry-run; 1 refused (nothing written) or invalid input; 2 unexpected error.
 */
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  applyMenuToExistingRestaurant,
  applyOffersToExistingRestaurant,
  type ApplyAssets,
  type ApplyMenuPrisma,
} from '../src/provisioning/apply-menu';
import {
  menuSeedCounts,
  menuSeedProblems,
  type MenuSeed,
} from '../src/provisioning/seed-menu';
import {
  createSeedPhotoReader,
  seedPhotoNames,
} from '../src/provisioning/seed-photos';
import { ImageStorageService } from '../src/storage/image-storage.service';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const isApply = process.argv.includes('--apply');
  const replaceMenu = process.argv.includes('--replace-menu');
  const seedName = readFlag('seed') ?? '';
  const ownerEmail = (readFlag('owner-email') ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(seedName) || !ownerEmail.includes('@')) {
    console.error(
      'Required: --seed <name> (lowercase letters, digits, dashes) and --owner-email <the owner of the existing restaurant>.',
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
  const problems = menuSeedProblems(seed);
  if (problems.length > 0) {
    console.error('The seed file is not valid (nothing written):');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  // Every photo the seed names must exist and pass the same checks as a dashboard upload, before anything is written.
  const readImage = createSeedPhotoReader(
    path.resolve(__dirname, '..', 'seed-data', seedName, 'images'),
  );
  const named = seedPhotoNames(seed);
  for (const name of named) {
    try {
      await readImage(name);
    } catch {
      console.error(
        `The photo "${name}" is missing or is not a valid JPEG / PNG / WebP of at most 5 MB (nothing written).`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const uploadDir = process.env.UPLOAD_LOCAL_DIR ?? '';
  if (isApply && named.size > 0 && !uploadDir) {
    console.error(
      'UPLOAD_LOCAL_DIR is not set: the photos would not land in the folder the API serves (nothing written).',
    );
    process.exitCode = 1;
    return;
  }

  // Offers / Bundles (DEC-069): only the seed's offers, onto a Restaurant that already has its menu.
  if (process.argv.includes('--offers-only')) {
    console.log(
      `Apply the OFFERS of "${seedName}" to the restaurant of ${ownerEmail} -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}`,
    );
    const offersPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    try {
      const offerStorage = new ImageStorageService(
        new ConfigService({ UPLOAD_LOCAL_DIR: uploadDir }) as never,
      );
      const offerAssets: ApplyAssets = {
        store: async (name) => {
          const file = await readImage(name);
          return (await offerStorage.saveImage(file.buffer, file.mimetype)).assetPath;
        },
        discard: async (assetPaths) => {
          for (const assetPath of assetPaths) await offerStorage.deleteImage(assetPath);
        },
      };
      const outcome = await applyOffersToExistingRestaurant(offersPrisma as unknown as ApplyMenuPrisma, {
        seed,
        ownerEmail,
        restaurantPublicId: readFlag('restaurant'),
        apply: isApply,
        assets: offerAssets,
      });
      switch (outcome.outcome) {
        case 'noOffers':
          console.error('REFUSED: the seed has no "offers". Nothing was written.');
          process.exitCode = 1;
          return;
        case 'ownerNotFound':
          console.error(`REFUSED: no user with e-mail ${ownerEmail}. Nothing was written.`);
          process.exitCode = 1;
          return;
        case 'noRestaurant':
          console.error(`REFUSED: ${ownerEmail} is not an active OWNER of any restaurant. Nothing was written.`);
          process.exitCode = 1;
          return;
        case 'ambiguous':
          console.error(`REFUSED: ${ownerEmail} owns several restaurants. Pick one with --restaurant <publicId>:`);
          for (const restaurant of outcome.restaurants) console.error(`  - ${restaurant.publicId}  ${restaurant.name}`);
          process.exitCode = 1;
          return;
        case 'dryRun':
          console.log(
            `  Restaurant:  ${outcome.restaurant.name} (${outcome.restaurant.publicId}) -- ${outcome.offers} offer(s) in the seed (existing names are left as they are; new ones are created switched off).`,
          );
          console.log('DRY RUN complete. Nothing was written. Re-run with --apply to write.');
          return;
        case 'applied':
          console.log(`APPLIED to "${outcome.restaurant.name}" (${outcome.restaurant.publicId}).`);
          console.log(`  Created (switched off): ${outcome.created.join(' | ') || '-'}`);
          console.log(`  Already there, left alone: ${outcome.skipped.join(' | ') || '-'}`);
          console.log('  Switch them on in the dashboard (Menu > Offers).');
          return;
      }
    } finally {
      await offersPrisma.$disconnect();
    }
  }

  const counts = menuSeedCounts(seed);
  console.log(
    `Apply menu "${seedName}" to the restaurant of ${ownerEmail} -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}${replaceMenu ? ' (replace menu)' : ''}`,
  );
  console.log(
    `  Menu:        ${counts.categories} categories, ${counts.products} products, ${counts.variants} sizes, ${counts.modifierGroups} add-on groups (Arabic + English)`,
  );
  console.log(
    `  Design:      ${seed.restaurant.exclusiveDesign ? `exclusive ${seed.restaurant.exclusiveDesign.rendererKey}` : 'stock template'}`,
  );
  console.log(
    `  Branch:      ${seed.branch.address ?? '-'} / ${seed.branch.phone ?? '-'}`,
  );
  console.log(
    `  Extras:      ${(seed.announcements ?? []).length} announcement(s), ${(seed.deliveryZones ?? []).length} delivery zone(s)`,
  );
  console.log(`  Photos:      ${named.size} files from seed-data/${seedName}/images`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const storage = new ImageStorageService(
      new ConfigService({ UPLOAD_LOCAL_DIR: uploadDir }) as never,
    );
    const assets: ApplyAssets = {
      store: async (name) => {
        const file = await readImage(name);
        return (await storage.saveImage(file.buffer, file.mimetype)).assetPath;
      },
      discard: async (assetPaths) => {
        for (const assetPath of assetPaths) await storage.deleteImage(assetPath);
      },
    };
    const outcome = await applyMenuToExistingRestaurant(
      prisma as unknown as ApplyMenuPrisma,
      {
        seed,
        ownerEmail,
        restaurantPublicId: readFlag('restaurant'),
        apply: isApply,
        replaceMenu,
        assets,
      },
    );

    switch (outcome.outcome) {
      case 'ownerNotFound':
        console.error(
          `REFUSED: no user with e-mail ${ownerEmail}. Nothing was written. (This tool never creates a user or a restaurant.)`,
        );
        process.exitCode = 1;
        return;
      case 'noRestaurant':
        console.error(
          `REFUSED: ${ownerEmail} is not an active OWNER of any restaurant (or of the one given with --restaurant). Nothing was written.`,
        );
        process.exitCode = 1;
        return;
      case 'ambiguous':
        console.error(
          `REFUSED: ${ownerEmail} owns several restaurants. Pick one with --restaurant <publicId>:`,
        );
        for (const restaurant of outcome.restaurants)
          console.error(`  - ${restaurant.publicId}  ${restaurant.name}`);
        process.exitCode = 1;
        return;
      case 'menuExists':
        console.error(
          `REFUSED: "${outcome.restaurant.name}" (${outcome.restaurant.publicId}) already has a menu. Nothing was written. Add --replace-menu to switch the current menu off and put this one in its place (nothing is deleted).`,
        );
        process.exitCode = 1;
        return;
      case 'dryRun':
        console.log(
          `  Restaurant:  ${outcome.restaurant.name} (${outcome.restaurant.publicId}) -- ${outcome.existingMenus > 0 ? `has ${outcome.existingMenus} menu(s), which --replace-menu switches off` : 'has no menu yet'}`,
        );
        console.log(
          'DRY RUN complete. Nothing was written. Re-run with --apply to write.',
        );
        return;
      case 'applied': {
        const { result, restaurant } = outcome;
        console.log(`APPLIED to "${restaurant.name}" (${restaurant.publicId}).`);
        console.log(
          `  ${result.counts.categories} categories, ${result.counts.products} products, ${result.photos} photos, ${result.announcements} announcement(s), ${result.deliveryZones} delivery zone(s)${result.archivedMenus > 0 ? `, ${result.archivedMenus} previous menu(s) switched off` : ''}.`,
        );
        if (result.exclusiveDesign === 'assigned')
          console.log(
            `  Exclusive design ${seed.restaurant.exclusiveDesign?.rendererKey} assigned and published.`,
          );
        if (result.exclusiveDesign === 'rendererTaken')
          console.warn(
            '  WARNING: another Restaurant already holds this exclusive design; move it from the Platform console (Restaurants > Exclusive design).',
          );
        const qr = await prisma.qrCode.findFirst({
          where: { restaurantId: restaurant.id, type: 'GENERIC' },
          select: { publicCode: true },
        });
        const webUrl = (process.env.WEB_URL ?? '').replace(/\/+$/, '');
        if (qr)
          console.log(
            `  Guest menu URL: ${webUrl ? `${webUrl}/q/${qr.publicCode}` : `<WEB_URL>/q/${qr.publicCode}`}`,
          );
        return;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Applying the menu failed with an unexpected error:',
    error instanceof Error ? error.message : 'unknown error',
  );
  process.exitCode = 2;
});
