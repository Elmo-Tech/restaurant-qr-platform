import {
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';
import { resolveFeatures } from '../../entitlements/features';
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
      await this.requireImportPackage(tx, row.packageId);
      const now = new Date();
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
      const until = new Date(now.getTime() + LEASE_MS);
      await tx.onboardingCase.update({
        where: { id },
        data: { importLeaseUntil: until, importAttempts: { increment: 1 } },
      });
      return {
        outcome: 'claimed',
        until,
        packageId: row.packageId,
        details: readDetails(row.details),
      } as const;
    });
    if (lease.outcome !== 'claimed') return lease;
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
        extracted =
          sheet?.kind === 'template'
            ? sheet.extraction
            : await this.extractor.extract({
                files: inspected.files,
                languageHint: 'auto',
              });
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
        const now = new Date();
        await this.requireImportPackage(tx, lease.packageId);
        const current = await tx.onboardingCase.findUnique({
          where: { id },
          select: { completedSteps: true },
        });
        const changed = await tx.onboardingCase.updateMany({
          where: {
            id,
            revision,
            status: { in: ['DRAFT', 'READY_FOR_REVIEW'] },
            AND: [
              { importLeaseUntil: lease.until },
              { importLeaseUntil: { gt: now } },
            ],
          },
          data: {
            menuDraft: draft.value,
            importExpiresAt: new Date(now.getTime() + RETENTION_MS),
            importReviewed: false,
            importLeaseUntil: null,
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
      await this.prisma.onboardingCase.updateMany({
        where: { id, importLeaseUntil: lease.until },
        data: { importLeaseUntil: null },
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
        if (!row.importExpiresAt)
          return { outcome: 'invalidTransition', status: row.status };
        if (!discard) {
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
          await this.requireImportPackage(tx, row.packageId);
        }
        await tx.onboardingCase.update({
          where: { id },
          data: {
            ...(discard
              ? {
                  menuDraft: Prisma.DbNull,
                  importExpiresAt: null,
                  importLeaseUntil: null,
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

  private async requireImportPackage(
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
    const features = await tx.packageFeature.findMany({
      where: { packageId },
      select: { feature: true },
    });
    if (
      !resolveFeatures(
        [],
        features.map((item) => item.feature),
      ).MENU_IMPORT
    )
      onboardingError(
        HttpStatus.FORBIDDEN,
        'FEATURE_NOT_AVAILABLE',
        'Menu import is not available on this package.',
      );
  }
}
