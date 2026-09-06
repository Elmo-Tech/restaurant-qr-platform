import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import type { CategoryStatus } from '../generated/prisma/client';

/** Safe Category translation shape -- never a raw Prisma `CategoryTranslation` row (no `id`/`categoryId`). */
export interface CategoryTranslationView {
  locale: string;
  name: string;
  description: string | null;
}

/** Safe Category shape shared by List and Create. Never `restaurantId`, `createdAt`, `updatedAt`, or a raw Prisma entity. */
export interface CategoryWithTranslation {
  id: string;
  menuId: string;
  status: CategoryStatus;
  displayOrder: number;
  imageAssetPath: string | null;
  translation: CategoryTranslationView;
}

/** The minimum safe authorized scope this query needs -- exactly `request.restaurantAccess.restaurantId`, plus the optional client-supplied `menuId` filter. */
export interface ListCategoriesInput {
  restaurantId: string;
  menuId?: string;
}

/**
 * Client-writable Create Category input, already DTO-validated and
 * normalized. `restaurantId` is the Backend-authorized value from
 * `request.restaurantAccess.restaurantId` -- never client-supplied.
 * `menuId` is client-selected resource identity, NOT tenant authority
 * (settled contract #4) -- resolved with both `id = menuId` AND
 * `restaurantId` in the same query, never trusted alone.
 */
export interface CreateCategoryInput {
  restaurantId: string;
  menuId: string;
  name: string;
  description: string | null;
  status: CategoryStatus;
  displayOrder: number;
}

/**
 * A plain outcome, never an HTTP exception -- the controller alone decides
 * how each outcome maps to its HTTP status/body (mirrors Business
 * Foundation S/T's `AcceptInvitationResult` convention).
 */
export type CreateCategoryResult =
  | { outcome: 'created'; data: CategoryWithTranslation }
  | { outcome: 'menuNotFound' };

/**
 * `categoryId` is the raw, unauthorized `:categoryId` route parameter --
 * every field other than `restaurantId`/`categoryId` is genuinely optional
 * (`undefined` means "omitted, leave unchanged"; `description: null` means
 * "clear this field"), mirroring `UpdateProductInput`'s settled convention
 * exactly. `menuId`, when supplied, moves the Category to another Menu in
 * the same Restaurant -- client-selected resource identity, NOT tenant
 * authority.
 */
export interface UpdateCategoryInput {
  restaurantId: string;
  categoryId: string;
  menuId?: string;
  name?: string;
  description?: string | null;
  status?: CategoryStatus;
  displayOrder?: number;
}

export type UpdateCategoryResult =
  | { outcome: 'updated'; data: CategoryWithTranslation }
  | { outcome: 'categoryNotFound' }
  | { outcome: 'menuNotFound' };

