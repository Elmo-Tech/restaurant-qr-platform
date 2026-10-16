import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ProductVariantStatus } from '../generated/prisma/client';
import { isRestaurantLocaleActive } from './menu-translation.helper';

/** Product Variants V1 (DEC-041): Staff configuration of a Product's sizes. */

/** Decimal -> the exact 2-fractional-digit string API contract. Never floating point. */
function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export interface ProductVariantView {
  id: string;
  status: ProductVariantStatus;
  /** Restaurant default-locale name. */
  name: string;
  /** The full price of this size. */
  price: string;
  displayOrder: number;
  isDefault: boolean;
  /** Does the Product discount apply to this size (all sizes by default)? */
  discountApplies: boolean;
  /** True only while no Order has ever referenced this Variant. */
  canDelete: boolean;
}

export interface ProductVariantTranslationView {
  locale: string;
  name: string;
}

export interface AuthorizedProductScope {
  restaurantId: string;
  productId: string;
}

export interface AuthorizedVariantScope extends AuthorizedProductScope {
  variantId: string;
}

export interface CreateProductVariantInput extends AuthorizedProductScope {
  name: string;
  status: ProductVariantStatus;
  price: string;
  displayOrder: number;
  isDefault: boolean;
  discountApplies: boolean;
}

export interface UpdateProductVariantInput extends AuthorizedVariantScope {
  name?: string;
  status?: ProductVariantStatus;
  price?: string;
  displayOrder?: number;
  isDefault?: boolean;
  discountApplies?: boolean;
}

export interface ReorderProductVariantsInput extends AuthorizedProductScope {
  variantIds: string[];
}

export interface PutVariantTranslationInput extends AuthorizedVariantScope {
  locale: string;
  name: string;
}

export interface DeleteVariantTranslationInput extends AuthorizedVariantScope {
  locale: string;
}

export type ListProductVariantsResult =
  | { outcome: 'found'; data: ProductVariantView[] }
  | { outcome: 'productNotFound' };

export type CreateProductVariantResult =
  | { outcome: 'created'; data: ProductVariantView }
  | { outcome: 'productNotFound' }
  | { outcome: 'defaultMustBeActive' }
  | { outcome: 'defaultConflict' };

export type UpdateProductVariantResult =
  | { outcome: 'updated'; data: ProductVariantView }
  | { outcome: 'productNotFound' }
  | { outcome: 'variantNotFound' }
  | { outcome: 'defaultMustBeActive' }
  | { outcome: 'defaultConflict' };

export type DeleteProductVariantResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'variantNotFound' }
  | { outcome: 'hasHistoricalReferences' };

export type ReorderProductVariantsResult =
  | { outcome: 'reordered'; data: { variantIds: string[] } }
  | { outcome: 'productNotFound' }
  | { outcome: 'orderMismatch' };

export type GetVariantTranslationsResult =
  | { outcome: 'found'; data: ProductVariantTranslationView[] }
  | { outcome: 'productNotFound' }
  | { outcome: 'variantNotFound' };

export type PutVariantTranslationResult =
  | { outcome: 'updated'; data: ProductVariantTranslationView }
  | { outcome: 'productNotFound' }
  | { outcome: 'variantNotFound' }
  | { outcome: 'localeNotActive' };

export type DeleteVariantTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'variantNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

const VARIANT_SAFE_SELECT = {
  id: true,
  status: true,
  price: true,
  displayOrder: true,
  isDefault: true,
  discountApplies: true,
} as const;

type VariantRow = Prisma.ProductVariantGetPayload<{
  select: typeof VARIANT_SAFE_SELECT;
}>;

/**
 * Product.basePrice always equals the cheapest ACTIVE size, so product lists,
 * the "from" price and every reader of basePrice stay correct without knowing
 * about sizes. Called inside the same transaction as every size change.
 */
