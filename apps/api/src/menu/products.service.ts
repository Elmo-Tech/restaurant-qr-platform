import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  ProductAvailability,
  ProductStatus,
} from '../generated/prisma/client';
import { createProductPublicId } from './product-public-id';
import { isRestaurantLocaleActive } from './menu-translation.helper';
import type { TranslationView } from './menu-translation.helper';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';

/** Converts a Prisma Decimal (or any Decimal-constructible value) to the exact 2-fractional-digit decimal-string API contract (API_CONVENTIONS.md #48). Never JavaScript floating-point arithmetic. */
function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** Safe Product translation shape -- never a raw Prisma `ProductTranslation` row (no `id`/`productId`). */
export interface ProductTranslationView {
  locale: string;
  name: string;
  description: string | null;
}

/** Safe Product shape shared by List, Create, and Update. Never `restaurantId`, `createdAt`, `updatedAt`, or a raw Prisma entity. */
export interface ProductWithTranslation {
  id: string;
  publicId: string;
  categoryId: string;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: string;
  primaryImageAssetPath: string | null;
  displayOrder: number;
  allowCustomerNotes: boolean;
  featured: boolean;
  translation: ProductTranslationView;
}

interface ProductRowForResponse {
  id: string;
  publicId: string;
  categoryId: string;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: Prisma.Decimal;
  primaryImageAssetPath: string | null;
  displayOrder: number;
  allowCustomerNotes: boolean;
  featured: boolean;
}

/**
 * The single Product safe-response mapper (settled contract #22): every
 * Product-shaped response (List/Create/Update) is built through this one
 * function, never copy-pasted ad-hoc serialization -- guarantees
 * `basePrice` is always the exact 2dp decimal-string contract and that no
 * caller can accidentally leak `restaurantId`/timestamps by widening a
 * `select`.
 */
function toProductWithTranslation(
  product: ProductRowForResponse,
  translation: ProductTranslationView,
): ProductWithTranslation {
  return {
    id: product.id,
    publicId: product.publicId,
    categoryId: product.categoryId,
    status: product.status,
    availability: product.availability,
    basePrice: formatMoney(product.basePrice),
    primaryImageAssetPath: product.primaryImageAssetPath,
    displayOrder: product.displayOrder,
    allowCustomerNotes: product.allowCustomerNotes,
    featured: product.featured,
    translation,
  };
}

const PRODUCT_SAFE_SELECT = {
  id: true,
  publicId: true,
  categoryId: true,
  status: true,
  availability: true,
  basePrice: true,
  primaryImageAssetPath: true,
  displayOrder: true,
  allowCustomerNotes: true,
  featured: true,
} as const;

/** The minimum safe authorized scope this query needs, plus the optional client-supplied `categoryId` filter. */
export interface ListProductsInput {
  restaurantId: string;
  categoryId?: string;
}

/**
 * Client-writable Create Product input, already DTO-validated and
 * normalized. `restaurantId` is the Backend-authorized value from
 * `request.restaurantAccess.restaurantId` -- never client-supplied.
 * `categoryId` is client-selected resource identity, NOT tenant authority --
 * resolved with both `id = categoryId` AND `restaurantId` in the same
 * query, never trusted alone. `basePrice` is the already-validated decimal
 * string (DTO `IsMoneyDecimalString`).
 */
export interface CreateProductInput {
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: string;
  displayOrder: number;
  allowCustomerNotes: boolean;
  featured: boolean;
}

export type CreateProductResult =
  | { outcome: 'created'; data: ProductWithTranslation }
  | { outcome: 'categoryNotFound' };

/**
 * `productId` is the raw, unauthorized `:productId` route parameter --
 * every field other than `restaurantId` is genuinely optional (`undefined`
 * means "omitted, leave unchanged"; `description: null` means "clear this
 * field"), mirroring `UpdateProductDto`'s settled convention exactly.
 */
export interface UpdateProductInput {
  restaurantId: string;
  productId: string;
  categoryId?: string;
  name?: string;
  description?: string | null;
  status?: ProductStatus;
  basePrice?: string;
  displayOrder?: number;
  allowCustomerNotes?: boolean;
  featured?: boolean;
}

export type UpdateProductResult =
  | { outcome: 'updated'; data: ProductWithTranslation }
  | { outcome: 'productNotFound' }
  | { outcome: 'categoryNotFound' };

