/**
 * Platform-only batch import of individually approved CC0 food photography.
 *
 * From apps/api (Node 24 tools image, never the API runtime image):
 *   npm run import:food-images -- --manifest /path/to/reviewed.json
 *   npm run import:food-images -- --manifest /path/to/reviewed.json --inspect
 *   npm run import:food-images -- --manifest /path/to/reviewed.json --apply
 *
 * Default: offline DRY RUN, no database access or network calls.
 * --inspect: downloads and processes images but never writes to the database.
 * --apply: requires a human-approved source SHA pin, creates DRAFT only,
 * uses existing FoodLibraryService upload / bulkApply and records Platform Audit.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/database/prisma.service';
import { ImageStorageService } from '../src/storage/image-storage.service';
import { FoodLibraryService } from '../src/platform/food-library/food-library.service';
import { PlatformAuditService } from '../src/platform/platform-audit.service';
import {
  assertApprovedForImport,
  downloadApprovedPhoto,
  parseFoodImageImportManifest,
  prepareFoodImage,
} from '../src/platform/food-library/food-image-import-helpers';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function argumentsFromCommandLine(): {
  manifest: string;
  inspect: boolean;
  apply: boolean;
} {
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  const inspect = args.includes('--inspect');
  const apply = args.includes('--apply');
  if (
    manifestIndex < 0 ||
    !args[manifestIndex + 1] ||
    (inspect && apply) ||
    args.filter((a) => a === '--manifest').length !== 1 ||
    args.some(
      (a, index) =>
        !['--manifest', '--inspect', '--apply'].includes(a) &&
        index !== manifestIndex + 1,
    )
  ) {
    throw new Error(
      'Usage: npm run import:food-images -- --manifest <approved.json> [--inspect | --apply]',
    );
  }
  return {
    manifest: path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      args[manifestIndex + 1],
    ),
    inspect,
    apply,
  };
}

async function main(): Promise<void> {
  const flags = argumentsFromCommandLine();
  const raw = await readFile(flags.manifest, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024)
    throw new Error('Manifest exceeds 1 MB.');
  const manifest = parseFoodImageImportManifest(JSON.parse(raw) as unknown);
  const mode = flags.apply ? 'APPLY' : flags.inspect ? 'INSPECT' : 'DRY RUN';
  console.log(
    'Food image import: ' +
      manifest.images.length +
      ' candidates; mode=' +
      mode,
  );

  if (!flags.inspect && !flags.apply) {
    for (const item of manifest.images) {
      console.log(
        'PLAN ' +
          item.id +
          ': ' +
          item.name +
          ' [' +
          item.tagCodes.join(', ') +
          '] ' +
          (item.approved ? 'approved' : 'NEEDS REVIEW'),
      );
    }
    console.log('DRY RUN: no network, image storage or database accessed.');
    return;
  }

  if (flags.apply) assertApprovedForImport(manifest);
  if (flags.inspect) {
    let failures = 0;
    for (const item of manifest.images) {
      try {
        const source = await downloadApprovedPhoto(item.sourceUrl);
        const prepared = await prepareFoodImage(source, item.expectedSha256);
        console.log(
          JSON.stringify({
            id: item.id,
            sourceSha256: prepared.sourceSha256,
            optimizedSha256: prepared.outputSha256,
            optimizedBytes: prepared.buffer.length,
            width: prepared.width,
            height: prepared.height,
            // This is a candidate inspection, NOT proof of licensed rights or correct food tags.
            sourcePageUrl: item.sourcePageUrl,
          }),
        );
      } catch (error: unknown) {
        failures++;
        console.error(
          'FAILED ' +
            item.id +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    if (failures) process.exitCode = 1;
    else
      console.log(
        'INSPECT complete. Check the actual images and source licenses, pin sourceSha256, then approve.',
      );
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.UPLOAD_LOCAL_DIR) {
    throw new Error(
      'APPLY requires DATABASE_URL and persistent UPLOAD_LOCAL_DIR.',
    );
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const allCodes = [
      ...new Set(manifest.images.flatMap((item) => item.tagCodes)),
    ];
    const tags = await prisma.foodTag.findMany({
      where: { code: { in: allCodes } },
      select: { id: true, code: true },
    });
    const idsByCode = new Map(tags.map((tag) => [tag.code, tag.id]));
    const missing = allCodes.filter((code) => !idsByCode.has(code));
    if (missing.length)
      throw new Error(
        'Import blocked: missing canonical Food Tags: ' +
          missing.join(', ') +
          '. Apply seed:food-tags separately after verifying database backups.',
      );

    const services = prisma as unknown as PrismaService;
    const storage = new ImageStorageService(
      new ConfigService({
        UPLOAD_LOCAL_DIR: process.env.UPLOAD_LOCAL_DIR,
      }) as never,
    );
    const library = new FoodLibraryService(services, storage);
    const audit = new PlatformAuditService(services);
    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of manifest.images) {
      try {
        const source = await downloadApprovedPhoto(item.sourceUrl);
        const prepared = await prepareFoodImage(source, item.expectedSha256);
        const existing = await prisma.foodImageAsset.findUnique({
          where: { sha256: prepared.outputSha256 },
          select: { id: true, status: true },
        });
        if (existing) {
          skipped++;
          console.log(
            'SKIPPED duplicate photo: ' +
              item.id +
              ' (existing image ' +
              existing.id +
              ')',
          );
          continue;
        }

        const result = await library.upload({
          originalname: item.name + '.webp',
          mimetype: 'image/webp',
          size: prepared.buffer.length,
          buffer: prepared.buffer,
        });
        // Import metadata is a proposal, not human Platform Admin review.
        // bulkApply sets DRAFT and clears reviewedAt; publication remains gated.
        await library.bulkApply({
          ids: [result.image.id],
          presentation: item.presentation,
          sectors: item.sectors,
          addTagIds: item.tagCodes.map((code) => idsByCode.get(code)!),
        });
        await audit.record({
          admin: null,
          actorEmail: 'food-image-batch-import',
          action: 'platform.food_image_imported',
          details: {
            imageId: result.image.id,
            importId: item.id,
            sourcePageUrl: item.sourcePageUrl,
            licenseProofUrl: item.licenseProofUrl,
            license: item.license,
            licenseReviewedAt: item.licenseReviewedAt,
            originalSha256: prepared.sourceSha256,
            optimizedSha256: prepared.outputSha256,
            tagCodes: item.tagCodes,
            sectors: item.sectors,
            presentation: item.presentation,
            status: 'DRAFT',
          },
        });
        uploaded++;
        console.log(
          'DRAFT ' +
            item.id +
            ': ' +
            result.image.id +
            ', ' +
            Math.round(prepared.buffer.length / 1024) +
            ' KiB, ' +
            item.tagCodes.join(', '),
        );
      } catch (error: unknown) {
        failed++;
        console.error(
          'FAILED ' +
            item.id +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        );
        // Any partial upload remains DRAFT and must be inspected by the Platform Admin.
        // Never auto-publish or delete existing assets to try to repair failures.
      }
    }
    console.log(
      'IMPORT RESULT: uploaded=' +
        uploaded +
        ', duplicates=' +
        skipped +
        ', failed=' +
        failed +
        '. All new assets remain DRAFT.',
    );
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
