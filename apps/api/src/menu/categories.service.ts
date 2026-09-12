import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import type { CategoryStatus } from '../generated/prisma/client';
import { isRestaurantLocaleActive } from './menu-translation.helper';
import type { TranslationView } from './menu-translation.helper';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';

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

export interface AuthorizedCategoryEntityScope {
  restaurantId: string;
  categoryId: string;
}

export type GetCategoryTranslationsResult =
  | { outcome: 'found'; data: TranslationView[] }
  | { outcome: 'categoryNotFound' };

export interface PutCategoryTranslationInput {
  restaurantId: string;
  categoryId: string;
  locale: PlatformSupportedLocale;
  name: string;
  description: string | null;
}

export type PutCategoryTranslationResult =
  | { outcome: 'updated'; data: TranslationView }
  | { outcome: 'categoryNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteCategoryTranslationInput {
  restaurantId: string;
  categoryId: string;
  locale: PlatformSupportedLocale;
}

export type DeleteCategoryTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'categoryNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

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
        select: {
          id: true,
          menuId: true,
          status: true,
          displayOrder: true,
          imageAssetPath: true,
        },
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

      const translationData: { name?: string; description?: string | null } =
        {};
      if (input.name !== undefined) {
        translationData.name = input.name;
      }
      if (input.description !== undefined) {
        translationData.description = input.description;
      }
      const hasTranslationChanges = Object.keys(translationData).length > 0;

      // Corrected (LOC-2B code review): an empty `data: {}` update does not
      // refresh Prisma's `@updatedAt` -- the explicit touch below runs ONLY
      // when no parent field changed but the default-locale translation
      // content genuinely did; a real parent-field update already moves
      // `updatedAt` on its own, and a fully empty body stays a true no-op
      // (zero writes, `existing` reused for the response).
      let updatedCategory: typeof existing;
      if (Object.keys(categoryData).length > 0) {
        updatedCategory = await tx.category.update({
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
      } else if (hasTranslationChanges) {
        updatedCategory = await tx.category.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: {
            id: true,
            menuId: true,
            status: true,
            displayOrder: true,
            imageAssetPath: true,
          },
        });
      } else {
        updatedCategory = existing;
      }

      if (hasTranslationChanges) {
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

  /**
   * LOC-2B: returns EVERY existing `CategoryTranslation` row for an
   * authorized Category, raw -- see `MenusService.getMenuTranslations`'s
   * docstring for the full rationale (identical shape/behavior). Pure read:
   * never writes.
   */
  async getCategoryTranslations(
    scope: AuthorizedCategoryEntityScope,
  ): Promise<GetCategoryTranslationsResult> {
    if (!isWellFormedUuid(scope.categoryId)) {
      return { outcome: 'categoryNotFound' };
    }

    const category = await this.prisma.category.findFirst({
      where: { id: scope.categoryId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!category) {
      return { outcome: 'categoryNotFound' };
    }

    const translations = await this.prisma.categoryTranslation.findMany({
      where: { categoryId: category.id },
      select: { locale: true, name: true, description: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  /**
   * LOC-2B: full replacement of one Category Translation resource -- see
   * `MenusService.putMenuTranslation`'s docstring for the full rationale
   * (identical shape/behavior).
   */
  async putCategoryTranslation(
    input: PutCategoryTranslationInput,
  ): Promise<PutCategoryTranslationResult> {
    if (!isWellFormedUuid(input.categoryId)) {
      return { outcome: 'categoryNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!category) {
        return { outcome: 'categoryNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(
        tx,
        input.restaurantId,
        input.locale,
      );
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.categoryTranslation.findUnique({
        where: {
          categoryId_locale: { categoryId: category.id, locale: input.locale },
        },
        select: { name: true, description: true },
      });

      const isNoOp =
        existing !== null &&
        existing.name === input.name &&
        existing.description === input.description;
      if (isNoOp) {
        return {
          outcome: 'updated',
          data: {
            locale: input.locale,
            name: existing.name,
            description: existing.description,
          },
        };
      }

      await tx.categoryTranslation.upsert({
        where: {
          categoryId_locale: { categoryId: category.id, locale: input.locale },
        },
        create: {
          categoryId: category.id,
          locale: input.locale,
          name: input.name,
          description: input.description,
        },
        update: { name: input.name, description: input.description },
      });

      await tx.category.update({
        where: { id: category.id },
        data: { updatedAt: new Date() },
      });

      return {
        outcome: 'updated',
        data: {
          locale: input.locale,
          name: input.name,
          description: input.description,
        },
      };
    });
  }

  /**
   * LOC-2B: deletes one Category Translation resource -- see
   * `MenusService.deleteMenuTranslation`'s docstring for the full rationale
   * (identical shape/behavior).
   */
  async deleteCategoryTranslation(
    input: DeleteCategoryTranslationInput,
  ): Promise<DeleteCategoryTranslationResult> {
    if (!isWellFormedUuid(input.categoryId)) {
      return { outcome: 'categoryNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!category) {
        return { outcome: 'categoryNotFound' };
      }

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });
      if (input.locale === restaurant.defaultLocale) {
        return { outcome: 'defaultTranslationRequired' };
      }

      const localeActive = await isRestaurantLocaleActive(
        tx,
        input.restaurantId,
        input.locale,
      );
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const deleted = await tx.categoryTranslation.deleteMany({
        where: { categoryId: category.id, locale: input.locale },
      });

      if (deleted.count > 0) {
        await tx.category.update({
          where: { id: category.id },
          data: { updatedAt: new Date() },
        });
      }

      return { outcome: 'deleted' };
    });
  }
}
