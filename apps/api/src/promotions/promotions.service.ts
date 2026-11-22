import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  configFromRow,
  fromDraft,
  promotionConfigSelect,
  promotionScalarData,
  staffPromotionSelect,
  toPromotionCandidate,
  toStaffPromotion,
  widenedTargets,
  type PromotionConfig,
  type PromotionTranslation,
  type StaffPromotion,
  type StaffPromotionRow,
} from './promotion-config';
import type {
  ListPromotionsQueryDto,
  PromotionDraftDto,
  UpdatePromotionDto,
} from './promotion.dto';
import { validatePromotionInput } from './promotion-engine';

export { toPromotionCandidate } from './promotion-config';
export type { PromotionCandidate, StaffPromotion } from './promotion-config';

const NOT_FOUND = {
  error: { code: 'PROMOTION_NOT_FOUND', message: 'Promotion not found.' },
};
const HAS_HISTORY = {
  error: {
    code: 'PROMOTION_HAS_HISTORICAL_REFERENCES',
    message:
      'This promotion has been used by an order and cannot be deleted. Archive it instead.',
  },
};
const ARCHIVED = {
  error: {
    code: 'PROMOTION_ARCHIVED',
    message: 'An archived promotion cannot be changed or reactivated.',
  },
};
const CHANGED = {
  error: {
    code: 'PROMOTION_CHANGED',
    message: 'This promotion changed. Reload it and try again.',
  },
};
const HISTORY_FK = 'order_promotions_promotion_scope_fkey';
const TARGET_FKS: Readonly<Record<string, string>> = {
  promotion_branches_branch_scope_fkey: 'branchIds',
  promotion_menus_menu_scope_fkey: 'menuIds',
  promotion_categories_category_scope_fkey: 'categoryIds',
  promotion_products_product_scope_fkey: 'productIds',
  promotion_delivery_zones_zone_scope_fkey: 'deliveryZoneIds',
};

type StaffWriteScope = { restaurantId: string; userId: string };
type ValidatedDraft = { config: PromotionConfig; defaultLocale: string };
type Problem = { code: string; field: string };

function invalidConfig(problems: Problem[]): never {
  throw new UnprocessableEntityException({
    error: {
      code: 'PROMOTION_INVALID',
      message: 'The promotion configuration is not valid.',
      details: { problems },
    },
  });
}

function invalidTargets(fields: string[]): never {
  throw new UnprocessableEntityException({
    error: {
      code: 'INVALID_PROMOTION_TARGET',
      message: 'One or more promotion targets are not valid.',
      details: { fields },
    },
  });
}