export interface AuthorizedProductEntityScope {
  restaurantId: string;
  productId: string;
}

export type GetProductTranslationsResult =
  | { outcome: 'found'; data: TranslationView[] }
  | { outcome: 'productNotFound' };

export interface PutProductTranslationInput {
  restaurantId: string;
  productId: string;
  locale: PlatformSupportedLocale;
  name: string;
  description: string | null;
}

export type PutProductTranslationResult =
  | { outcome: 'updated'; data: TranslationView }
  | { outcome: 'productNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteProductTranslationInput {
  restaurantId: string;
  productId: string;
  locale: PlatformSupportedLocale;
}

export type DeleteProductTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

export interface UpdateProductAvailabilityInput {
  restaurantId: string;
  productId: string;
  availability: ProductAvailability;
}

export type UpdateProductAvailabilityResult =
  | {
      outcome: 'updated';
      data: { id: string; availability: ProductAvailability };
    }
  | { outcome: 'productNotFound' };

export interface SetProductImageInput {
  restaurantId: string;
  productId: string;
  imageAssetPath: string;
}

export type SetProductImageResult =
  | {
      outcome: 'updated';
      data: { id: string; primaryImageAssetPath: string };
      /** The Product's previous image, if any -- the controller deletes this local file only AFTER this DB update has actually succeeded (FT-2, Section 10). */
      previousImageAssetPath: string | null;
    }
  | { outcome: 'productNotFound' };

export interface ClearProductImageInput {
  restaurantId: string;
  productId: string;
}

export type ClearProductImageResult =
  | { outcome: 'cleared'; previousImageAssetPath: string | null }
  | { outcome: 'productNotFound' };

