import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  ModifierGroupStatus,
  ModifierOptionStatus,
} from '../generated/prisma/client';
import { isRestaurantLocaleActive } from './menu-translation.helper';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';

/** Converts a Prisma Decimal to the exact 2-fractional-digit decimal-string API contract (API_CONVENTIONS.md #48). Never JavaScript floating-point arithmetic. */
function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export interface ModifierOptionView {
  id: string;
  status: ModifierOptionStatus;
  name: string;
  priceAdjustment: string;
  displayOrder: number;
}

export interface ModifierGroupView {
  id: string;
  status: ModifierGroupStatus;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
  options: ModifierOptionView[];
}

export interface AuthorizedProductScope {
  restaurantId: string;
  productId: string;
}

export interface AuthorizedGroupScope extends AuthorizedProductScope {
  groupId: string;
}

export interface AuthorizedOptionScope extends AuthorizedGroupScope {
  optionId: string;
}

export type ListModifierGroupsResult =
  | { outcome: 'found'; data: ModifierGroupView[] }
  | { outcome: 'productNotFound' };

export interface CreateModifierGroupInput extends AuthorizedProductScope {
  name: string;
  helperText: string | null;
  status: ModifierGroupStatus;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
}

export type CreateModifierGroupResult =
  | { outcome: 'created'; data: ModifierGroupView }
  | { outcome: 'productNotFound' }
  | { outcome: 'invalidSelectionRange' };

export interface UpdateModifierGroupInput extends AuthorizedGroupScope {
  name?: string;
  helperText?: string | null;
  status?: ModifierGroupStatus;
  minimumSelections?: number;
  maximumSelections?: number;
  displayOrder?: number;
}

export type UpdateModifierGroupResult =
  | { outcome: 'updated'; data: ModifierGroupView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'invalidSelectionRange' };

export interface CreateModifierOptionInput extends AuthorizedGroupScope {
  name: string;
  status: ModifierOptionStatus;
  priceAdjustment: string;
  displayOrder: number;
}

