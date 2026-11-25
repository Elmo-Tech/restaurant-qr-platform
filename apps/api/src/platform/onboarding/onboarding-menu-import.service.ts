import {
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { randomUUID } from 'node:crypto';
import {
  importGrantStatus,
  requireImportGrant,
} from './onboarding-import-grant';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  normalizeExtraction,
  type NormalizedExtraction,
} from '../../menu-import/menu-import-extraction';
import { MenuImportExtractor } from '../../menu-import/menu-import-extractor';
import {
  inspectMenuFiles,
  invalid,
  XLSX_MIME,
  type UploadedMenuFile,
} from '../../menu-import/menu-import-file';
import { readMenuTemplate } from '../../menu-import/menu-import-sheet';
import {
  PLATFORM_SUPPORTED_LOCALES,
  normalizePlatformLocale,
} from '../../restaurants/platform-locales';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';
import {
  OnboardingCasesService,
  type CaseOutcome,
  type OnboardingCaseView,
} from './onboarding-cases.service';
import { isUuid, readDetails, readModeConfig } from './onboarding-details';
import { menuContentProblems } from './onboarding-menu-state';
import {
  sanitizeOnboardingMenuDraft,
  type OnboardingMenuDraft,
} from './onboarding-menu';
import { onboardingError } from './onboarding-provisioning.service';
import { isEditable } from './onboarding-transitions';

const MAX_ATTEMPTS = 3;
const LEASE_MS = 10 * 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 60 * 60_000;
const MAX_IMAGE_PIXELS = 40_000_000;

export function extractionToMenu(
  extraction: NormalizedExtraction,
  menuName: string,
  defaultLocale: string,
): OnboardingMenuDraft {
  function translations(
    names: Record<string, string>,
    descriptions: Record<string, string> = {},
  ) {
    return PLATFORM_SUPPORTED_LOCALES.filter((locale) => !!names[locale]).map(
      (locale) => ({
        locale,
        name: names[locale],
        ...(descriptions[locale] ? { description: descriptions[locale] } : {}),
      }),
    );
  }
  return {
    menus: [
      {
        translations: [{ locale: defaultLocale, name: menuName }],
        categories: extraction.categories.map((category) => ({
          translations: translations(category.names),
          products: category.products.map((product) => ({
            translations: translations(product.names, product.descriptions),
            // A real size price is a valid starting product price; never fabricate a missing price.
            price:
              product.price ??
              product.priceOptions.reduce<string>(
                (min, option) =>
                  !min || new Prisma.Decimal(option.price).lt(min)
                    ? option.price
                    : min,
                '',
              ),
            variants: product.priceOptions.map((size) => ({
              translations: translations(size.labels),
              price: size.price,
            })),
            modifierGroups: [],
          })),
        })),
      },
    ],
  };
}

async function inspectImage(buffer: Buffer, mime: string) {
  const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .metadata()
    .catch(() => null);
  if (
    !metadata?.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
    (metadata.pages ?? 1) !== 1 ||
    `image/${metadata.format}` !== mime
  ) {
    throw invalid(
      'The menu image is invalid or its dimensions exceed the limit.',
    );
  }
}

