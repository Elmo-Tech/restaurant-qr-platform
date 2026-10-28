import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  MenuImportConfidence,
  MenuImportSourceType,
  MenuImportStatus,
} from '../generated/prisma/client';
import { createProductPublicId } from '../menu/product-public-id';
import { matchKey, normalizeExtraction } from './menu-import-extraction';
import type {
  NormalizedExtraction,
  NormalizedPriceOption,
} from './menu-import-extraction';
import { inspectMenuFiles, XLSX_MIME } from './menu-import-file';
import type { UploadedMenuFile } from './menu-import-file';
import {
  ExtractorUnavailableError,
  MenuImportExtractor,
} from './menu-import-extractor';
import type { ExtractionInput } from './menu-import-extractor';
import { readMenuTemplate } from './menu-import-sheet';
import type { SheetExtraction } from './menu-import-sheet';

/** A Job still PROCESSING after this long is presumed dead (API restarted, n8n hung). */
const STUCK_AFTER_MS = 10 * 60 * 1000;
const LANGUAGE_HINTS = new Set(['auto', 'ar', 'en']);
const MAX_PRICE = new Prisma.Decimal('999999999.99');

const NO_ACCESS = {
  error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found.' },
};
const NOT_READY = {
  error: {
    code: 'IMPORT_NOT_READY',
    message: 'This import is not waiting for review.',
  },
};

export interface ImportJobView {
  publicId: string;
  status: MenuImportStatus;
  sourceType: MenuImportSourceType;
  sourceFileName: string;
  targetMenuId: string;
  detectedLocales: string[];
  errorCode: string | null;
  warnings: string[];
  startedAt: string;
  finishedAt: string | null;
  approvedAt: string | null;
}

export type DraftBlocker = 'MISSING_PRICE' | 'MISSING_NAME';
export type DraftFlag =
  DraftBlocker | 'LOW_CONFIDENCE' | 'ALREADY_EXISTS' | 'MISSING_TRANSLATION';

export interface DraftSize {
  names: Record<string, string>;
  price: string;
}

export interface DraftProductView {
  id: string;
  included: boolean;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  price: string | null;
  sizes: DraftSize[];
  confidence: MenuImportConfidence;
  flags: DraftFlag[];
  matchedProductId: string | null;
}

export interface DraftCategoryView {
  id: string;
  included: boolean;
  names: Record<string, string>;
  matchedCategoryId: string | null;
  useExisting: boolean;
  flags: DraftFlag[];
  products: DraftProductView[];
}

export interface DraftView {
  job: ImportJobView;
  defaultLocale: string;
  activeLocales: string[];
  categories: DraftCategoryView[];
  /** Number of included products that still block approval. */
  blockerCount: number;
}

type JobRow = Prisma.MenuImportJobGetPayload<Record<string, never>>;

const DRAFT_INCLUDE = {
  translations: true,
  products: {
    orderBy: { displayOrder: 'asc' },
    include: { translations: true },
  },
} satisfies Prisma.MenuImportCategoryInclude;

type DraftCategoryRow = Prisma.MenuImportCategoryGetPayload<{
  include: typeof DRAFT_INCLUDE;
}>;

function toJobView(job: JobRow): ImportJobView {
  return {
    publicId: job.publicId,
    status: job.status,
    sourceType: job.sourceType,
    sourceFileName: job.sourceFileName,
    targetMenuId: job.targetMenuId,
    detectedLocales: job.detectedLocales,
    errorCode: job.errorCode,
    warnings: job.warnings,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    approvedAt: job.approvedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function blockersOf(product: DraftProductView): DraftBlocker[] {
  return product.flags.filter(
    (flag): flag is DraftBlocker =>
      flag === 'MISSING_PRICE' || flag === 'MISSING_NAME',
  );
}

/** Text map from a PATCH body: locale -> text | null, bounded. Anything else is rejected. */
function textMap(
  value: unknown,
  max: number,
): Record<string, string | null> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnprocessableEntityException({
      error: { code: 'INVALID_VALUE', message: 'Invalid value.' },
    });
  }
  const out: Record<string, string | null> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (
      !/^[a-z]{2}$/.test(locale) ||
      !(text === null || (typeof text === 'string' && text.length <= max))
    ) {
      throw new UnprocessableEntityException({
        error: { code: 'INVALID_VALUE', message: 'Invalid value.' },
      });
    }
    out[locale] = text as string | null;
  }
  return out;
}

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/**
 * A menu written in only one language (say Arabic) still has to give the Restaurant's
 * default language a name. When that language is missing, the name read from the file
 * is used as-is (never translated); the item is flagged so Staff can add a translation.
 */