function knownCode(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function foreignKey(error: unknown): string | undefined {
  if (!knownCode(error, 'P2003')) return undefined;
  const meta = error.meta as
    | {
        driverAdapterError?: { cause?: { constraint?: { index?: string } } };
        field_name?: string;
      }
    | undefined;
  // Prisma 7's pg adapter puts PostgreSQL's exact constraint name in cause.constraint.index.
  return meta?.driverAdapterError?.cause?.constraint?.index ?? meta?.field_name;
}

function rethrowWriteRace(error: unknown): never {
  const fk = foreignKey(error);
  if (fk && Object.hasOwn(TARGET_FKS, fk)) {
    throw new ConflictException({
      error: {
        code: 'PROMOTION_TARGET_CHANGED',
        message:
          'A promotion target changed while saving. Reload targets and try again.',
        details: { fields: [TARGET_FKS[fk]] },
      },
    });
  }
  if (knownCode(error, 'P2025')) throw new NotFoundException(NOT_FOUND);
  if (knownCode(error, 'P2034')) throw new ConflictException(CHANGED);
  throw error;
}

function assertVersion(
  row: StaffPromotionRow,
  expectedUpdatedAt?: string,
): void {
  if (
    expectedUpdatedAt !== undefined &&
    new Date(expectedUpdatedAt).getTime() !== row.updatedAt.getTime()
  ) {
    throw new ConflictException(CHANGED);
  }
}

function nextVersion(current: Date): Date {
  // Enforce strict monotonicity even for two writes in the same millisecond.
  return new Date(Math.max(Date.now(), current.getTime() + 1));
}

function targetCreate(config: PromotionConfig) {
  return {
    branches: {
      createMany: { data: config.branchIds.map((branchId) => ({ branchId })) },
    },
    menus: {
      createMany: { data: config.menuIds.map((menuId) => ({ menuId })) },
    },
    categories: {
      createMany: {
        data: config.categoryIds.map((categoryId) => ({ categoryId })),
      },
    },
    products: {
      createMany: {
        data: config.productIds.map((productId) => ({ productId })),
      },
    },
    deliveryZones: {
      createMany: {
        data: config.deliveryZoneIds.map((deliveryZoneId) => ({
          deliveryZoneId,
        })),
      },
    },
  };
}

/** Non-overlapping changes keep Prisma's nested operation ordering immaterial. */
function targetDiff<K extends string>(
  key: K,
  before: readonly string[],
  after: readonly string[],
) {
  const previous = new Set(before);
  const next = new Set(after);
  const removed = before.filter((id) => !next.has(id));
  const added = after.filter((id) => !previous.has(id));
  if (!removed.length && !added.length) return undefined;
  return {
    ...(removed.length ? { deleteMany: { [key]: { in: removed } } } : {}),
    ...(added.length
      ? {
          createMany: {
            data: added.map((id) => ({ [key]: id }) as Record<K, string>),
          },
        }
      : {}),
  };
}

function translationDiff(
  before: readonly PromotionTranslation[],
  after: readonly PromotionTranslation[],
) {
  const previous = new Map(
    before.map((translation) => [translation.locale, translation]),
  );
  return {
    deleteMany: { locale: { notIn: after.map(({ locale }) => locale) } },
    createMany: {
      data: after
        .filter(({ locale }) => !previous.has(locale))
        .map((translation) => ({ ...translation })),
    },
    updateMany: after.flatMap(({ locale, title, description }) => {
      const current = previous.get(locale);
      if (
        !current ||
        (current.title === title && current.description === description)
      )
        return [];
      return [{ where: { locale }, data: { title, description } }];
    }),
  };
}

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string, query: ListPromotionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim().replace(/[\\%_]/g, '\\$&');
    const where: Prisma.PromotionWhereInput = {
      restaurantId,
      status: query.status,
      scope: query.scope,
      ...(query.zoneId
        ? {
            deliveryZones: {
              some: { restaurantId, deliveryZoneId: query.zoneId },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { internalName: { contains: search, mode: 'insensitive' } },
              {
                translations: {
                  some: { title: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.promotion.findMany({
          where,
          select: staffPromotionSelect,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.promotion.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      data: rows.map(toStaffPromotion),
      meta: { page, pageSize, total },
    };
  }

  async get(
    restaurantId: string,
    promotionId: string,
  ): Promise<StaffPromotion> {
    return toStaffPromotion(
      await this.getRow(this.prisma, restaurantId, promotionId),
    );
  }

  async create(
    scope: StaffWriteScope,
    dto: PromotionDraftDto,
  ): Promise<StaffPromotion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { config } = await this.validateDraft(
          tx,
          scope.restaurantId,
          dto,
        );
        const row = await tx.promotion.create({
          data: {
            ...promotionScalarData(config),
            ...targetCreate(config),
            translations: { createMany: { data: [...config.translations] } },
            restaurantId: scope.restaurantId,
            status: 'INACTIVE',
            createdByUserId: scope.userId,
            updatedByUserId: scope.userId,
          },
          select: staffPromotionSelect,
        });
        return toStaffPromotion(row);
      });
    } catch (error) {
      rethrowWriteRace(error);
    }
  }

  async update(
    scope: StaffWriteScope,
    promotionId: string,
    dto: UpdatePromotionDto,
  ): Promise<StaffPromotion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.lockedRow(
          tx,
          scope.restaurantId,
          promotionId,
        );
        assertVersion(current, dto.expectedUpdatedAt);
        if (current.status === 'ARCHIVED')
          throw new ConflictException(ARCHIVED);
        if (
          Object.entries(dto).every(
            ([field, value]) =>
              field === 'expectedUpdatedAt' ||
              field === 'confirmTargetWidening' ||
              value === undefined,
          )
        )
          return toStaffPromotion(current);
        const before = configFromRow(current);
        const config = fromDraft({
          internalName: dto.internalName ?? before.internalName,
          scope: dto.scope ?? before.scope,
          discountType: dto.discountType ?? before.discountType,
          value: dto.value ?? before.value.toFixed(2),
          priority: dto.priority ?? before.priority,
          startsOn: dto.startsOn === undefined ? before.startsOn : dto.startsOn,
          endsOn: dto.endsOn === undefined ? before.endsOn : dto.endsOn,
          minimumSubtotal:
            dto.minimumSubtotal === undefined
              ? before.minimumSubtotal?.toFixed(2)
              : dto.minimumSubtotal,
          minimumQuantity:
            dto.minimumQuantity === undefined
              ? before.minimumQuantity
              : dto.minimumQuantity,
          quantityBasis:
            dto.quantityBasis === undefined
              ? before.quantityBasis
              : dto.quantityBasis,
          branchIds: dto.branchIds ?? [...before.branchIds],
          menuIds: dto.menuIds ?? [...before.menuIds],
          categoryIds: dto.categoryIds ?? [...before.categoryIds],
          productIds: dto.productIds ?? [...before.productIds],
          deliveryZoneIds: dto.deliveryZoneIds ?? [...before.deliveryZoneIds],
          translations: dto.translations ?? [...before.translations],
        });
        const { config: validated } = await this.validateConfig(
          tx,
          scope.restaurantId,
          config,
          before.translations,
        );
        const widening = widenedTargets(before, validated);
        if (widening.length && dto.confirmTargetWidening !== true) {
          throw new ConflictException({
            error: {
              code: 'PROMOTION_TARGET_WIDENING_CONFIRMATION_REQUIRED',
              message:
                'This change can expand who receives the promotion. Confirm the new targets to continue.',
              details: { fields: widening },
            },
          });
        }
        const row = await tx.promotion.update({
          where: { id: current.id, restaurantId: scope.restaurantId },
          data: {
            ...promotionScalarData(validated),
            updatedAt: nextVersion(current.updatedAt),
            updatedByUserId: scope.userId,
            translations:
              dto.translations === undefined
                ? undefined
                : translationDiff(before.translations, validated.translations),
            branches: targetDiff(
              'branchId',
              before.branchIds,
              validated.branchIds,
            ),
            menus: targetDiff('menuId', before.menuIds, validated.menuIds),
            categories: targetDiff(
              'categoryId',
              before.categoryIds,
              validated.categoryIds,
            ),
            products: targetDiff(
              'productId',
              before.productIds,
              validated.productIds,
            ),
            deliveryZones: targetDiff(
              'deliveryZoneId',
              before.deliveryZoneIds,
              validated.deliveryZoneIds,
            ),
          },
          select: staffPromotionSelect,
        });
        return toStaffPromotion(row);
      });
    } catch (error) {
      rethrowWriteRace(error);
    }
  }

  async setStatus(
    scope: StaffWriteScope,
    promotionId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    expectedUpdatedAt?: string,
  ): Promise<StaffPromotion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.lockedRow(
          tx,
          scope.restaurantId,
          promotionId,
        );
        assertVersion(current, expectedUpdatedAt);
        // Even an already archived row should release any links that existed before this API.
        const archiveHasLinks =
          status === 'ARCHIVED' &&
          !!(
            current.branches.length ||
            current.menus.length ||
            current.categories.length ||
            current.products.length ||
            current.deliveryZones.length
          );
        if (status === current.status && !archiveHasLinks)
          return toStaffPromotion(current);
        if (current.status === 'ARCHIVED' && status !== 'ARCHIVED')
          throw new ConflictException(ARCHIVED);
        const config = configFromRow(current);
        if (status === 'ACTIVE')
          await this.validateConfig(
            tx,
            scope.restaurantId,
            config,
            config.translations,
          );
        const updatedAt = nextVersion(current.updatedAt);
        const row = await tx.promotion.update({
          where: { id: current.id, restaurantId: scope.restaurantId },
          data: {
            status,
            updatedAt,
            updatedByUserId: scope.userId,
            ...(status === 'ARCHIVED'
              ? {
                  archivedAt: current.archivedAt ?? updatedAt,
                  // Terminal archive doesn't widen eligibility; detach RESTRICT links so the resources can be deleted.
                  // Past Orders keep their immutable promotion and allocation snapshots.
                  branches: { deleteMany: {} },
                  menus: { deleteMany: {} },
                  categories: { deleteMany: {} },
                  products: { deleteMany: {} },
                  deliveryZones: { deleteMany: {} },
                }
              : {}),
          },
          select: staffPromotionSelect,
        });
        return toStaffPromotion(row);
      });
    } catch (error) {
      rethrowWriteRace(error);
    }
  }

  async remove(restaurantId: string, promotionId: string): Promise<void> {
    if (!isWellFormedUuid(promotionId)) throw new NotFoundException(NOT_FOUND);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.promotion.findUnique({
          where: { id: promotionId, restaurantId },
          select: { id: true, _count: { select: { orderPromotions: true } } },
        });
        if (!current) throw new NotFoundException(NOT_FOUND);
        if (current._count.orderPromotions)
          throw new ConflictException(HAS_HISTORY);
        // An Order may acquire a historical reference between the pre-check and DELETE.
        await tx.promotion.delete({
          where: { id: promotionId, restaurantId },
          select: { id: true },
        });
      });
    } catch (error) {
      if (foreignKey(error) === HISTORY_FK)
        throw new ConflictException(HAS_HISTORY);
      rethrowWriteRace(error);
    }
  }

  validateDraft(
    db: Prisma.TransactionClient,
    restaurantId: string,
    dto: PromotionDraftDto,
  ): Promise<ValidatedDraft> {
    return this.validateConfig(db, restaurantId, fromDraft(dto));
  }

  /** Staff simulation includes configured schedules; the engine decides if each is eligible on the selected Branch date. */
  async loadCandidates(
    db: Prisma.TransactionClient,
    restaurantId: string,
    defaultLocale: string,
  ) {
    const rows = await db.promotion.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: promotionConfigSelect,
      orderBy: { id: 'asc' },
    });
    return rows.map((row) =>
      toPromotionCandidate(
        configFromRow(row),
        row.id,
        row.status,
        defaultLocale,
      ),
    );
  }

  private async getRow(
    db: Prisma.TransactionClient,
    restaurantId: string,
    promotionId: string,
  ): Promise<StaffPromotionRow> {
    if (!isWellFormedUuid(promotionId)) throw new NotFoundException(NOT_FOUND);
    const row = await db.promotion.findUnique({
      where: { id: promotionId, restaurantId },
      select: staffPromotionSelect,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async lockedRow(
    db: Prisma.TransactionClient,
    restaurantId: string,
    promotionId: string,
  ) {
    if (!isWellFormedUuid(promotionId)) throw new NotFoundException(NOT_FOUND);
    // Serialize edits/actions before reading their targets; NO KEY UPDATE permits concurrent history FK inserts.
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM promotions WHERE id = ${promotionId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR NO KEY UPDATE`;
    if (!locked.length) throw new NotFoundException(NOT_FOUND);
    return this.getRow(db, restaurantId, promotionId);
  }

  private async validateConfig(
    db: Prisma.TransactionClient,
    restaurantId: string,
    draft: PromotionConfig,
    existingTranslations: readonly PromotionTranslation[] = [],
  ): Promise<ValidatedDraft> {
    const restaurant = await db.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        defaultLocale: true,
        locales: { where: { isActive: true }, select: { locale: true } },
      },
    });
    if (!restaurant)
      throw new NotFoundException({
        error: {
          code: 'RESTAURANT_NOT_FOUND',
          message: 'Restaurant not found.',
        },
      });
    const active = new Set(restaurant.locales.map(({ locale }) => locale));
    const existing = new Map(
      existingTranslations.map((translation) => [
        translation.locale,
        translation,
      ]),
    );
    const supplied = new Set<string>();
    const problems: Problem[] = validatePromotionInput(
      draft,
      restaurant.defaultLocale,
    );
    for (const { locale, title, description } of draft.translations) {
      if (supplied.has(locale))
        problems.push({
          code: 'TRANSLATION_LOCALE_DUPLICATE',
          field: 'translations',
        });
      supplied.add(locale);
      if (!active.has(locale)) {
        const previous = existing.get(locale);
        if (
          !previous ||
          previous.title !== title ||
          previous.description !== description
        ) {
          problems.push({ code: 'LOCALE_NOT_ACTIVE', field: 'translations' });
        }
      }
    }
    if (problems.length) invalidConfig(problems);
    // Disabling a Restaurant language never deletes its translations; retain any omitted inactive rows.
    const config = {
      ...draft,
      translations: [
        ...draft.translations,
        ...existingTranslations.filter(
          ({ locale }) => !active.has(locale) && !supplied.has(locale),
        ),
      ],
    };
    await this.validateTargets(db, restaurantId, config);
    return { config, defaultLocale: restaurant.defaultLocale };
  }

  private async validateTargets(
    db: Prisma.TransactionClient,
    restaurantId: string,
    config: PromotionConfig,
  ) {
    const ids = (inIds: readonly string[]) => ({
      restaurantId,
      id: { in: [...inIds] },
    });
    const [branches, menus, categories, products, zones] = await Promise.all([
      config.branchIds.length
        ? db.branch.count({ where: ids(config.branchIds) })
        : 0,
      config.menuIds.length ? db.menu.count({ where: ids(config.menuIds) }) : 0,
      config.categoryIds.length
        ? db.category.count({ where: ids(config.categoryIds) })
        : 0,
      config.productIds.length
        ? db.product.count({ where: ids(config.productIds) })
        : 0,
      config.deliveryZoneIds.length
        ? db.deliveryZone.count({
            where: {
              ...ids(config.deliveryZoneIds),
              ...(config.branchIds.length
                ? { branchId: { in: [...config.branchIds] } }
                : {}),
            },
          })
        : 0,
    ]);
    const fields = [
      ['branchIds', branches],
      ['menuIds', menus],
      ['categoryIds', categories],
      ['productIds', products],
      ['deliveryZoneIds', zones],
    ] as const;
    const invalid = fields
      .filter(([field, found]) => found !== config[field].length)
      .map(([field]) => field);
    if (invalid.length) invalidTargets(invalid);
  }
}