/**
 * Day 1 Menu Vertical Slice, Batch C: Category List and Create.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(
    input: ListCategoriesInput,
  ): Promise<CategoryWithTranslation[]> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    // Tenant-scoped by the query itself regardless of whether the optional
    // menuId filter is present -- a well-formed but foreign-Restaurant
    // menuId never leaks existence; it simply matches zero rows here,
    // identical to any other non-matching value (settled contract #14).
    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId: input.restaurantId,
        ...(input.menuId !== undefined ? { menuId: input.menuId } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        menuId: true,
        status: true,
        displayOrder: true,
        imageAssetPath: true,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { locale: true, name: true, description: true },
          take: 1,
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      menuId: category.menuId,
      status: category.status,
      displayOrder: category.displayOrder,
      imageAssetPath: category.imageAssetPath,
      // Defensive only: Batch C creation is atomic (Category + its
      // default-locale translation always committed together).
      translation: category.translations[0] ?? {
        locale: restaurant.defaultLocale,
        name: '',
        description: null,
      },
    }));
  }

  async createCategory(
    input: CreateCategoryInput,
  ): Promise<CreateCategoryResult> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Menu identity + Tenant check together, before any write (settled
      // contract #4/#11): an unknown or foreign-Restaurant Menu collapses to
      // the identical menuNotFound outcome -- never a distinguishable
      // cross-Tenant existence leak.
      const menu = await tx.menu.findFirst({
        where: { id: input.menuId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!menu) {
        return { outcome: 'menuNotFound' };
      }

      const category = await tx.category.create({
        data: {
          restaurantId: input.restaurantId,
          menuId: menu.id,
          status: input.status,
          displayOrder: input.displayOrder,
          // Batch C never accepts imageAssetPath from ordinary API clients
          // (image upload/storage infrastructure is intentionally deferred,
          // DATABASE_SPEC.md #62A) -- always persisted as null.
          imageAssetPath: null,
        },
        select: {
          id: true,
          menuId: true,
          status: true,
          displayOrder: true,
          imageAssetPath: true,
        },
      });

      const translation = await tx.categoryTranslation.create({
        data: {
          categoryId: category.id,
          locale: restaurant.defaultLocale,
          name: input.name,
          description: input.description,
        },
        select: { locale: true, name: true, description: true },
      });

      return { outcome: 'created', data: { ...category, translation } };
    });
  }

  /**
   * Settled contract (Batch F #7-#10): partial Category configuration
   * update, including moving a Category to another same-Restaurant Menu.
   * `categoryId` identity/ownership and (when supplied) `menuId` target
   * identity/ownership are both resolved with a single combined
   * `id + restaurantId` query each -- never `findUnique({ id })` followed
   * by a separate comparison. An unknown/foreign target Menu leaves the
   * Category entirely unchanged (checked before any write, inside the same
   * transaction). Moving a Category only changes its own `menuId` column --
   * Products remain attached via their own `categoryId` relation and are
   * never rewritten.
   */
  async updateCategory(
    input: UpdateCategoryInput,
  ): Promise<UpdateCategoryResult> {
    if (!isWellFormedUuid(input.categoryId)) {
      return { outcome: 'categoryNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.category.findFirst({
        where: { id: input.categoryId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!existing) {
        return { outcome: 'categoryNotFound' };
      }

      if (input.menuId !== undefined) {
        const menu = await tx.menu.findFirst({
          where: { id: input.menuId, restaurantId: input.restaurantId },
          select: { id: true },
        });
        if (!menu) {
          return { outcome: 'menuNotFound' };
        }
      }

      // Explicit field-by-field `data` object, never a spread of `input` --
      // matches `updateProduct`'s established convention. `restaurantId`/
      // `imageAssetPath` can never appear here at all, since
      // `UpdateCategoryInput` has no such fields.
      const categoryData: {
        menuId?: string;
        status?: CategoryStatus;
        displayOrder?: number;
      } = {};
      if (input.menuId !== undefined) {
        categoryData.menuId = input.menuId;
      }
      if (input.status !== undefined) {
        categoryData.status = input.status;
      }
      if (input.displayOrder !== undefined) {
        categoryData.displayOrder = input.displayOrder;
      }

      // Mirrors `updateProduct`: even an empty `data` object still performs
      // the update call as a safe no-op that returns the current row.
      const updatedCategory = await tx.category.update({
        where: { id: existing.id },
        data: categoryData,
        select: {
          id: true,
          menuId: true,
          status: true,
          displayOrder: true,
          imageAssetPath: true,
        },
      });

      const translationData: { name?: string; description?: string | null } =
        {};
      if (input.name !== undefined) {
        translationData.name = input.name;
      }
      if (input.description !== undefined) {
        translationData.description = input.description;
      }
      if (Object.keys(translationData).length > 0) {
        await tx.categoryTranslation.updateMany({
          where: {
            categoryId: existing.id,
            locale: restaurant.defaultLocale,
          },
          data: translationData,
        });
      }

      const translation = await tx.categoryTranslation.findFirstOrThrow({
        where: { categoryId: existing.id, locale: restaurant.defaultLocale },
        select: { locale: true, name: true, description: true },
      });

      return {
        outcome: 'updated',
        data: { ...updatedCategory, translation },
      };
    });
  }
}