@Injectable()
export class OnboardingMenuImportService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(OnboardingMenuImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: OnboardingCasesService,
    private readonly extractor: MenuImportExtractor,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const sweep = () =>
      void this.cleanupExpired().catch(() =>
        this.logger.warn('Onboarding import cleanup failed.'),
      );
    sweep();
    this.timer = setInterval(sweep, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async cleanupExpired(now = new Date()) {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    await this.prisma
      .$executeRaw`DELETE FROM onboarding_import_usage WHERE finished_at IS NOT NULL AND started_at < ${cutoff}`;
    await this.prisma.onboardingCase.updateMany({
      where: {
        importExpiresAt: { lte: now },
        menuDraft: { not: Prisma.DbNull },
      },
      data: {
        menuDraft: Prisma.DbNull,
        importReviewed: false,
        revision: { increment: 1 },
      },
    });
  }

  async setGrant(
    admin: PlatformAdminPrincipal,
    id: string,
    revision: number,
    reason: string,
    expiresAt: string | undefined,
    revoke: boolean,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    if (!isUuid(id)) return { outcome: 'notFound' };
    if (!reason.trim() || reason.length > 500)
      return { outcome: 'invalidInput', problems: ['grant'] };
    const result = await this.prisma.$transaction(
      async (tx): Promise<CaseOutcome<null>> => {
        await tx.$queryRaw`SELECT id FROM onboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;
        const [{ now }] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        const expiry = expiresAt
          ? new Date(expiresAt)
          : new Date(now.getTime() + 24 * 60 * 60_000);
        if (
          !revoke &&
          (!Number.isFinite(expiry.getTime()) ||
            expiry <= now ||
            expiry.getTime() > now.getTime() + 7 * 24 * 60 * 60_000)
        )
          return { outcome: 'invalidInput', problems: ['grant'] };
        const row = await tx.onboardingCase.findUnique({ where: { id } });
        if (!row) return { outcome: 'notFound' };
        if (row.revision !== revision)
          return { outcome: 'revisionConflict', currentRevision: row.revision };
        if (
          (!isEditable(row.status) &&
            !['FAILED', 'PROVISIONING', 'MENU_SETUP'].includes(row.status)) ||
          (row.mode !== 'REAL' && row.mode !== 'TRIAL')
        )
          return { outcome: 'notEditable', status: row.status };
        if (revoke && importGrantStatus(row, now) === 'NONE')
          return { outcome: 'invalidTransition', status: row.status };
        // Invalidate an unpublished import run under the same case lock as its checkpoints.
        // Otherwise this revision change can fence out the worker's failure update and
        // leave the case indefinitely in an in-progress state.
        const interrupted =
          ['PROVISIONING', 'MENU_SETUP'].includes(row.status) &&
          row.menuProvenance !== 'MANUAL' &&
          !row.menuPublishedAt;
        const interruptionCode = revoke
          ? 'ONBOARDING_IMPORT_GRANT_REQUIRED'
          : 'ONBOARDING_IMPORT_GRANT_CHANGED';
        await tx.onboardingCase.update({
          where: { id },
          data: {
            ...(interrupted
              ? { status: 'FAILED' as const, lastErrorCode: interruptionCode }
              : {}),
            ...(revoke
              ? {
                  importGrantRevokedAt: now,
                  importGrantRevokedBy: admin.adminId,
                }
              : {
                  importGrantId: randomUUID(),
                  importGrantIssuedBy: admin.adminId,
                  importGrantIssuedAt: now,
                  importGrantExpiresAt: expiry,
                  importGrantRevokedAt: null,
                  importGrantRevokedBy: null,
                }),
            updatedByAdminId: admin.adminId,
            revision: { increment: 1 },
          },
        });
        if (interrupted)
          await this.audit.record(
            {
              admin,
              action: 'onboarding.failed',
              details: { caseId: id, code: interruptionCode },
            },
            tx,
          );
        await this.audit.record(
          {
            admin,
            action: revoke
              ? 'onboarding.import_grant_revoked'
              : 'onboarding.import_granted',
            details: {
              caseId: id,
              reason: reason.trim(),
              ...(revoke ? {} : { expiresAt: expiry.toISOString() }),
            },
          },
          tx,
        );
        return { outcome: 'ok', data: null };
      },
    );
    return result.outcome === 'ok' ? this.cases.get(id) : result;
  }

  async stage(
    admin: PlatformAdminPrincipal,
    id: string,
    revision: number,
    files: UploadedMenuFile[] | undefined,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    if (!isUuid(id)) return { outcome: 'notFound' };
    const inspected = inspectMenuFiles(files);
    const lease = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM onboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.onboardingCase.findUnique({ where: { id } });
      if (!row) return { outcome: 'notFound' } as const;
      if (row.revision !== revision)
        return {
          outcome: 'revisionConflict',
          currentRevision: row.revision,
        } as const;
      if (
        !isEditable(row.status) ||
        (row.mode !== 'REAL' && row.mode !== 'TRIAL')
      )
        return { outcome: 'notEditable', status: row.status } as const;
      const config = readModeConfig(row.modeConfig);
      if (!row.packageId || row.packageId !== config.packageId)
        onboardingError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'PACKAGE_NOT_AVAILABLE',
          'Choose an active package before importing a menu.',
        );
      await this.requireActivePackage(tx, row.packageId);
      let now = new Date();
      requireImportGrant(row, now);
      if (row.importLeaseUntil && row.importLeaseUntil > now)
        onboardingError(
          HttpStatus.CONFLICT,
          'IMPORT_ALREADY_RUNNING',
          'A menu import is already running.',
        );
      if (row.importAttempts >= MAX_ATTEMPTS)
        onboardingError(
          HttpStatus.TOO_MANY_REQUESTS,
          'ONBOARDING_IMPORT_QUOTA',
          'This case has reached the import limit.',
        );
      // Serialize accounting across all API instances; never hold this lock during extraction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(718203541)`;
      [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      requireImportGrant(row, now);
      if (row.importLeaseUntil && row.importLeaseUntil > now)
        onboardingError(
          HttpStatus.CONFLICT,
          'IMPORT_ALREADY_RUNNING',
          'A menu import is already running.',
        );
      const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const [usage] = await tx.$queryRaw<
        {
          daily: bigint;
          operatorDaily: bigint;
          running: bigint;
          operatorRunning: bigint;
        }[]
      >`
        SELECT count(*) FILTER (WHERE started_at >= ${day}) AS daily,
          count(*) FILTER (WHERE started_at >= ${day} AND operator_id = ${admin.adminId}::uuid) AS "operatorDaily",
          count(*) FILTER (WHERE finished_at IS NULL) AS running,
          count(*) FILTER (WHERE finished_at IS NULL AND operator_id = ${admin.adminId}::uuid) AS "operatorRunning"
        FROM onboarding_import_usage`;
      if (
        Number(usage.daily) >=
          this.config.get('ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT', {
            infer: true,
          }) ||
        Number(usage.operatorDaily) >=
          this.config.get('ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT', {
            infer: true,
          }) ||
        Number(usage.running) >=
          this.config.get('ONBOARDING_IMPORT_GLOBAL_CONCURRENCY', {
            infer: true,
          }) ||
        Number(usage.operatorRunning) >=
          this.config.get('ONBOARDING_IMPORT_OPERATOR_CONCURRENCY', {
            infer: true,
          })
      )
        onboardingError(
          HttpStatus.TOO_MANY_REQUESTS,
          'ONBOARDING_IMPORT_LIMIT',
          'The onboarding import capacity has been reached.',
        );
      const until = new Date(now.getTime() + LEASE_MS);
      const usageId = randomUUID();
      await tx.$executeRaw`INSERT INTO onboarding_import_usage (id, operator_id, started_at, lease_until) VALUES (${usageId}::uuid, ${admin.adminId}::uuid, ${now}, ${until})`;
      await tx.onboardingCase.update({
        where: { id },
        data: {
          importLeaseUntil: until,
          importLeaseId: usageId,
          importAttempts: { increment: 1 },
        },
      });
      return {
        outcome: 'claimed',
        until,
        usageId,
        grantId: row.importGrantId,
        packageId: row.packageId,
        details: readDetails(row.details),
      } as const;
    });
    if (lease.outcome !== 'claimed') return lease;
    // A failed or timed-out provider call may continue downstream after our connection closes.
    // Keep its capacity slot until an operator verifies that the external work has stopped.
    let providerOutcomeUnknown = false;
    try {
      if (inspected.sourceType === 'IMAGE') {
        for (const file of inspected.files)
          await inspectImage(file.buffer, file.mimeType);
      }
      const sheet =
        inspected.mimeType === XLSX_MIME
          ? await readMenuTemplate(inspected.files[0].buffer)
          : null;
      let extracted: unknown;
      try {
        if (sheet?.kind === 'template') {
          extracted = sheet.extraction;
        } else {
          providerOutcomeUnknown = true;
          extracted = await this.extractor.extract({
            files: inspected.files,
            languageHint: 'auto',
          });
          providerOutcomeUnknown = false;
        }
      } catch {
        onboardingError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'ONBOARDING_IMPORT_FAILED',
          'The menu could not be extracted.',
        );
      }
      const normalized = normalizeExtraction(extracted);
      if (!normalized.ok)
        onboardingError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ONBOARDING_IMPORT_FAILED',
          'The menu could not be extracted.',
        );
      const { restaurant } = lease.details;
      const draft = sanitizeOnboardingMenuDraft(
        extractionToMenu(
          normalized.data,
          restaurant.name ?? '',
          normalizePlatformLocale(restaurant.defaultLocale) ?? 'ar',
        ),
      );
      if (!draft.ok)
        onboardingError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ONBOARDING_IMPORT_FAILED',
          'The extracted menu exceeds the draft limits.',
        );
      const saved = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM onboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;
        await this.requireActivePackage(tx, lease.packageId);
        const [{ now }] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        const current = await tx.onboardingCase.findUnique({ where: { id } });
        if (!current || current.importGrantId !== lease.grantId) return false;
        requireImportGrant(current, now);
        const changed = await tx.onboardingCase.updateMany({
          where: {
            id,
            revision,
            importLeaseId: lease.usageId,
            importGrantId: lease.grantId,
            importGrantRevokedAt: null,
            importGrantExpiresAt: { gt: new Date() },
            status: { in: ['DRAFT', 'READY_FOR_REVIEW'] },
            AND: [
              { importLeaseUntil: lease.until },
              { importLeaseUntil: { gt: now } },
            ],
          },
          data: {
            menuDraft: draft.value,
            menuProvenance: 'IMPORTED',
            importDraftGrantId: lease.grantId,
            importExpiresAt: new Date(now.getTime() + RETENTION_MS),
            importReviewed: false,
            importLeaseUntil: null,
            importLeaseId: null,
            status: 'DRAFT',
            completedSteps: (current?.completedSteps ?? []).filter(
              (step) => step !== 'menu',
            ),
            updatedByAdminId: admin.adminId,
            revision: { increment: 1 },
          },
        });
        if (changed.count)
          await this.audit.record(
            {
              admin,
              action: 'onboarding.import_staged',
              details: { caseId: id, fileCount: inspected.files.length },
            },
            tx,
          );
        return changed.count === 1;
      });
      if (!saved) {
        const row = await this.prisma.onboardingCase.findUnique({
          where: { id },
          select: { revision: true },
        });
        return row
          ? { outcome: 'revisionConflict', currentRevision: row.revision }
          : { outcome: 'notFound' };
      }
      return this.cases.get(id);
    } finally {
      await this.prisma.$transaction(async (tx) => {
        await tx.onboardingCase.updateMany({
          where: { id, importLeaseId: lease.usageId },
          data: { importLeaseUntil: null, importLeaseId: null },
        });
        if (!providerOutcomeUnknown)
          await tx.$executeRaw`UPDATE onboarding_import_usage SET finished_at = ${new Date()} WHERE id = ${lease.usageId}::uuid`;
      });
    }
  }

  async reviewOrDiscard(
    admin: PlatformAdminPrincipal,
    id: string,
    revision: number,
    discard: boolean,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    if (!isUuid(id)) return { outcome: 'notFound' };
    const changed = await this.prisma.$transaction(
      async (tx): Promise<CaseOutcome<null>> => {
        await tx.$queryRaw`SELECT id FROM onboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.onboardingCase.findUnique({ where: { id } });
        if (!row) return { outcome: 'notFound' };
        if (row.revision !== revision)
          return { outcome: 'revisionConflict', currentRevision: row.revision };
        if (!isEditable(row.status))
          return { outcome: 'notEditable', status: row.status };
        if (!row.importExpiresAt && row.menuProvenance === 'MANUAL')
          return { outcome: 'invalidTransition', status: row.status };
        if (!discard) {
          if (row.menuProvenance !== 'MANUAL' && !row.importExpiresAt)
            return {
              outcome: 'incomplete',
              problems: {
                customer: [],
                mode: [],
                menu: ['ONBOARDING_IMPORT_EXPIRED'],
              },
            };
          const menu = menuContentProblems(row, readDetails(row.details));
          if (menu.length)
            return {
              outcome: 'incomplete',
              problems: { customer: [], mode: [], menu },
            };
          if (!row.packageId)
            onboardingError(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'PACKAGE_NOT_AVAILABLE',
              'Choose an active package before reviewing the import.',
            );
          await this.requireActivePackage(tx, row.packageId);
          const [{ now }] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          requireImportGrant(row, now);
          if (row.importExpiresAt && row.importExpiresAt <= now)
            return {
              outcome: 'incomplete',
              problems: {
                customer: [],
                mode: [],
                menu: ['ONBOARDING_IMPORT_EXPIRED'],
              },
            };
        }
        await tx.onboardingCase.update({
          where: { id },
          data: {
            ...(discard
              ? {
                  menuDraft: Prisma.DbNull,
                  menuProvenance: 'MANUAL',
                  importDraftGrantId: null,
                  importExpiresAt: null,
                  importLeaseUntil: null,
                  importLeaseId: null,
                  status: 'DRAFT' as const,
                }
              : {}),
            importReviewed: !discard,
            completedSteps: [
              ...row.completedSteps.filter((step) => step !== 'menu'),
              ...(!discard ? ['menu'] : []),
            ],
            updatedByAdminId: admin.adminId,
            revision: { increment: 1 },
          },
        });
        await this.audit.record(
          {
            admin,
            action: discard
              ? 'onboarding.import_discarded'
              : 'onboarding.import_reviewed',
            details: { caseId: id },
          },
          tx,
        );
        return { outcome: 'ok', data: null };
      },
    );
    return changed.outcome === 'ok' ? this.cases.get(id) : changed;
  }

  private async requireActivePackage(
    tx: Prisma.TransactionClient,
    packageId: string,
  ) {
    const [pkg] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM packages WHERE id = ${packageId}::uuid AND status = 'ACTIVE' FOR SHARE`;
    if (!pkg)
      onboardingError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PACKAGE_NOT_AVAILABLE',
        'The selected package is not active.',
      );
  }
}