async function syncProductBasePrice(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  const cheapest = await tx.productVariant.aggregate({
    where: { productId, status: 'ACTIVE' },
    _min: { price: true },
  });
  if (cheapest._min.price !== null) {
    await tx.product.update({
      where: { id: productId },
      data: { basePrice: cheapest._min.price },
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

function toView(
  row: VariantRow,
  name: string,
  canDelete: boolean,
): ProductVariantView {
  return {
    id: row.id,
    status: row.status,
    name,
    price: formatMoney(row.price),
    displayOrder: row.displayOrder,
    isDefault: row.isDefault,
    discountApplies: row.discountApplies,
    canDelete,
  };
}

@Injectable()
export class ProductVariantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-scoped product lookup: a foreign or unknown Product is indistinguishable. */
  private async findProduct(scope: AuthorizedProductScope) {
    if (!isWellFormedUuid(scope.productId)) return null;
    return this.prisma.product.findFirst({
      where: { id: scope.productId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
  }

  private async findVariant(
    tx: Prisma.TransactionClient | PrismaService,
    scope: AuthorizedVariantScope,
    productId: string,
  ) {
    if (!isWellFormedUuid(scope.variantId)) return null;
    return tx.productVariant.findFirst({
      where: {
        id: scope.variantId,
        productId,
        restaurantId: scope.restaurantId,
      },
      select: VARIANT_SAFE_SELECT,
    });
  }

  async listVariants(
    scope: AuthorizedProductScope,
  ): Promise<ListProductVariantsResult> {
    const product = await this.findProduct(scope);
    if (!product) return { outcome: 'productNotFound' };

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });
    const rows = await this.prisma.productVariant.findMany({
      where: { productId: product.id, restaurantId: scope.restaurantId },
      select: {
        ...VARIANT_SAFE_SELECT,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { name: true },
        },
        _count: { select: { orderItems: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      outcome: 'found',
      data: rows.map((row) =>
        toView(
          row,
          row.translations[0]?.name ?? '',
          row._count.orderItems === 0,
        ),
      ),
    };
  }

  async createVariant(
    input: CreateProductVariantInput,
  ): Promise<CreateProductVariantResult> {
    const product = await this.findProduct(input);
    if (!product) return { outcome: 'productNotFound' };

    if (input.isDefault && input.status !== 'ACTIVE') {
      return { outcome: 'defaultMustBeActive' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    try {
      const view = await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.productVariant.updateMany({
            where: { productId: product.id, isDefault: true },
            data: { isDefault: false },
          });
        }
        const created = await tx.productVariant.create({
          data: {
            restaurantId: input.restaurantId,
            productId: product.id,
            status: input.status,
            price: new Prisma.Decimal(input.price),
            displayOrder: input.displayOrder,
            isDefault: input.isDefault,
            discountApplies: input.discountApplies,
          },
          select: VARIANT_SAFE_SELECT,
        });
        await tx.productVariantTranslation.create({
          data: {
            productVariantId: created.id,
            locale: restaurant.defaultLocale,
            name: input.name,
          },
        });
        await syncProductBasePrice(tx, product.id);
        return toView(created, input.name, true);
      });
      return { outcome: 'created', data: view };
    } catch (error) {
      // Two concurrent "make default" requests: the partial unique index is the backstop.
      if (isUniqueConstraintError(error)) return { outcome: 'defaultConflict' };
      throw error;
    }
  }

  async updateVariant(
    input: UpdateProductVariantInput,
  ): Promise<UpdateProductVariantResult> {
    const product = await this.findProduct(input);
    if (!product) return { outcome: 'productNotFound' };

    try {
      return await this.prisma.$transaction(
        async (tx): Promise<UpdateProductVariantResult> => {
          const existing = await this.findVariant(tx, input, product.id);
          if (!existing) return { outcome: 'variantNotFound' };

          const nextStatus = input.status ?? existing.status;
          // Deactivating the default clears it; an explicit "make default" on an
          // inactive Variant is refused (only an ACTIVE Variant can be the default).
          if (input.isDefault === true && nextStatus !== 'ACTIVE') {
            return { outcome: 'defaultMustBeActive' };
          }
          const nextDefault =
            nextStatus !== 'ACTIVE'
              ? false
              : (input.isDefault ?? existing.isDefault);

          if (nextDefault && !existing.isDefault) {
            await tx.productVariant.updateMany({
              where: {
                productId: product.id,
                isDefault: true,
                id: { not: existing.id },
              },
              data: { isDefault: false },
            });
          }

          const data: Prisma.ProductVariantUpdateInput = {};
          if (input.status !== undefined) data.status = input.status;
          if (input.price !== undefined) {
            data.price = new Prisma.Decimal(input.price);
          }
          if (input.displayOrder !== undefined)
            data.displayOrder = input.displayOrder;
          if (nextDefault !== existing.isDefault) data.isDefault = nextDefault;
          if (input.discountApplies !== undefined)
            data.discountApplies = input.discountApplies;

          const restaurant = await tx.restaurant.findUniqueOrThrow({
            where: { id: input.restaurantId },
            select: { defaultLocale: true },
          });
          if (input.name !== undefined) {
            await tx.productVariantTranslation.upsert({
              where: {
                productVariantId_locale: {
                  productVariantId: existing.id,
                  locale: restaurant.defaultLocale,
                },
              },
              create: {
                productVariantId: existing.id,
                locale: restaurant.defaultLocale,
                name: input.name,
              },
              update: { name: input.name },
            });
            // Touch the parent so `updatedAt` reflects a name-only edit.
            if (Object.keys(data).length === 0) data.updatedAt = new Date();
          }

          const updated =
            Object.keys(data).length > 0
              ? await tx.productVariant.update({
                  where: { id: existing.id },
                  data,
                  select: VARIANT_SAFE_SELECT,
                })
              : existing;

          await syncProductBasePrice(tx, product.id);
          const translation = await tx.productVariantTranslation.findUnique({
            where: {
              productVariantId_locale: {
                productVariantId: existing.id,
                locale: restaurant.defaultLocale,
              },
            },
            select: { name: true },
          });
          const references = await tx.orderItem.count({
            where: { variantId: existing.id },
          });
          return {
            outcome: 'updated',
            data: toView(updated, translation?.name ?? '', references === 0),
          };
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) return { outcome: 'defaultConflict' };
      throw error;
    }
  }

  /**
   * Hard delete only while no Order references the Variant (historical safety);
   * otherwise the caller deactivates it. The Prisma P2003 catch is the
   * concurrency backstop for an Order created between the check and the delete.
   */
  async deleteVariant(
    scope: AuthorizedVariantScope,
  ): Promise<DeleteProductVariantResult> {
    const product = await this.findProduct(scope);
    if (!product) return { outcome: 'productNotFound' };

    try {
      return await this.prisma.$transaction(
        async (tx): Promise<DeleteProductVariantResult> => {
          const existing = await this.findVariant(tx, scope, product.id);
          if (!existing) return { outcome: 'variantNotFound' };
          if (
            (await tx.orderItem.count({ where: { variantId: existing.id } })) >
            0
          ) {
            return { outcome: 'hasHistoricalReferences' };
          }
          await tx.productVariant.delete({ where: { id: existing.id } });
          await syncProductBasePrice(tx, product.id);
          return { outcome: 'deleted' };
        },
      );
    } catch (error) {
      if (isForeignKeyConstraintError(error))
        return { outcome: 'hasHistoricalReferences' };
      throw error;
    }
  }

  /**
   * Staff reorder of one Product's Variants. All-or-nothing; `orderMismatch`
   * unless `variantIds` is exactly the Product's current Variants.
   */
  async reorderVariants(
    input: ReorderProductVariantsInput,
  ): Promise<ReorderProductVariantsResult> {
    const product = await this.findProduct(input);
    if (!product) return { outcome: 'productNotFound' };

    return this.prisma.$transaction(
      async (tx): Promise<ReorderProductVariantsResult> => {
        const current = await tx.productVariant.findMany({
          where: { productId: product.id, restaurantId: input.restaurantId },
          select: { id: true, displayOrder: true },
        });
        const currentIds = new Set(current.map((row) => row.id));
        const sameSet =
          input.variantIds.length === currentIds.size &&
          input.variantIds.every((id) => currentIds.has(id));
        if (!sameSet) return { outcome: 'orderMismatch' };

        const orderById = new Map(
          current.map((row) => [row.id, row.displayOrder]),
        );
        for (const [position, id] of input.variantIds.entries()) {
          if (orderById.get(id) === position) continue;
          await tx.productVariant.update({
            where: { id },
            data: { displayOrder: position },
          });
        }
        return { outcome: 'reordered', data: { variantIds: input.variantIds } };
      },
    );
  }

  async getTranslations(
    scope: AuthorizedVariantScope,
  ): Promise<GetVariantTranslationsResult> {
    const product = await this.findProduct(scope);
    if (!product) return { outcome: 'productNotFound' };
    const variant = await this.findVariant(this.prisma, scope, product.id);
    if (!variant) return { outcome: 'variantNotFound' };

    const translations = await this.prisma.productVariantTranslation.findMany({
      where: { productVariantId: variant.id },
      select: { locale: true, name: true },
      orderBy: { locale: 'asc' },
    });
    return { outcome: 'found', data: translations };
  }

  async putTranslation(
    input: PutVariantTranslationInput,
  ): Promise<PutVariantTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) return { outcome: 'productNotFound' };

    return this.prisma.$transaction(
      async (tx): Promise<PutVariantTranslationResult> => {
        const variant = await this.findVariant(tx, input, product.id);
        if (!variant) return { outcome: 'variantNotFound' };
        if (
          !(await isRestaurantLocaleActive(
            tx,
            input.restaurantId,
            input.locale,
          ))
        ) {
          return { outcome: 'localeNotActive' };
        }

        const where = {
          productVariantId_locale: {
            productVariantId: variant.id,
            locale: input.locale,
          },
        };
        const existing = await tx.productVariantTranslation.findUnique({
          where,
          select: { name: true },
        });
        if (existing && existing.name === input.name) {
          return {
            outcome: 'updated',
            data: { locale: input.locale, name: existing.name },
          };
        }
        await tx.productVariantTranslation.upsert({
          where,
          create: {
            productVariantId: variant.id,
            locale: input.locale,
            name: input.name,
          },
          update: { name: input.name },
        });
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { updatedAt: new Date() },
        });
        return {
          outcome: 'updated',
          data: { locale: input.locale, name: input.name },
        };
      },
    );
  }

  async deleteTranslation(
    input: DeleteVariantTranslationInput,
  ): Promise<DeleteVariantTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) return { outcome: 'productNotFound' };

    return this.prisma.$transaction(
      async (tx): Promise<DeleteVariantTranslationResult> => {
        const variant = await this.findVariant(tx, input, product.id);
        if (!variant) return { outcome: 'variantNotFound' };

        const restaurant = await tx.restaurant.findUniqueOrThrow({
          where: { id: input.restaurantId },
          select: { defaultLocale: true },
        });
        if (input.locale === restaurant.defaultLocale)
          return { outcome: 'defaultTranslationRequired' };
        if (
          !(await isRestaurantLocaleActive(
            tx,
            input.restaurantId,
            input.locale,
          ))
        ) {
          return { outcome: 'localeNotActive' };
        }

        const deleted = await tx.productVariantTranslation.deleteMany({
          where: { productVariantId: variant.id, locale: input.locale },
        });
        if (deleted.count > 0) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { updatedAt: new Date() },
          });
        }
        return { outcome: 'deleted' };
      },
    );
  }
}
