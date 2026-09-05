import { Injectable } from '@nestjs/common';
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
}
