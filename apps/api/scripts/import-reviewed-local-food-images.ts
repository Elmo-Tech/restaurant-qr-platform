/**
 * STAGING-ONLY, operator-driven import of individually human-approved local
 * food photos. The separate remote CC0 importer remains unchanged.
 *
 * Default DRY RUN reads the local WebP files (no network/DB/storage writes).
 * --apply requires explicitly verified staging backups, every image fully
 * rights/visual approved and a separate WAYTA_LOCAL_IMPORT_ENV=staging flag.
 * Production is intentionally unsupported in this first implementation.
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
  assertLocalManifestApproved,
  inspectLocalFoodImage,
  parseLocalFoodImageManifest,
  type LocalFoodImageItem,
} from '../src/platform/food-library/local-food-image-import';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const USAGE =
  'Usage: npm run import:reviewed-local-food-images --workspace=apps/api -- ' +
  '--manifest <approved-manifest.json> --base-dir <local-photo-root> ' +
  '[--apply --ack-staging-backup]';

function flagsFromArgs() {
  const args = process.argv.slice(2);
  const allowed = new Set([
    '--manifest',
    '--base-dir',
    '--apply',
    '--ack-staging-backup',
  ]);
  const occurrences = (flag: string) =>
    args.filter((value) => value === flag).length;
  const manifestAt = args.indexOf('--manifest');
  const dirAt = args.indexOf('--base-dir');
  const apply = args.includes('--apply');
  const backupAcknowledged = args.includes('--ack-staging-backup');
  if (
    occurrences('--manifest') !== 1 ||
    occurrences('--base-dir') !== 1 ||
    occurrences('--apply') > 1 ||
    occurrences('--ack-staging-backup') > 1 ||
    manifestAt < 0 ||
    dirAt < 0 ||
    !args[manifestAt + 1] ||
    !args[dirAt + 1] ||
    args[manifestAt + 1].startsWith('--') ||
    args[dirAt + 1].startsWith('--') ||
    (backupAcknowledged && !apply) ||
    args.some(
      (v, index) =>
        !allowed.has(v) && index !== manifestAt + 1 && index !== dirAt + 1,
    )
  )
    throw new Error(USAGE);
  return {
    manifest: path.resolve(ROOT, args[manifestAt + 1]),
    baseDir: path.resolve(ROOT, args[dirAt + 1]),
    apply,
    backupAcknowledged,
  };
}

function assertStagingWriteGate(acknowledged: boolean): void {
  if (
    !acknowledged ||
    process.env.WAYTA_LOCAL_IMPORT_ENV !== 'staging' ||
    process.env.NODE_ENV === 'production' ||
    !process.env.DATABASE_URL ||
    !process.env.UPLOAD_LOCAL_DIR
  ) {
    throw new Error(
      'Apply blocked: only a separately authorized STAGING run is supported. ' +
        'Require --ack-staging-backup, WAYTA_LOCAL_IMPORT_ENV=staging, ' +
        'non-production NODE_ENV and staging DATABASE_URL / UPLOAD_LOCAL_DIR.',
    );
  }
  // These environment flags only acknowledge operator checks; they do not
  // independently prove the database or uploads volume was backed up.
}

async function checkedBuffer(item: LocalFoodImageItem, baseDir: string) {
  const checked = await inspectLocalFoodImage(baseDir, item);
  return checked.buffer;
}

async function main(): Promise<void> {
  const flags = flagsFromArgs();
  const raw = await readFile(flags.manifest, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024)
    throw new Error('Manifest exceeds 1 MiB.');
  const manifest = parseLocalFoodImageManifest(JSON.parse(raw) as unknown);

  console.log(
    'Local food image import: ' +
      manifest.images.length +
      ' candidates, mode=' +
      (flags.apply ? 'STAGING APPLY' : 'OFFLINE DRY RUN'),
  );
  if (flags.apply) {
    assertLocalManifestApproved(manifest);
    // Load secrets ONLY when the operator explicitly selected staging APPLY.
    dotenv.config({ path: path.resolve(ROOT, '.env') });
    assertStagingWriteGate(flags.backupAcknowledged);
  }

  // Always validate every file before any database mutation.
  // Fail the entire preflight on a missing file, wrong hash or invalid WebP.
  for (const item of manifest.images) {
    const image = await inspectLocalFoodImage(flags.baseDir, item);
    console.log(
      [
        'PREFLIGHT',
        item.id,
        item.file,
        String(image.width) + 'x' + String(image.height),
        String(Math.round(image.buffer.length / 1024)) + ' KiB',
        item.tagCodes.join(','),
        item.approved ? 'REVIEWED' : 'HOLD',
      ].join(' | '),
    );
  }
  if (!flags.apply) {
    console.log(
      'DRY RUN PASS: all local files and tag codes verified; no DB, network or storage writes. ' +
        'Rights and quality approval status remains distinct from technical validity.',
    );
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const codes = [
      ...new Set(manifest.images.flatMap((item) => item.tagCodes)),
    ];
    const tags = await prisma.foodTag.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const idsByCode = new Map(tags.map((tag) => [tag.code, tag.id]));
    const missing = codes.filter((code) => !idsByCode.has(code));
    if (missing.length) {
      throw new Error(
        'STAGING preflight blocked: missing canonical Food Tags: ' +
          missing.join(', ') +
          '. Seed Food Tags only after a separately verified backup.',
      );
    }

    const services = prisma as unknown as PrismaService;
    const storage = new ImageStorageService(
      new ConfigService({
        UPLOAD_LOCAL_DIR: process.env.UPLOAD_LOCAL_DIR,
      }) as never,
    );
    const library = new FoodLibraryService(services, storage);
    const audit = new PlatformAuditService(services);
    let created = 0;
    let duplicate = 0;
    let failed = 0;
    for (const item of manifest.images) {
      try {
        const buffer = await checkedBuffer(item, flags.baseDir);
        const existing = await prisma.foodImageAsset.findUnique({
          where: { sha256: item.optimizedSha256 },
          select: { id: true },
        });
        if (existing) {
          duplicate++;
          console.log(
            'SKIPPED duplicate existing image: ' +
              item.id +
              ' / ' +
              existing.id,
          );
          continue;
        }

        const saved = await library.upload({
          originalname: item.name + '.webp',
          mimetype: 'image/webp',
          size: buffer.length,
          buffer,
        });
        // The metadata is a PROPOSAL. bulkApply sets DRAFT and clears review.
        await library.bulkApply({
          ids: [saved.image.id],
          presentation: item.presentation,
          sectors: item.sectors,
          addTagIds: item.tagCodes.map((code) => idsByCode.get(code)!),
        });
        await audit.record({
          admin: null,
          actorEmail: 'reviewed-local-food-image-import',
          action: 'platform.food_image_imported',
          details: {
            imageId: saved.image.id,
            importId: item.id,
            sourcePageUrl: item.sourcePageUrl,
            sourceLicense: item.licenseKind,
            rightsEvidenceRef: item.rightsEvidenceRef,
            rightsReviewedBy: item.rightsReviewedBy,
            rightsReviewedAt: item.rightsReviewedAt,
            visualReviewedBy: item.visualReviewedBy,
            visualReviewedAt: item.visualReviewedAt,
            originalSha256: item.sourceOriginalSha256,
            optimizedSha256: item.optimizedSha256,
            qualityScores: item.qualityScores,
            tagCodes: item.tagCodes,
            sectors: item.sectors,
            presentation: item.presentation,
            status: 'DRAFT',
          },
        });
        created++;
        console.log('DRAFT ' + item.id + ' => ' + saved.image.id);
      } catch (error: unknown) {
        failed++;
        console.error(
          'FAILED ' +
            item.id +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        );
        // An uploaded partial DRAFT is never deleted or auto-published.
        // Investigate it via Platform Admin before retrying.
      }
    }
    console.log(
      'STAGING IMPORT RESULT: created=' +
        created +
        ', duplicates=' +
        duplicate +
        ', failed=' +
        failed +
        '. No assets published or assigned to restaurant products.',
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