export type CreateModifierOptionResult =
  | { outcome: 'created'; data: ModifierOptionView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' };

export interface UpdateModifierOptionInput extends AuthorizedOptionScope {
  name?: string;
  status?: ModifierOptionStatus;
  priceAdjustment?: string;
  displayOrder?: number;
}

export type UpdateModifierOptionResult =
  | { outcome: 'updated'; data: ModifierOptionView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'optionNotFound' };

/** FT-6A closeout: mirrors `TranslationView` (Menu/Category/Product) exactly, except the second content field is `helperText`, matching `ModifierGroupTranslation`'s own schema field name. */
export interface ModifierGroupTranslationView {
  locale: string;
  name: string;
  helperText: string | null;
}

/** ModifierOptionTranslation has no second content field at all (DATABASE_SPEC.md #77) -- `name` only. */
export interface ModifierOptionTranslationView {
  locale: string;
  name: string;
}

export type GetModifierGroupTranslationsResult =
  | { outcome: 'found'; data: ModifierGroupTranslationView[] }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' };

export interface PutModifierGroupTranslationInput extends AuthorizedGroupScope {
  locale: PlatformSupportedLocale;
  name: string;
  helperText: string | null;
}

export type PutModifierGroupTranslationResult =
  | { outcome: 'updated'; data: ModifierGroupTranslationView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteModifierGroupTranslationInput extends AuthorizedGroupScope {
  locale: PlatformSupportedLocale;
}

export type DeleteModifierGroupTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

export type GetModifierOptionTranslationsResult =
  | { outcome: 'found'; data: ModifierOptionTranslationView[] }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'optionNotFound' };

export interface PutModifierOptionTranslationInput extends AuthorizedOptionScope {
  locale: PlatformSupportedLocale;
  name: string;
}

export type PutModifierOptionTranslationResult =
  | { outcome: 'updated'; data: ModifierOptionTranslationView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'optionNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteModifierOptionTranslationInput extends AuthorizedOptionScope {
  locale: PlatformSupportedLocale;
}

export type DeleteModifierOptionTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'optionNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

const OPTION_SAFE_SELECT = {
  id: true,
  status: true,
  priceAdjustment: true,
  displayOrder: true,
} as const;

const GROUP_SAFE_SELECT = {
  id: true,
  status: true,
  minimumSelections: true,
  maximumSelections: true,
  displayOrder: true,
} as const;

/**
 * FT-6A (closeout: full EN/AR localization added): Staff configuration of
 * Modifier Groups/Options on a Product. Mirrors `ProductsService`'s exact
 * conventions -- Tenant-scoped identity resolution (foreign/unknown
 * Product/Group/Option all converge on their respective `*NotFound`
 * outcome, never a distinguishable reason), atomic parent+translation
 * writes. Create/Update write the Restaurant's default-locale translation
 * directly (mirrors `CreateProductDto.name`); every other active locale is
 * managed through the dedicated `get/put/deleteModifier{Group,Option}
 * Translation` methods below, exactly like Menu/Category/Product's own
 * `translations/:locale` resource. Deletion is never a hard DELETE -- only
 * the `status` field, mirroring Product/Category (DATABASE_SPEC.md #58
 * "must not be destructively removed in a way that breaks history").
 */
@Injectable()
export class ModifiersService {
  constructor(private readonly prisma: PrismaService) {}

  private async findProduct(scope: AuthorizedProductScope) {
    if (!isWellFormedUuid(scope.productId)) {
      return null;
    }
    return this.prisma.product.findFirst({
      where: { id: scope.productId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
  }

  async listModifierGroups(
    scope: AuthorizedProductScope,
  ): Promise<ListModifierGroupsResult> {
    const product = await this.findProduct(scope);
    if (!product) {
      return { outcome: 'productNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });

    const groups = await this.prisma.modifierGroup.findMany({
      where: { productId: product.id, restaurantId: scope.restaurantId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...GROUP_SAFE_SELECT,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { name: true, helperText: true },
          take: 1,
        },
        options: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            ...OPTION_SAFE_SELECT,
            translations: {
              where: { locale: restaurant.defaultLocale },
              select: { name: true },
              take: 1,
            },
          },
        },
      },
    });

    return {
      outcome: 'found',
      data: groups.map((group) => this.toGroupView(group)),
    };
  }

  async createModifierGroup(
    input: CreateModifierGroupInput,
  ): Promise<CreateModifierGroupResult> {
    if (input.maximumSelections < input.minimumSelections) {
      return { outcome: 'invalidSelectionRange' };
    }

    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierGroup.create({
        data: {
          restaurantId: input.restaurantId,
          productId: product.id,
          status: input.status,
          minimumSelections: input.minimumSelections,
          maximumSelections: input.maximumSelections,
          displayOrder: input.displayOrder,
        },
        select: GROUP_SAFE_SELECT,
      });

      const translation = await tx.modifierGroupTranslation.create({
        data: {
          modifierGroupId: created.id,
          locale: restaurant.defaultLocale,
          name: input.name,
          helperText: input.helperText,
        },
        select: { name: true, helperText: true },
      });

      return { ...created, translations: [translation], options: [] };
    });

    return { outcome: 'created', data: this.toGroupView(group) };
  }

  async updateModifierGroup(
    input: UpdateModifierGroupInput,
  ): Promise<UpdateModifierGroupResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }

    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modifierGroup.findFirst({
        where: {
          id: input.groupId,
          productId: product.id,
          restaurantId: input.restaurantId,
        },
        select: GROUP_SAFE_SELECT,
      });
      if (!existing) {
        return { outcome: 'groupNotFound' };
      }

      const nextMinimum = input.minimumSelections ?? existing.minimumSelections;
      const nextMaximum = input.maximumSelections ?? existing.maximumSelections;
      if (nextMaximum < nextMinimum) {
        return { outcome: 'invalidSelectionRange' };
      }

      const groupData: {
        status?: ModifierGroupStatus;
        minimumSelections?: number;
        maximumSelections?: number;
        displayOrder?: number;
      } = {};
      if (input.status !== undefined) groupData.status = input.status;
      if (input.minimumSelections !== undefined) groupData.minimumSelections = input.minimumSelections;
      if (input.maximumSelections !== undefined) groupData.maximumSelections = input.maximumSelections;
      if (input.displayOrder !== undefined) groupData.displayOrder = input.displayOrder;

      const translationData: { name?: string; helperText?: string | null } = {};
      if (input.name !== undefined) translationData.name = input.name;
      if (input.helperText !== undefined) translationData.helperText = input.helperText;
      const hasTranslationChanges = Object.keys(translationData).length > 0;

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });

      let updatedGroup = existing;
      if (Object.keys(groupData).length > 0) {
        updatedGroup = await tx.modifierGroup.update({
          where: { id: existing.id },
          data: groupData,
          select: GROUP_SAFE_SELECT,
        });
      } else if (hasTranslationChanges) {
        updatedGroup = await tx.modifierGroup.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: GROUP_SAFE_SELECT,
        });
      }

      if (hasTranslationChanges) {
        await tx.modifierGroupTranslation.updateMany({
          where: { modifierGroupId: existing.id, locale: restaurant.defaultLocale },
          data: translationData,
        });
      }

      const translation = await tx.modifierGroupTranslation.findFirstOrThrow({
        where: { modifierGroupId: existing.id, locale: restaurant.defaultLocale },
        select: { name: true, helperText: true },
      });
      const options = await tx.modifierOption.findMany({
        where: { modifierGroupId: existing.id },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
          ...OPTION_SAFE_SELECT,
          translations: {
            where: { locale: restaurant.defaultLocale },
            select: { name: true },
            take: 1,
          },
        },
      });

      return {
        outcome: 'updated',
        data: this.toGroupView({ ...updatedGroup, translations: [translation], options }),
      };
    });
  }

  async createModifierOption(
    input: CreateModifierOptionInput,
  ): Promise<CreateModifierOptionResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    const group = await this.prisma.modifierGroup.findFirst({
      where: {
        id: input.groupId,
        productId: product.id,
        restaurantId: input.restaurantId,
      },
      select: { id: true },
    });
    if (!group) {
      return { outcome: 'groupNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    const option = await this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierOption.create({
        data: {
          restaurantId: input.restaurantId,
          modifierGroupId: group.id,
          status: input.status,
          priceAdjustment: new Prisma.Decimal(input.priceAdjustment),
          displayOrder: input.displayOrder,
        },
        select: OPTION_SAFE_SELECT,
      });

      const translation = await tx.modifierOptionTranslation.create({
        data: {
          modifierOptionId: created.id,
          locale: restaurant.defaultLocale,
          name: input.name,
        },
        select: { name: true },
      });

      return { ...created, translations: [translation] };
    });

    return { outcome: 'created', data: this.toOptionView(option) };
  }

  async updateModifierOption(
    input: UpdateModifierOptionInput,
  ): Promise<UpdateModifierOptionResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    const group = await this.prisma.modifierGroup.findFirst({
      where: {
        id: input.groupId,
        productId: product.id,
        restaurantId: input.restaurantId,
      },
      select: { id: true },
    });
    if (!group) {
      return { outcome: 'groupNotFound' };
    }

    if (!isWellFormedUuid(input.optionId)) {
      return { outcome: 'optionNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modifierOption.findFirst({
        where: {
          id: input.optionId,
          modifierGroupId: group.id,
          restaurantId: input.restaurantId,
        },
        select: OPTION_SAFE_SELECT,
      });
      if (!existing) {
        return { outcome: 'optionNotFound' };
      }

      const optionData: {
        status?: ModifierOptionStatus;
        priceAdjustment?: Prisma.Decimal;
        displayOrder?: number;
      } = {};
      if (input.status !== undefined) optionData.status = input.status;
      if (input.priceAdjustment !== undefined) {
        optionData.priceAdjustment = new Prisma.Decimal(input.priceAdjustment);
      }
      if (input.displayOrder !== undefined) optionData.displayOrder = input.displayOrder;

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });

      let updatedOption = existing;
      if (Object.keys(optionData).length > 0) {
        updatedOption = await tx.modifierOption.update({
          where: { id: existing.id },
          data: optionData,
          select: OPTION_SAFE_SELECT,
        });
      } else if (input.name !== undefined) {
        updatedOption = await tx.modifierOption.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: OPTION_SAFE_SELECT,
        });
      }

      if (input.name !== undefined) {
        await tx.modifierOptionTranslation.updateMany({
          where: { modifierOptionId: existing.id, locale: restaurant.defaultLocale },
          data: { name: input.name },
        });
      }

      const translation = await tx.modifierOptionTranslation.findFirstOrThrow({
        where: { modifierOptionId: existing.id, locale: restaurant.defaultLocale },
        select: { name: true },
      });

      return {
        outcome: 'updated',
        data: this.toOptionView({ ...updatedOption, translations: [translation] }),
      };
    });
  }

  /**
   * FT-6A closeout (localization gap): returns EVERY existing
   * `ModifierGroupTranslation` row for an authorized Group, raw -- mirrors
   * `ProductsService.getProductTranslations` exactly (identical
   * shape/behavior, only the entity/parent chain differs).
   */
  async getModifierGroupTranslations(
    scope: AuthorizedGroupScope,
  ): Promise<GetModifierGroupTranslationsResult> {
    const product = await this.findProduct(scope);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(scope.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    const group = await this.prisma.modifierGroup.findFirst({
      where: { id: scope.groupId, productId: product.id, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!group) {
      return { outcome: 'groupNotFound' };
    }

    const translations = await this.prisma.modifierGroupTranslation.findMany({
      where: { modifierGroupId: group.id },
      select: { locale: true, name: true, helperText: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  /**
   * FT-6A closeout: full replacement of one Modifier Group Translation
   * resource -- mirrors `ProductsService.putProductTranslation`'s exact
   * rationale (identical shape/behavior).
   */
  async putModifierGroupTranslation(
    input: PutModifierGroupTranslationInput,
  ): Promise<PutModifierGroupTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id: input.groupId, productId: product.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!group) {
        return { outcome: 'groupNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.modifierGroupTranslation.findUnique({
        where: { modifierGroupId_locale: { modifierGroupId: group.id, locale: input.locale } },
        select: { name: true, helperText: true },
      });

      const isNoOp =
        existing !== null &&
        existing.name === input.name &&
        existing.helperText === input.helperText;
      if (isNoOp) {
        return {
          outcome: 'updated',
          data: { locale: input.locale, name: existing.name, helperText: existing.helperText },
        };
      }

      await tx.modifierGroupTranslation.upsert({
        where: { modifierGroupId_locale: { modifierGroupId: group.id, locale: input.locale } },
        create: {
          modifierGroupId: group.id,
          locale: input.locale,
          name: input.name,
          helperText: input.helperText,
        },
        update: { name: input.name, helperText: input.helperText },
      });

      await tx.modifierGroup.update({ where: { id: group.id }, data: { updatedAt: new Date() } });

      return {
        outcome: 'updated',
        data: { locale: input.locale, name: input.name, helperText: input.helperText },
      };
    });
  }

  /**
   * FT-6A closeout: deletes one Modifier Group Translation resource --
   * mirrors `ProductsService.deleteProductTranslation`'s exact rationale
   * (identical shape/behavior).
   */
  async deleteModifierGroupTranslation(
    input: DeleteModifierGroupTranslationInput,
  ): Promise<DeleteModifierGroupTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id: input.groupId, productId: product.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!group) {
        return { outcome: 'groupNotFound' };
      }

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });
      if (input.locale === restaurant.defaultLocale) {
        return { outcome: 'defaultTranslationRequired' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const deleted = await tx.modifierGroupTranslation.deleteMany({
        where: { modifierGroupId: group.id, locale: input.locale },
      });
      if (deleted.count > 0) {
        await tx.modifierGroup.update({ where: { id: group.id }, data: { updatedAt: new Date() } });
      }

      return { outcome: 'deleted' };
    });
  }

  /**
   * FT-6A closeout (localization gap): returns EVERY existing
   * `ModifierOptionTranslation` row for an authorized Option, raw.
   */
  async getModifierOptionTranslations(
    scope: AuthorizedOptionScope,
  ): Promise<GetModifierOptionTranslationsResult> {
    const product = await this.findProduct(scope);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(scope.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    const group = await this.prisma.modifierGroup.findFirst({
      where: { id: scope.groupId, productId: product.id, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!group) {
      return { outcome: 'groupNotFound' };
    }

    if (!isWellFormedUuid(scope.optionId)) {
      return { outcome: 'optionNotFound' };
    }

    const option = await this.prisma.modifierOption.findFirst({
      where: { id: scope.optionId, modifierGroupId: group.id, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!option) {
      return { outcome: 'optionNotFound' };
    }

    const translations = await this.prisma.modifierOptionTranslation.findMany({
      where: { modifierOptionId: option.id },
      select: { locale: true, name: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  /**
   * FT-6A closeout: full replacement of one Modifier Option Translation
   * resource.
   */
  async putModifierOptionTranslation(
    input: PutModifierOptionTranslationInput,
  ): Promise<PutModifierOptionTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id: input.groupId, productId: product.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!group) {
        return { outcome: 'groupNotFound' };
      }

      if (!isWellFormedUuid(input.optionId)) {
        return { outcome: 'optionNotFound' };
      }
      const option = await tx.modifierOption.findFirst({
        where: { id: input.optionId, modifierGroupId: group.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!option) {
        return { outcome: 'optionNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.modifierOptionTranslation.findUnique({
        where: { modifierOptionId_locale: { modifierOptionId: option.id, locale: input.locale } },
        select: { name: true },
      });
      const isNoOp = existing !== null && existing.name === input.name;
      if (isNoOp) {
        return { outcome: 'updated', data: { locale: input.locale, name: existing.name } };
      }

      await tx.modifierOptionTranslation.upsert({
        where: { modifierOptionId_locale: { modifierOptionId: option.id, locale: input.locale } },
        create: { modifierOptionId: option.id, locale: input.locale, name: input.name },
        update: { name: input.name },
      });

      await tx.modifierOption.update({ where: { id: option.id }, data: { updatedAt: new Date() } });

      return { outcome: 'updated', data: { locale: input.locale, name: input.name } };
    });
  }

  /**
   * FT-6A closeout: deletes one Modifier Option Translation resource.
   */
  async deleteModifierOptionTranslation(
    input: DeleteModifierOptionTranslationInput,
  ): Promise<DeleteModifierOptionTranslationResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id: input.groupId, productId: product.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!group) {
        return { outcome: 'groupNotFound' };
      }

      if (!isWellFormedUuid(input.optionId)) {
        return { outcome: 'optionNotFound' };
      }
      const option = await tx.modifierOption.findFirst({
        where: { id: input.optionId, modifierGroupId: group.id, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!option) {
        return { outcome: 'optionNotFound' };
      }

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });
      if (input.locale === restaurant.defaultLocale) {
        return { outcome: 'defaultTranslationRequired' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const deleted = await tx.modifierOptionTranslation.deleteMany({
        where: { modifierOptionId: option.id, locale: input.locale },
      });
      if (deleted.count > 0) {
        await tx.modifierOption.update({ where: { id: option.id }, data: { updatedAt: new Date() } });
      }

      return { outcome: 'deleted' };
    });
  }

  private toOptionView(option: {
    id: string;
    status: ModifierOptionStatus;
    priceAdjustment: Prisma.Decimal;
    displayOrder: number;
    translations: { name: string }[];
  }): ModifierOptionView {
    return {
      id: option.id,
      status: option.status,
      name: option.translations[0]?.name ?? '',
      priceAdjustment: formatMoney(option.priceAdjustment),
      displayOrder: option.displayOrder,
    };
  }

  private toGroupView(group: {
    id: string;
    status: ModifierGroupStatus;
    minimumSelections: number;
    maximumSelections: number;
    displayOrder: number;
    translations: { name: string; helperText: string | null }[];
    options: {
      id: string;
      status: ModifierOptionStatus;
      priceAdjustment: Prisma.Decimal;
      displayOrder: number;
      translations: { name: string }[];
    }[];
  }): ModifierGroupView {
    return {
      id: group.id,
      status: group.status,
      name: group.translations[0]?.name ?? '',
      helperText: group.translations[0]?.helperText ?? null,
      minimumSelections: group.minimumSelections,
      maximumSelections: group.maximumSelections,
      displayOrder: group.displayOrder,
      options: group.options.map((option) => this.toOptionView(option)),
    };
  }
}