function defaultText(
  names: Record<string, string>,
  defaultLocale: string,
): string | undefined {
  if (names[defaultLocale]) return names[defaultLocale];
  const first = Object.keys(names)
    .sort()
    .find((locale) => names[locale]);
  return first === undefined ? undefined : names[first];
}

/** Translation rows for creation, with the default locale always present. */
function withDefaultLocale<T extends { locale: string; name: string }>(
  rows: T[],
  defaultLocale: string,
): T[] {
  if (rows.length === 0 || rows.some((r) => r.locale === defaultLocale))
    return rows;
  const source = [...rows].sort((a, b) => a.locale.localeCompare(b.locale))[0];
  return [...rows, { ...source, locale: defaultLocale }];
}

/** Valid sizes of a Draft product: a price and a default-locale label each, no duplicate labels. */
function validSizes(
  options: NormalizedPriceOption[],
  defaultLocale: string,
): NormalizedPriceOption[] {
  const seen = new Set<string>();
  const result: NormalizedPriceOption[] = [];
  for (const option of options) {
    const label = defaultText(option.labels, defaultLocale);
    if (!label) continue;
    const key = matchKey(label);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result;
}

function readOptions(json: Prisma.JsonValue): NormalizedPriceOption[] {
  if (!Array.isArray(json)) return [];
  const out: NormalizedPriceOption[] = [];
  for (const entry of json) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      continue;
    const price = (entry as Record<string, unknown>).price;
    const labels = (entry as Record<string, unknown>).labels;
    if (
      typeof price !== 'string' ||
      typeof labels !== 'object' ||
      labels === null
    )
      continue;
    const clean: Record<string, string> = {};
    for (const [locale, text] of Object.entries(
      labels as Record<string, unknown>,
    )) {
      if (typeof text === 'string') clean[locale] = text;
    }
    out.push({ labels: clean, price });
  }
  return out;
}

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: MenuImportExtractor,
  ) {}

  // ---------------------------------------------------------------- upload

  async startImport(input: {
    restaurantId: string;
    userId: string;
    targetMenuId: string;
    languageHint: string | undefined;
    files: UploadedMenuFile[] | undefined;
  }): Promise<{ publicId: string; status: MenuImportStatus }> {
    const inspected = inspectMenuFiles(input.files);
    const languageHint = LANGUAGE_HINTS.has(input.languageHint ?? '')
      ? (input.languageHint as string)
      : 'auto';

    // An .xlsx that follows the template is read right here: no n8n and no model (DEC-058).
    // Any other file needs the extraction service.
    let sheet: SheetExtraction | null = null;
    if (
      inspected.sourceType === 'SPREADSHEET' &&
      inspected.mimeType === XLSX_MIME
    ) {
      const read = await readMenuTemplate(inspected.files[0].buffer);
      if (read.kind === 'template') sheet = read.extraction;
    }

    if (sheet === null && !(await this.extractor.isConfigured())) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'Menu import is not available right now.',
        },
      });
    }

    const menu = await this.prisma.menu.findFirst({
      where: { id: input.targetMenuId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!menu) {
      throw new NotFoundException({
        error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
      });
    }

    await this.failStuckJobs(input.restaurantId);

    let job: JobRow;
    try {
      job = await this.prisma.menuImportJob.create({
        data: {
          publicId: `import-${randomUUID()}`,
          restaurantId: input.restaurantId,
          targetMenuId: menu.id,
          createdByUserId: input.userId,
          status: 'PROCESSING',
          sourceType: inspected.sourceType,
          sourceFileName: inspected.fileName,
          sourceMimeType: inspected.mimeType,
          sourceSizeBytes: inspected.totalBytes,
          languageHint,
        },
      });
    } catch (error) {
      // The partial unique index is the final guarantee: one running import per Restaurant.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          error: {
            code: 'IMPORT_ALREADY_RUNNING',
            message: 'An import is already running for this restaurant.',
          },
        });
      }
      throw error;
    }

    // The files live only in this closure; they are never stored.
    void this.runExtraction(
      job,
      { files: inspected.files, languageHint },
      sheet,
    );

    return { publicId: job.publicId, status: job.status };
  }

  /** Background task: never throws, always leaves the Job READY_FOR_REVIEW or FAILED. */
  private async runExtraction(
    job: JobRow,
    input: ExtractionInput,
    /** A sheet the Backend already read (DEC-058): the extraction service is not called. */
    sheet: SheetExtraction | null = null,
  ): Promise<void> {
    try {
      let raw: unknown;
      try {
        raw = sheet ?? (await this.extractor.extract(input));
      } catch (error) {
        if (!(error instanceof ExtractorUnavailableError)) {
          this.logger.error(`import ${job.publicId} extractor crashed`);
        }
        await this.markFailed(job.id, 'AI_UNAVAILABLE');
        return;
      }
      const normalized = normalizeExtraction(raw);
      if (!normalized.ok) {
        await this.markFailed(job.id, normalized.code);
        return;
      }
      await this.storeDraft(job, normalized.data);
    } catch (error) {
      this.logger.error(
        `import ${job.publicId} failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      await this.markFailed(job.id, 'IMPORT_INTERNAL_ERROR').catch(
        () => undefined,
      );
    }
  }

  private async markFailed(jobId: string, errorCode: string): Promise<void> {
    await this.prisma.menuImportJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: { status: 'FAILED', errorCode, finishedAt: new Date() },
    });
  }

  private async failStuckJobs(restaurantId: string): Promise<void> {
    await this.prisma.menuImportJob.updateMany({
      where: {
        restaurantId,
        status: 'PROCESSING',
        startedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
      },
      data: {
        status: 'FAILED',
        errorCode: 'EXTRACTION_TIMEOUT',
        finishedAt: new Date(),
      },
    });
  }

  /** One short transaction: map the extraction onto the Restaurant's locales and existing content. */
  private async storeDraft(
    job: JobRow,
    data: NormalizedExtraction,
  ): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: job.restaurantId },
      select: { defaultLocale: true },
    });
    const locales = await this.prisma.restaurantLocale.findMany({
      where: { restaurantId: job.restaurantId, isActive: true },
      select: { locale: true },
    });
    const active = new Set(locales.map((l) => l.locale));
    const defaultLocale = restaurant.defaultLocale;

    const existingCategories = await this.prisma.category.findMany({
      where: { restaurantId: job.restaurantId, menuId: job.targetMenuId },
      select: {
        id: true,
        translations: { select: { locale: true, name: true } },
        products: {
          select: {
            id: true,
            translations: { select: { locale: true, name: true } },
          },
        },
      },
    });
    const pick = (
      rows: { locale: string; name: string }[],
    ): string | undefined =>
      rows.find((r) => r.locale === defaultLocale)?.name ?? rows[0]?.name;
    const categoryByKey = new Map<
      string,
      (typeof existingCategories)[number]
    >();
    for (const category of existingCategories) {
      const name = pick(category.translations);
      if (name) categoryByKey.set(matchKey(name), category);
    }

    const keepActive = (
      map: Record<string, string>,
    ): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [locale, text] of Object.entries(map))
        if (active.has(locale)) out[locale] = text;
      return out;
    };

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.menuImportJob.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          status: 'READY_FOR_REVIEW',
          finishedAt: new Date(),
          detectedLocales: data.languages,
          modelName: data.modelName,
          warnings: data.warnings,
        },
      });
      // Timed out or discarded in the meantime: leave it alone.
      if (claimed.count === 0) return;

      let categoryOrder = 0;
      for (const category of data.categories) {
        const names = keepActive(category.names);
        const defaultName = defaultText(names, defaultLocale);
        const match = defaultName
          ? categoryByKey.get(matchKey(defaultName))
          : undefined;
        const existingProducts = new Map<string, string>();
        for (const product of match?.products ?? []) {
          const name = pick(product.translations);
          if (name) existingProducts.set(matchKey(name), product.id);
        }

        await tx.menuImportCategory.create({
          data: {
            restaurantId: job.restaurantId,
            jobId: job.id,
            displayOrder: categoryOrder++,
            included: true,
            matchedCategoryId: match?.id ?? null,
            useExisting: match !== undefined,
            translations: {
              create: Object.entries(names).map(([locale, name]) => ({
                locale,
                name,
              })),
            },
            products: {
              create: category.products.map((product, index) => {
                const productNames = keepActive(product.names);
                const productDescriptions = keepActive(product.descriptions);
                const productDefault = defaultText(productNames, defaultLocale);
                const matchedProductId = productDefault
                  ? (existingProducts.get(matchKey(productDefault)) ?? null)
                  : null;
                return {
                  restaurantId: job.restaurantId,
                  displayOrder: index,
                  price: product.price === null ? null : money(product.price),
                  priceOptions: product.priceOptions.map((option) => ({
                    labels: keepActive(option.labels),
                    price: option.price,
                  })),
                  confidence: product.confidence,
                  // Existing products are excluded by default (DEC-040).
                  included: matchedProductId === null,
                  flags: product.flags,
                  matchedProductId,
                  translations: {
                    create: Object.entries(productNames).map(
                      ([locale, name]) => ({
                        locale,
                        name,
                        description: productDescriptions[locale] ?? null,
                      }),
                    ),
                  },
                };
              }),
            },
          },
        });
      }
    });
  }

  // ------------------------------------------------------------------ read

  async listJobs(restaurantId: string): Promise<ImportJobView[]> {
    await this.failStuckJobs(restaurantId);
    const jobs = await this.prisma.menuImportJob.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return jobs.map(toJobView);
  }

  async getJob(restaurantId: string, publicId: string): Promise<ImportJobView> {
    await this.failStuckJobs(restaurantId);
    return toJobView(await this.requireJob(restaurantId, publicId));
  }

  private async requireJob(
    restaurantId: string,
    publicId: string,
  ): Promise<JobRow> {
    const job = await this.prisma.menuImportJob.findFirst({
      where: { publicId, restaurantId },
    });
    if (!job) throw new NotFoundException(NO_ACCESS);
    return job;
  }

  async getDraft(restaurantId: string, publicId: string): Promise<DraftView> {
    await this.failStuckJobs(restaurantId);
    const job = await this.requireJob(restaurantId, publicId);
    if (job.status !== 'READY_FOR_REVIEW')
      throw new ConflictException(NOT_READY);
    return this.buildView(this.prisma, job);
  }

  private async buildView(
    client: Prisma.TransactionClient | PrismaService,
    job: JobRow,
  ): Promise<DraftView> {
    const restaurant = await client.restaurant.findUniqueOrThrow({
      where: { id: job.restaurantId },
      select: { defaultLocale: true },
    });
    const locales = await client.restaurantLocale.findMany({
      where: { restaurantId: job.restaurantId, isActive: true },
      select: { locale: true },
      orderBy: { locale: 'asc' },
    });
    const rows = await client.menuImportCategory.findMany({
      where: { jobId: job.id, restaurantId: job.restaurantId },
      orderBy: { displayOrder: 'asc' },
      include: DRAFT_INCLUDE,
    });
    const defaultLocale = restaurant.defaultLocale;
    const categories = rows.map((row) =>
      this.toCategoryView(row, defaultLocale),
    );
    let blockerCount = 0;
    for (const category of categories) {
      if (!category.included) continue;
      for (const product of category.products) {
        if (product.included && blockersOf(product).length > 0) {
          blockerCount += 1;
        }
      }
    }
    return {
      job: toJobView(job),
      defaultLocale,
      activeLocales: locales.map((l) => l.locale),
      categories,
      blockerCount,
    };
  }

  private toCategoryView(
    row: DraftCategoryRow,
    defaultLocale: string,
  ): DraftCategoryView {
    const names: Record<string, string> = {};
    for (const t of row.translations) names[t.locale] = t.name;
    const flags: DraftFlag[] = [];
    if (!defaultText(names, defaultLocale) && !row.useExisting) {
      flags.push('MISSING_NAME');
    }
    return {
      id: row.id,
      included: row.included,
      names,
      matchedCategoryId: row.matchedCategoryId,
      useExisting: row.useExisting,
      flags,
      products: row.products.map((product) =>
        this.toProductView(product, defaultLocale),
      ),
    };
  }

  private toProductView(
    row: DraftCategoryRow['products'][number],
    defaultLocale: string,
  ): DraftProductView {
    const names: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    for (const t of row.translations) {
      names[t.locale] = t.name;
      if (t.description) descriptions[t.locale] = t.description;
    }
    const sizes = validSizes(readOptions(row.priceOptions), defaultLocale);
    const price = row.price === null ? null : row.price.toFixed(2);
    const flags: DraftFlag[] = [];
    if (!defaultText(names, defaultLocale)) flags.push('MISSING_NAME');
    if (price === null && sizes.length < 1) flags.push('MISSING_PRICE');
    if (row.confidence === 'LOW') flags.push('LOW_CONFIDENCE');
    if (row.matchedProductId) flags.push('ALREADY_EXISTS');
    if (row.flags.includes('MISSING_TRANSLATION'))
      flags.push('MISSING_TRANSLATION');
    return {
      id: row.id,
      included: row.included,
      names,
      descriptions,
      price,
      sizes: sizes.map((s) => ({ names: s.labels, price: s.price })),
      confidence: row.confidence,
      flags,
      matchedProductId: row.matchedProductId,
    };
  }

  // ------------------------------------------------------------------ edit

  private async requireEditableJob(
    restaurantId: string,
    publicId: string,
  ): Promise<JobRow> {
    await this.failStuckJobs(restaurantId);
    const job = await this.requireJob(restaurantId, publicId);
    if (job.status !== 'READY_FOR_REVIEW')
      throw new ConflictException(NOT_READY);
    return job;
  }

  private async activeLocales(restaurantId: string): Promise<Set<string>> {
    const rows = await this.prisma.restaurantLocale.findMany({
      where: { restaurantId, isActive: true },
      select: { locale: true },
    });
    return new Set(rows.map((r) => r.locale));
  }

  private invalid(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ error: { code, message } });
  }

  async updateCategory(input: {
    restaurantId: string;
    publicId: string;
    draftCategoryId: string;
    included?: boolean;
    useExisting?: boolean;
    names?: unknown;
  }): Promise<void> {
    const names = textMap(input.names, 120);
    const job = await this.requireEditableJob(
      input.restaurantId,
      input.publicId,
    );
    const active = await this.activeLocales(input.restaurantId);
    const category = await this.prisma.menuImportCategory.findFirst({
      where: {
        id: input.draftCategoryId,
        jobId: job.id,
        restaurantId: input.restaurantId,
      },
    });
    if (!category) throw new NotFoundException(NO_ACCESS);
    if (input.useExisting === true && !category.matchedCategoryId) {
      throw this.invalid(
        'IMPORT_NO_MATCH',
        'There is no existing category to add to.',
      );
    }
    for (const locale of Object.keys(names ?? {})) {
      if (!active.has(locale)) {
        throw this.invalid(
          'LOCALE_NOT_ACTIVE',
          'The locale is not active for this restaurant.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.menuImportCategory.update({
        where: { id: category.id },
        data: {
          ...(input.included !== undefined ? { included: input.included } : {}),
          ...(input.useExisting !== undefined
            ? { useExisting: input.useExisting }
            : {}),
        },
      });
      for (const [locale, value] of Object.entries(names ?? {})) {
        const name = value?.trim() ?? '';
        if (name === '') {
          await tx.menuImportCategoryTranslation.deleteMany({
            where: { categoryId: category.id, locale },
          });
        } else {
          await tx.menuImportCategoryTranslation.upsert({
            where: { categoryId_locale: { categoryId: category.id, locale } },
            create: { categoryId: category.id, locale, name },
            update: { name },
          });
        }
      }
    });
  }

  async updateProduct(input: {
    restaurantId: string;
    publicId: string;
    draftProductId: string;
    included?: boolean;
    price?: string | null;
    names?: unknown;
    descriptions?: unknown;
  }): Promise<void> {
    const names = textMap(input.names, 120);
    const descriptions = textMap(input.descriptions, 500);
    const job = await this.requireEditableJob(
      input.restaurantId,
      input.publicId,
    );
    const active = await this.activeLocales(input.restaurantId);
    const product = await this.prisma.menuImportProduct.findFirst({
      where: {
        id: input.draftProductId,
        restaurantId: input.restaurantId,
        category: { jobId: job.id },
      },
    });
    if (!product) throw new NotFoundException(NO_ACCESS);
    for (const locale of [
      ...Object.keys(names ?? {}),
      ...Object.keys(descriptions ?? {}),
    ]) {
      if (!active.has(locale)) {
        throw this.invalid(
          'LOCALE_NOT_ACTIVE',
          'The locale is not active for this restaurant.',
        );
      }
    }
    let price: Prisma.Decimal | null | undefined;
    if (input.price !== undefined) {
      if (input.price === null) {
        price = null;
      } else if (/^\d{1,9}(\.\d{1,2})?$/.test(input.price)) {
        price = money(input.price);
        if (price.greaterThan(MAX_PRICE))
          throw this.invalid('INVALID_PRICE', 'Invalid price.');
      } else {
        throw this.invalid('INVALID_PRICE', 'Invalid price.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.menuImportProduct.update({
        where: { id: product.id },
        data: {
          ...(input.included !== undefined ? { included: input.included } : {}),
          ...(price !== undefined ? { price } : {}),
        },
      });
      const locales = new Set([
        ...Object.keys(names ?? {}),
        ...Object.keys(descriptions ?? {}),
      ]);
      for (const locale of locales) {
        const existing = await tx.menuImportProductTranslation.findUnique({
          where: { productId_locale: { productId: product.id, locale } },
        });
        const nameInput = names?.[locale];
        const descInput = descriptions?.[locale];
        const name =
          nameInput === undefined
            ? (existing?.name ?? '')
            : (nameInput ?? '').trim();
        const description =
          descInput === undefined
            ? (existing?.description ?? null)
            : (descInput ?? '').trim() || null;
        if (name === '') {
          await tx.menuImportProductTranslation.deleteMany({
            where: { productId: product.id, locale },
          });
        } else {
          await tx.menuImportProductTranslation.upsert({
            where: { productId_locale: { productId: product.id, locale } },
            create: { productId: product.id, locale, name, description },
            update: { name, description },
          });
        }
      }
    });
  }

  // ------------------------------------------------------- discard / approve

  async discard(restaurantId: string, publicId: string): Promise<void> {
    const job = await this.requireEditableJob(restaurantId, publicId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.menuImportJob.updateMany({
        where: { id: job.id, status: 'READY_FOR_REVIEW' },
        data: { status: 'DISCARDED', finishedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException(NOT_READY);
      await tx.menuImportCategory.deleteMany({ where: { jobId: job.id } });
    });
  }

  async approve(input: {
    restaurantId: string;
    publicId: string;
    productStatus: 'ACTIVE' | 'INACTIVE';
  }): Promise<{ categoriesCreated: number; productsCreated: number }> {
    await this.failStuckJobs(input.restaurantId);
    const found = await this.requireJob(input.restaurantId, input.publicId);
    if (found.status === 'APPROVED') {
      throw new ConflictException({
        error: {
          code: 'IMPORT_ALREADY_APPROVED',
          message: 'This import was already approved.',
        },
      });
    }
    if (found.status !== 'READY_FOR_REVIEW')
      throw new ConflictException(NOT_READY);

    return this.prisma.$transaction(async (tx) => {
      // Status guard: the first approve wins, a concurrent one sees count 0.
      const claimed = await tx.menuImportJob.updateMany({
        where: {
          id: found.id,
          restaurantId: input.restaurantId,
          status: 'READY_FOR_REVIEW',
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          finishedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          error: {
            code: 'IMPORT_ALREADY_APPROVED',
            message: 'This import was already approved.',
          },
        });
      }

      const view = await this.buildView(tx, { ...found, status: 'APPROVED' });
      const active = new Set(view.activeLocales);

      const blockers: { id: string; flags: DraftBlocker[] }[] = [];
      for (const category of view.categories) {
        if (!category.included) continue;
        const includedProducts = category.products.filter((p) => p.included);
        if (includedProducts.length === 0) continue;
        for (const product of includedProducts) {
          const list = blockersOf(product);
          if (list.length > 0) blockers.push({ id: product.id, flags: list });
        }
        if (category.flags.includes('MISSING_NAME')) {
          blockers.push({ id: category.id, flags: ['MISSING_NAME'] });
        }
      }
      if (blockers.length > 0) {
        throw new UnprocessableEntityException({
          error: {
            code: 'IMPORT_DRAFT_INCOMPLETE',
            message: 'Some items still need a name or a price.',
            blockers,
          },
        });
      }

      const rows = await tx.menuImportCategory.findMany({
        where: { jobId: found.id, restaurantId: input.restaurantId },
        orderBy: { displayOrder: 'asc' },
        include: DRAFT_INCLUDE,
      });

      const lastCategory = await tx.category.aggregate({
        where: { restaurantId: input.restaurantId, menuId: found.targetMenuId },
        _max: { displayOrder: true },
      });
      let nextCategoryOrder = (lastCategory._max.displayOrder ?? -1) + 1;
      let categoriesCreated = 0;
      let productsCreated = 0;

      for (const row of rows) {
        const categoryView = view.categories.find((c) => c.id === row.id);
        if (!categoryView || !categoryView.included) continue;
        const wanted = categoryView.products.filter((p) => p.included);
        if (wanted.length === 0) continue;

        // Re-verify the match: the target may have been deleted since the Draft was made.
        let categoryId: string | null = null;
        if (row.useExisting && row.matchedCategoryId) {
          const existing = await tx.category.findFirst({
            where: {
              id: row.matchedCategoryId,
              restaurantId: input.restaurantId,
              menuId: found.targetMenuId,
            },
            select: { id: true },
          });
          categoryId = existing?.id ?? null;
        }
        if (categoryId === null) {
          const created = await tx.category.create({
            data: {
              restaurantId: input.restaurantId,
              menuId: found.targetMenuId,
              status: 'ACTIVE',
              displayOrder: nextCategoryOrder++,
              imageAssetPath: null,
              translations: {
                create: withDefaultLocale(
                  row.translations
                    .filter((t) => active.has(t.locale))
                    .map((t) => ({ locale: t.locale, name: t.name })),
                  view.defaultLocale,
                ),
              },
            },
            select: { id: true },
          });
          categoryId = created.id;
          categoriesCreated += 1;
          await tx.menuImportCategory.update({
            where: { id: row.id },
            data: { createdCategoryId: created.id },
          });
        }

        const lastProduct = await tx.product.aggregate({
          where: { restaurantId: input.restaurantId, categoryId },
          _max: { displayOrder: true },
        });
        let productOrder = (lastProduct._max.displayOrder ?? -1) + 1;

        for (const draft of row.products) {
          const productView = wanted.find((p) => p.id === draft.id);
          if (!productView) continue;
          const sizes = productView.sizes;
          const useSizes = sizes.length >= 2;
          const basePrice = useSizes
            ? sizes.reduce(
                (min, s) =>
                  money(s.price).lessThan(min) ? money(s.price) : min,
                money(sizes[0].price),
              )
            : productView.price !== null
              ? money(productView.price)
              : money(sizes[0].price);

          const created = await tx.product.create({
            data: {
              restaurantId: input.restaurantId,
              categoryId,
              publicId: createProductPublicId(),
              status: input.productStatus,
              availability: 'AVAILABLE',
              basePrice,
              primaryImageAssetPath: null,
              displayOrder: productOrder++,
              allowCustomerNotes: true,
              featured: false,
              translations: {
                create: withDefaultLocale(
                  draft.translations
                    .filter((t) => active.has(t.locale))
                    .map((t) => ({
                      locale: t.locale,
                      name: t.name,
                      description: t.description,
                    })),
                  view.defaultLocale,
                ),
              },
            },
            select: { id: true },
          });
          productsCreated += 1;
          await tx.menuImportProduct.update({
            where: { id: draft.id },
            data: { createdProductId: created.id },
          });

          if (useSizes) {
            // Smallest price first; the smallest size is the default.
            const ordered = [...sizes].sort((a, b) =>
              money(a.price).comparedTo(money(b.price)),
            );
            for (let index = 0; index < ordered.length; index += 1) {
              const size = ordered[index];
              await tx.productVariant.create({
                data: {
                  restaurantId: input.restaurantId,
                  productId: created.id,
                  status: 'ACTIVE',
                  price: money(size.price),
                  displayOrder: index,
                  isDefault: index === 0,
                  discountApplies: true,
                  translations: {
                    create: withDefaultLocale(
                      Object.entries(size.names)
                        .filter(([locale]) => active.has(locale))
                        .map(([locale, name]) => ({ locale, name })),
                      view.defaultLocale,
                    ),
                  },
                },
              });
            }
          }
        }
      }

      return { categoriesCreated, productsCreated };
    });
  }
}
