/**
 * Explicit, operator-driven import of reviewed local WebP food photos.
 * Default: offline read-only DRY RUN; no network/DB/storage writes.
 * STAGING and PRODUCTION require different explicit write gates.
 *
 * Production: run only in the one-shot GHCR api-tools container sharing the
 * existing production PostgreSQL network and persistent uploads volume.
 * Backups must be independently verified off-server before applying.
 * This command imports DRAFT images only. Never Review/Publish automatically.
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
import {
  assertLocalImageImportWriteGate,
  parseLocalImageImportArguments,
} from '../src/platform/food-library/local-food-image-import-write-gate';

const ROOT = path.resolve(__dirname, '..', '..', '..');
async function checkedBuffer(item: LocalFoodImageItem, baseDir: string) {
  const checked = await inspectLocalFoodImage(baseDir, item);
  return checked.buffer;
}

async function main(): Promise<void> {
  const options = parseLocalImageImportArguments(process.argv.slice(2));
  const flags = {
    manifest: path.resolve(ROOT, options.manifest),
    baseDir: path.resolve(ROOT, options.baseDir),
    apply: options.apply,
  };
  const raw = await readFile(flags.manifest, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024)
    throw new Error('Manifest exceeds 1 MiB.');
  const manifest = parseLocalFoodImageManifest(JSON.parse(raw) as unknown);

  console.log(
    'Local food image import: ' +
      manifest.images.length +
      ' candidates, mode=' +
      (flags.apply
        ? options.target.toUpperCase() + ' APPLY'
        : 'OFFLINE DRY RUN'),
  );
  if (flags.apply) {
    assertLocalManifestApproved(manifest);
    // Load secrets only for an explicitly authorized write.
    dotenv.config({ path: path.resolve(ROOT, '.env') });
    assertLocalImageImportWriteGate(options, process.env);
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
        item.ownerAttestation
          ? 'OWNER_ACCEPTED'
          : item.approved
            ? 'REVIEWED'
            : 'HOLD',
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
            approvalBasis: item.ownerAttestation
              ? 'OWNER_ACCEPTED_NOT_INDEPENDENTLY_VERIFIED'
              : 'INDEPENDENT_REVIEW',
            ownerDecisionRef: item.ownerAttestation?.decisionRef ?? null,
            ownerAcceptedAt: item.ownerAttestation?.acceptedAt ?? null,
            ownerAcceptsQualityWithoutScores:
              item.ownerAttestation?.acceptsQualityWithoutScores ?? false,
            ownerAcceptsUsageRightsResponsibility:
              item.ownerAttestation?.acceptsUsageRightsResponsibility ?? false,
            tagCodes: item.tagCodes,
            sectors: item.sectors,
            presentation: item.presentation,
            targetEnvironment: options.target,
            ...(options.target === 'production'
              ? {
                  databaseBackupReference: options.databaseBackupRef,
                  uploadsBackupReference: options.uploadsBackupRef,
                }
              : {}),
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
      options.target.toUpperCase() +
        ' IMPORT RESULT: created=' +
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