/**
 * Day 1 Menu Vertical Slice, Batch D: Product List, Create, generic Update,
 * and the focused Availability Update. Mirrors the exact `MenusService`/
 * `CategoriesService` conventions (Batch C) -- default-locale translation,
 * atomic parent+translation writes, Tenant-scoped identity resolution.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(
    input: ListProductsInput,
  ): Promise<ProductWithTranslation[]> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    // Tenant-scoped by the query itself regardless of whether the optional
    // categoryId filter is present -- a well-formed but foreign-Restaurant
    // categoryId never leaks existence; it simply matches zero rows here,
    // identical to any other non-matching value.
    const products = await this.prisma.product.findMany({
      where: {
        restaurantId: input.restaurantId,
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...PRODUCT_SAFE_SELECT,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { locale: true, name: true, description: true },
          take: 1,
        },
      },
    });

    return products.map((product) =>
      toProductWithTranslation(
        product,
        // Defensive only: Batch D creation is atomic (Product + its
        // default-locale translation always committed together).
        product.translations[0] ?? {
          locale: restaurant.defaultLocale,
          name: '',
          description: null,
        },
      ),
    );
  }

  async createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Category identity + Tenant check together, before any write: an
      // unknown or foreign-Restaurant Category collapses to the identical
      // categoryNotFound outcome -- never a distinguishable cross-Tenant
      // existence leak.
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!category) {
        return { outcome: 'categoryNotFound' };
      }

      const product = await tx.product.create({
        data: {
          restaurantId: input.restaurantId,
          categoryId: category.id,
          publicId: createProductPublicId(),
          status: input.status,
          availability: input.availability,
          basePrice: new Prisma.Decimal(input.basePrice),
          // Image upload/storage infrastructure is intentionally deferred
          // (DATABASE_SPEC.md #62A) -- always persisted as null.
          primaryImageAssetPath: null,
          displayOrder: input.displayOrder,
          allowCustomerNotes: input.allowCustomerNotes,
          featured: input.featured,
        },
        select: PRODUCT_SAFE_SELECT,
      });

      const translation = await tx.productTranslation.create({
        data: {
          productId: product.id,
          locale: restaurant.defaultLocale,
          name: input.name,
          description: input.description,
        },
        select: { locale: true, name: true, description: true },
      });

      return {
        outcome: 'created',
        data: toProductWithTranslation(product, translation),
      };
    });
  }

  async updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
    // A value that isn't even a well-formed UUID can never match any real
    // row (mirrors TablesService's established `isWellFormedUuid`
    // pre-check) -- avoids a `@db.Uuid` column comparison failing at the
    // SQL level rather than simply returning no rows.
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Product identity + Tenant check together, in one query -- never
      // `findUnique({ id })` followed by a separate ownership comparison, so
      // a foreign-Restaurant Product can never even be loaded before being
      // hidden. Selects every field the response needs so the no-op branch
      // below (neither parent nor translation fields supplied) never needs
      // a second read.
      const existing = await tx.product.findFirst({
        where: { id: input.productId, restaurantId: input.restaurantId },
        select: PRODUCT_SAFE_SELECT,
      });
      if (!existing) {
        return { outcome: 'productNotFound' };
      }

      if (input.categoryId !== undefined) {
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, restaurantId: input.restaurantId },
          select: { id: true },
        });
        if (!category) {
          return { outcome: 'categoryNotFound' };
        }
      }

      // Explicit field-by-field `data` object, never a spread of `input` --
      // matches `updateBranch`'s established convention so no future field
      // ever silently becomes persistence authority (`availability`,
      // `publicId`, `restaurantId`, `primaryImageAssetPath` can never
      // appear here, since this DTO/input shape has no such fields at all).
      const productData: {
        categoryId?: string;
        status?: ProductStatus;
        basePrice?: Prisma.Decimal;
        displayOrder?: number;
        allowCustomerNotes?: boolean;
        featured?: boolean;
      } = {};
      if (input.categoryId !== undefined) {
        productData.categoryId = input.categoryId;
      }
      if (input.status !== undefined) {
        productData.status = input.status;
      }
      if (input.basePrice !== undefined) {
        productData.basePrice = new Prisma.Decimal(input.basePrice);
      }
      if (input.displayOrder !== undefined) {
        productData.displayOrder = input.displayOrder;
      }
      if (input.allowCustomerNotes !== undefined) {
        productData.allowCustomerNotes = input.allowCustomerNotes;
      }
      if (input.featured !== undefined) {
        productData.featured = input.featured;
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
      let updatedProduct: typeof existing;
      if (Object.keys(productData).length > 0) {
        updatedProduct = await tx.product.update({
          where: { id: existing.id },
          data: productData,
          select: PRODUCT_SAFE_SELECT,
        });
      } else if (hasTranslationChanges) {
        updatedProduct = await tx.product.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: PRODUCT_SAFE_SELECT,
        });
      } else {
        updatedProduct = existing;
      }

      if (hasTranslationChanges) {
        await tx.productTranslation.updateMany({
          where: {
            productId: existing.id,
            locale: restaurant.defaultLocale,
          },
          data: translationData,
        });
      }

      // Always re-read the current default-locale translation for the
      // response, whether or not it was just modified -- Update returns the
      // complete current safe Product shape (settled contract #18).
      const translation = await tx.productTranslation.findFirstOrThrow({
        where: { productId: existing.id, locale: restaurant.defaultLocale },
        select: { locale: true, name: true, description: true },
      });

      return {
        outcome: 'updated',
        data: toProductWithTranslation(updatedProduct, translation),
      };
    });
  }

  async updateAvailability(
    input: UpdateProductAvailabilityInput,
  ): Promise<UpdateProductAvailabilityResult> {
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    const existing = await this.prisma.product.findFirst({
      where: { id: input.productId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!existing) {
      return { outcome: 'productNotFound' };
    }

    // Changes ONLY Product.availability -- status/price/category/
    // translation/featured/allowCustomerNotes/primaryImageAssetPath are
    // never touched by this focused endpoint.
    const updated = await this.prisma.product.update({
      where: { id: existing.id },
      data: { availability: input.availability },
      select: { id: true, availability: true },
    });

    return { outcome: 'updated', data: updated };
  }

  /**
   * FT-2 code review blocker: a Tenant-scoped existence/ownership preflight
   * used ONLY to gate whether an uploaded image is even written to disk --
   * the controller calls this BEFORE `ImageStorageService.saveImage` so a
   * foreign or unknown Product never causes a file to be saved at all
   * (previously the file was saved first and only cleaned up after
   * `setProductImage` separately discovered the Product wasn't authorized).
   * `setProductImage`/`clearProductImage` keep their own identical scoped
   * lookup for write-time race safety -- this is an additional early gate,
   * not a replacement for it.
   */
  async productExists(scope: AuthorizedProductEntityScope): Promise<boolean> {
    if (!isWellFormedUuid(scope.productId)) {
      return false;
    }

    const product = await this.prisma.product.findFirst({
      where: { id: scope.productId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    return product !== null;
  }

  /**
   * FT-2: persists a newly-saved local image asset path as the Product's
   * primary image, replacing any existing one. This method never touches
   * the filesystem itself (`ImageStorageService` already saved the new file
   * before this is called) -- it only reports the previous
   * `primaryImageAssetPath` so the controller can remove that now-replaced
   * local file AFTER this DB write has actually committed (Section 10:
   * never delete the old file first, in case the DB update fails).
   */
  async setProductImage(
    input: SetProductImageInput,
  ): Promise<SetProductImageResult> {
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    const existing = await this.prisma.product.findFirst({
      where: { id: input.productId, restaurantId: input.restaurantId },
      select: { id: true, primaryImageAssetPath: true },
    });
    if (!existing) {
      return { outcome: 'productNotFound' };
    }

    const updated = await this.prisma.product.update({
      where: { id: existing.id },
      data: { primaryImageAssetPath: input.imageAssetPath },
      select: { id: true, primaryImageAssetPath: true },
    });

    return {
      outcome: 'updated',
      data: { id: updated.id, primaryImageAssetPath: input.imageAssetPath },
      previousImageAssetPath: existing.primaryImageAssetPath,
    };
  }

  /**
   * FT-2: clears the Product's primary image. Idempotent -- if
   * `primaryImageAssetPath` is already `null`, no write happens, and the
   * (also `null`) `previousImageAssetPath` tells the controller there is no
   * local file to remove.
   */
  async clearProductImage(
    input: ClearProductImageInput,
  ): Promise<ClearProductImageResult> {
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    const existing = await this.prisma.product.findFirst({
      where: { id: input.productId, restaurantId: input.restaurantId },
      select: { id: true, primaryImageAssetPath: true },
    });
    if (!existing) {
      return { outcome: 'productNotFound' };
    }

    if (existing.primaryImageAssetPath !== null) {
      await this.prisma.product.update({
        where: { id: existing.id },
        data: { primaryImageAssetPath: null },
      });
    }

    return {
      outcome: 'cleared',
      previousImageAssetPath: existing.primaryImageAssetPath,
    };
  }

  /**
   * LOC-2B: returns EVERY existing `ProductTranslation` row for an
   * authorized Product, raw -- see `MenusService.getMenuTranslations`'s
   * docstring for the full rationale (identical shape/behavior). Pure read:
   * never writes.
   */
  async getProductTranslations(
    scope: AuthorizedProductEntityScope,
  ): Promise<GetProductTranslationsResult> {
    if (!isWellFormedUuid(scope.productId)) {
      return { outcome: 'productNotFound' };
    }

    const product = await this.prisma.product.findFirst({
      where: { id: scope.productId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!product) {
      return { outcome: 'productNotFound' };
    }

    const translations = await this.prisma.productTranslation.findMany({
      where: { productId: product.id },
      select: { locale: true, name: true, description: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  /**
   * LOC-2B: full replacement of one Product Translation resource -- see
   * `MenusService.putMenuTranslation`'s docstring for the full rationale
   * (identical shape/behavior).
   */
  async putProductTranslation(
    input: PutProductTranslationInput,
  ): Promise<PutProductTranslationResult> {
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!product) {
        return { outcome: 'productNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(
        tx,
        input.restaurantId,
        input.locale,
      );
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.productTranslation.findUnique({
        where: {
          productId_locale: { productId: product.id, locale: input.locale },
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

      await tx.productTranslation.upsert({
        where: {
          productId_locale: { productId: product.id, locale: input.locale },
        },
        create: {
          productId: product.id,
          locale: input.locale,
          name: input.name,
          description: input.description,
        },
        update: { name: input.name, description: input.description },
      });

      await tx.product.update({
        where: { id: product.id },
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
   * LOC-2B: deletes one Product Translation resource -- see
   * `MenusService.deleteMenuTranslation`'s docstring for the full rationale
   * (identical shape/behavior).
   */
  async deleteProductTranslation(
    input: DeleteProductTranslationInput,
  ): Promise<DeleteProductTranslationResult> {
    if (!isWellFormedUuid(input.productId)) {
      return { outcome: 'productNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!product) {
        return { outcome: 'productNotFound' };
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

      const deleted = await tx.productTranslation.deleteMany({
        where: { productId: product.id, locale: input.locale },
      });

      if (deleted.count > 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { updatedAt: new Date() },
        });
      }

      return { outcome: 'deleted' };
    });
  }
}
