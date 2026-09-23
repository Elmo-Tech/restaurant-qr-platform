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
  // FT-6B: null for a Custom Option (unchanged FT-6A shape). When present,
  // identifies the ModifierPresetOption this Option was created from --
  // Staff UI uses it to render "Based on preset" / offer "Reset to preset".
  sourcePresetOptionId: string | null;
  // FT-6B: true once Staff has overridden THIS Product's price away from
  // the linked Preset Option's current default -- always false for a
  // Custom Option (there is nothing to override).
  priceIsOverridden: boolean;
  // FT-6B closeout, Section 4 (historical safety): true only when this
  // Option has NEVER been snapshotted into a historical OrderItemModifier
  // row -- Staff UI shows "Delete" only when this is true, otherwise only
  // "Deactivate" (never a silently-substituted action).
  canDelete: boolean;
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
  // FT-6B: null for a Group created via "Create Custom" -- present when
  // created via "Use Preset", identifying the source ModifierPreset.
  sourcePresetId: string | null;
  // FT-6B closeout, Section 4 (historical safety): true only when NEITHER
  // this Group NOR any of its Options has ever been snapshotted into a
  // historical OrderItemModifier row. Staff UI's "Delete"/"Remove from
  // Product" actions are only ever offered when this is true; the Backend
  // enforces the same rule again server-side regardless of what the UI
  // shows.
  canDelete: boolean;
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

export interface ApplyPresetToProductInput extends AuthorizedProductScope {
  presetId: string;
}

export type ApplyPresetToProductResult =
  | { outcome: 'created'; data: ModifierGroupView }
  | { outcome: 'productNotFound' }
  | { outcome: 'presetNotFound' }
  | { outcome: 'alreadyApplied' };

/**
 * FT-6B closeout, Section 3/4: "Delete" for a Custom Group/Option -- hard
 * DELETE, but ONLY when it has never been snapshotted into a historical
 * Order (`canDelete`/`hasHistoricalReferences` below). Never falls back to
 * deactivating instead -- if the safety check fails, the caller (Staff UI)
 * simply should not have offered this action in the first place; the
 * `hasHistoricalReferences` outcome is a server-side backstop, not a
 * silently-substituted behavior.
 */
export type DeleteModifierGroupResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'hasHistoricalReferences' };

export type DeleteModifierOptionResult =
  | { outcome: 'deleted' }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' }
  | { outcome: 'optionNotFound' }
  | { outcome: 'hasHistoricalReferences' };

/**
 * FT-6B closeout, Section 3/4: "Remove from Product" for a Preset-linked
 * Group -- ADAPTIVE, unlike plain Delete: hard-deletes when safe, or
 * deactivates (keeping history intact) when the Group/its Options have
 * historical Order references. Always succeeds in SOME form from the
 * Staff's point of view ("stop using this preset on this Product"),
 * whichever is safe.
 */
export type RemoveModifierGroupFromProductResult =
  | { outcome: 'deleted' }
  | { outcome: 'deactivated'; data: ModifierGroupView }
  | { outcome: 'productNotFound' }
  | { outcome: 'groupNotFound' };

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
  sourcePresetOptionId: true,
  priceIsOverridden: true,
} as const;

const GROUP_SAFE_SELECT = {
  id: true,
  status: true,
  minimumSelections: true,
  maximumSelections: true,
  displayOrder: true,
  sourcePresetId: true,
} as const;

/**
 * FT-6B closeout, Section 4: has this Group ever been snapshotted into a
 * historical Order? Every `OrderItemModifier` row always carries BOTH
 * `modifierGroupId` AND `modifierOptionId` together (see
 * `PublicOrdersService.createOrder`), so checking the Group alone also
 * guarantees none of its Options have been referenced either. Accepts
 * either the top-level `PrismaService` or an open `$transaction` client --
 * both expose the same `orderItemModifier.count` shape.
 */
async function groupHasHistoricalReferences(
  client: { orderItemModifier: { count: (args: { where: { modifierGroupId: string } }) => Promise<number> } },
  groupId: string,
): Promise<boolean> {
  const count = await client.orderItemModifier.count({ where: { modifierGroupId: groupId } });
  return count > 0;
}

/** FT-6B closeout, Section 3/5: has this ONE Option ever been snapshotted into a historical Order? */
async function optionHasHistoricalReferences(
  client: { orderItemModifier: { count: (args: { where: { modifierOptionId: string } }) => Promise<number> } },
  optionId: string,
): Promise<boolean> {
  const count = await client.orderItemModifier.count({ where: { modifierOptionId: optionId } });
  return count > 0;
}

/** Prisma's "Foreign key constraint violated" error (P2003) -- the true concurrency-safety backstop when a historical-reference check races against a concurrent Order creation between the check and the delete itself (mirrors the repo's established P2002-matching idempotency pattern in `public-orders.service.ts`). */
function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * FT-6A (closeout: full EN/AR localization added); FT-6B (Preset linking +
 * closeout: Delete/"Remove from Product" when historically safe): Staff
 * configuration of Modifier Groups/Options on a Product. Mirrors
 * `ProductsService`'s exact conventions -- Tenant-scoped identity
 * resolution (foreign/unknown Product/Group/Option all converge on their
 * respective `*NotFound` outcome, never a distinguishable reason), atomic
 * parent+translation writes. Create/Update write the Restaurant's
 * default-locale translation directly (mirrors `CreateProductDto.name`);
 * every other active locale is managed through the dedicated
 * `get/put/deleteModifier{Group,Option}Translation` methods below, exactly
 * like Menu/Category/Product's own `translations/:locale` resource.
 * `status`-only deactivation (Product/Category's convention, DATABASE_SPEC.md
 * #58) remains the default; a genuine hard DELETE is offered ONLY when
 * `canDelete` (no historical Order reference) is true -- see
 * `deleteModifierGroup`/`deleteModifierOption`/`removeModifierGroupFromProduct`.
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

    const withDeleteFlags = await Promise.all(
      groups.map(async (group) => ({
        ...group,
        canDelete: !(await groupHasHistoricalReferences(this.prisma, group.id)),
        options: await Promise.all(
          group.options.map(async (option) => ({
            ...option,
            canDelete: !(await optionHasHistoricalReferences(this.prisma, option.id)),
          })),
        ),
      })),
    );

    return {
      outcome: 'found',
      data: withDeleteFlags.map((group) => this.toGroupView(group)),
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
          // "Create Custom" (FT-6A, unchanged) -- never linked to a Preset.
          sourcePresetId: null,
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

      return { ...created, translations: [translation], options: [], canDelete: true };
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

      const groupCanDelete = !(await groupHasHistoricalReferences(tx, existing.id));
      const optionsWithDeleteFlags = await Promise.all(
        options.map(async (option) => ({
          ...option,
          canDelete: !(await optionHasHistoricalReferences(tx, option.id)),
        })),
      );

      return {
        outcome: 'updated',
        data: this.toGroupView({
          ...updatedGroup,
          translations: [translation],
          options: optionsWithDeleteFlags,
          canDelete: groupCanDelete,
        }),
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
          // "Create Custom" (FT-6A, unchanged) -- never linked to a Preset
          // Option, so there is nothing to ever override.
          sourcePresetOptionId: null,
          priceIsOverridden: false,
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

      return { ...created, translations: [translation], canDelete: true };
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
        priceIsOverridden?: boolean;
      } = {};
      if (input.status !== undefined) optionData.status = input.status;
      if (input.priceAdjustment !== undefined) {
        optionData.priceAdjustment = new Prisma.Decimal(input.priceAdjustment);
        // FT-6B, Section 5: manually editing the price of a Preset-linked
        // Option IS the override action -- from this point on, a Preset
        // price sync (Section 7) must skip this row until "Reset to
        // preset" explicitly clears the flag. A Custom Option (no source
        // link) has nothing to override, so this never applies to it.
        if (existing.sourcePresetOptionId !== null) {
          optionData.priceIsOverridden = true;
        }
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
      const canDelete = !(await optionHasHistoricalReferences(tx, existing.id));

      return {
        outcome: 'updated',
        data: this.toOptionView({ ...updatedOption, translations: [translation], canDelete }),
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
    sourcePresetOptionId: string | null;
    priceIsOverridden: boolean;
    canDelete: boolean;
    translations: { name: string }[];
  }): ModifierOptionView {
    return {
      id: option.id,
      status: option.status,
      name: option.translations[0]?.name ?? '',
      priceAdjustment: formatMoney(option.priceAdjustment),
      displayOrder: option.displayOrder,
      sourcePresetOptionId: option.sourcePresetOptionId,
      priceIsOverridden: option.priceIsOverridden,
      canDelete: option.canDelete,
    };
  }

  private toGroupView(group: {
    id: string;
    status: ModifierGroupStatus;
    minimumSelections: number;
    maximumSelections: number;
    displayOrder: number;
    sourcePresetId: string | null;
    canDelete: boolean;
    translations: { name: string; helperText: string | null }[];
    options: {
      id: string;
      status: ModifierOptionStatus;
      priceAdjustment: Prisma.Decimal;
      displayOrder: number;
      sourcePresetOptionId: string | null;
      priceIsOverridden: boolean;
      canDelete: boolean;
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
      sourcePresetId: group.sourcePresetId,
      canDelete: group.canDelete,
    };
  }

  /**
   * FT-6B, Section 2/4: attaches a Restaurant-scoped Modifier Preset to a
   * Product by COPYING its current Group/Option/translation values into
   * real, independent `ModifierGroup`/`ModifierOption` rows (Section 3 --
   * Presets are never read directly by Public Menu/Cart/PublicOrdersService).
   * The `@@unique([productId, sourcePresetId])` constraint is the true
   * concurrency-safe guard against double-attachment; the pre-check here is
   * just a fast, friendly path.
   */
  async applyPresetToProduct(
    input: ApplyPresetToProductInput,
  ): Promise<ApplyPresetToProductResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }

    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: input.presetId, restaurantId: input.restaurantId },
      select: {
        id: true,
        minimumSelections: true,
        maximumSelections: true,
        translations: { select: { locale: true, name: true, helperText: true } },
        options: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            priceAdjustment: true,
            displayOrder: true,
            translations: { select: { locale: true, name: true } },
          },
        },
      },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }

    const alreadyApplied = await this.prisma.modifierGroup.findFirst({
      where: { productId: product.id, sourcePresetId: preset.id },
      select: { id: true },
    });
    if (alreadyApplied) {
      return { outcome: 'alreadyApplied' };
    }

    const existingGroupCount = await this.prisma.modifierGroup.count({
      where: { productId: product.id, restaurantId: input.restaurantId },
    });

    try {
      const group = await this.prisma.$transaction(async (tx) => {
        const created = await tx.modifierGroup.create({
          data: {
            restaurantId: input.restaurantId,
            productId: product.id,
            status: 'ACTIVE',
            minimumSelections: preset.minimumSelections,
            maximumSelections: preset.maximumSelections,
            displayOrder: existingGroupCount,
            sourcePresetId: preset.id,
          },
          select: GROUP_SAFE_SELECT,
        });

        if (preset.translations.length > 0) {
          await tx.modifierGroupTranslation.createMany({
            data: preset.translations.map((translation) => ({
              modifierGroupId: created.id,
              locale: translation.locale,
              name: translation.name,
              helperText: translation.helperText,
            })),
          });
        }

        const options = [];
        for (const presetOption of preset.options) {
          const createdOption = await tx.modifierOption.create({
            data: {
              restaurantId: input.restaurantId,
              modifierGroupId: created.id,
              status: presetOption.status,
              priceAdjustment: presetOption.priceAdjustment,
              displayOrder: presetOption.displayOrder,
              sourcePresetOptionId: presetOption.id,
              priceIsOverridden: false,
            },
            select: OPTION_SAFE_SELECT,
          });

          if (presetOption.translations.length > 0) {
            await tx.modifierOptionTranslation.createMany({
              data: presetOption.translations.map((translation) => ({
                modifierOptionId: createdOption.id,
                locale: translation.locale,
                name: translation.name,
              })),
            });
          }

          const optionTranslations = await tx.modifierOptionTranslation.findMany({
            where: { modifierOptionId: createdOption.id },
            select: { name: true },
            take: 1,
          });
          options.push({ ...createdOption, translations: optionTranslations, canDelete: true });
        }

        const groupTranslations = await tx.modifierGroupTranslation.findMany({
          where: { modifierGroupId: created.id },
          select: { name: true, helperText: true },
          take: 1,
        });

        return { ...created, translations: groupTranslations, options, canDelete: true };
      });

      return { outcome: 'created', data: this.toGroupView(group) };
    } catch (error) {
      // A genuine race (two concurrent "Use Preset" clicks) hits the
      // `@@unique([productId, sourcePresetId])` constraint the pre-check
      // above could not fully rule out -- converges to the same friendly
      // outcome rather than a raw 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { outcome: 'alreadyApplied' };
      }
      throw error;
    }
  }

  /**
   * FT-6B, Section 5 ("Reset to preset"): re-adopts the linked Preset
   * Option's CURRENT price and clears the override flag. A no-op (still
   * `updated`) if the Option was never linked to a Preset or was never
   * overridden in the first place.
   */
  async resetModifierOptionPrice(
    scope: AuthorizedOptionScope,
  ): Promise<UpdateModifierOptionResult> {
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

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modifierOption.findFirst({
        where: { id: scope.optionId, modifierGroupId: group.id, restaurantId: scope.restaurantId },
        select: { ...OPTION_SAFE_SELECT, sourcePresetOptionId: true },
      });
      if (!existing) {
        return { outcome: 'optionNotFound' };
      }

      let updatedOption = existing;
      if (existing.sourcePresetOptionId) {
        const presetOption = await tx.modifierPresetOption.findUnique({
          where: { id: existing.sourcePresetOptionId },
          select: { priceAdjustment: true },
        });
        if (presetOption) {
          updatedOption = await tx.modifierOption.update({
            where: { id: existing.id },
            data: { priceAdjustment: presetOption.priceAdjustment, priceIsOverridden: false },
            select: OPTION_SAFE_SELECT,
          });
        }
      }

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: scope.restaurantId },
        select: { defaultLocale: true },
      });
      const translation = await tx.modifierOptionTranslation.findFirstOrThrow({
        where: { modifierOptionId: existing.id, locale: restaurant.defaultLocale },
        select: { name: true },
      });
      const canDelete = !(await optionHasHistoricalReferences(tx, existing.id));

      return {
        outcome: 'updated',
        data: this.toOptionView({ ...updatedOption, translations: [translation], canDelete }),
      };
    });
  }

  /**
   * FT-6B closeout, Section 3/4: "Delete" for a Custom Modifier Group --
   * hard DELETE, but ONLY when NEITHER it NOR any of its Options has ever
   * been snapshotted into a historical Order. The check runs again inside
   * the same transaction as the delete itself (never trust a stale read),
   * and a genuine concurrent race that slips past it still cannot corrupt
   * history: `OrderItemModifier`'s own `Restrict` foreign keys make the
   * delete itself fail (P2003) rather than silently succeed, which this
   * converges to the same safe `hasHistoricalReferences` outcome.
   */
  async deleteModifierGroup(scope: AuthorizedGroupScope): Promise<DeleteModifierGroupResult> {
    const product = await this.findProduct(scope);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(scope.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.modifierGroup.findFirst({
          where: { id: scope.groupId, productId: product.id, restaurantId: scope.restaurantId },
          select: { id: true },
        });
        if (!group) {
          return { outcome: 'groupNotFound' };
        }

        if (await groupHasHistoricalReferences(tx, group.id)) {
          return { outcome: 'hasHistoricalReferences' };
        }

        await tx.modifierOption.deleteMany({ where: { modifierGroupId: group.id } });
        await tx.modifierGroup.delete({ where: { id: group.id } });

        return { outcome: 'deleted' };
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        return { outcome: 'hasHistoricalReferences' };
      }
      throw error;
    }
  }

  /**
   * FT-6B closeout, Section 3/4/6: "Delete" for a Custom Modifier Option --
   * same historical-safety rule as `deleteModifierGroup`, scoped to one
   * Option. Deleting a Custom Option out of an otherwise Preset-linked
   * Group is exactly this same action (Section 3: only the OPTION's own
   * link, not its parent Group's, determines "Custom" here).
   */
  async deleteModifierOption(scope: AuthorizedOptionScope): Promise<DeleteModifierOptionResult> {
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        const option = await tx.modifierOption.findFirst({
          where: { id: scope.optionId, modifierGroupId: group.id, restaurantId: scope.restaurantId },
          select: { id: true },
        });
        if (!option) {
          return { outcome: 'optionNotFound' };
        }

        if (await optionHasHistoricalReferences(tx, option.id)) {
          return { outcome: 'hasHistoricalReferences' };
        }

        await tx.modifierOption.delete({ where: { id: option.id } });

        return { outcome: 'deleted' };
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        return { outcome: 'hasHistoricalReferences' };
      }
      throw error;
    }
  }

  /**
   * FT-6B closeout, Section 3/4: "Remove from Product" for a Preset-linked
   * Modifier Group -- ADAPTIVE. When historically safe, behaves exactly
   * like `deleteModifierGroup` (hard DELETE). When NOT safe, falls back to
   * deactivating the Product-local Group (`status: 'INACTIVE'`) instead --
   * it disappears from the Guest Menu, but every historical Order's
   * `OrderItemModifier` snapshot is left completely untouched. This is the
   * ONE action allowed to substitute deactivate-for-delete; plain
   * `deleteModifierGroup`/`deleteModifierOption` never do.
   */
  async removeModifierGroupFromProduct(
    scope: AuthorizedGroupScope,
  ): Promise<RemoveModifierGroupFromProductResult> {
    const product = await this.findProduct(scope);
    if (!product) {
      return { outcome: 'productNotFound' };
    }
    if (!isWellFormedUuid(scope.groupId)) {
      return { outcome: 'groupNotFound' };
    }

    const deactivate = async (groupId: string): Promise<RemoveModifierGroupFromProductResult> => {
      return this.prisma.$transaction(async (tx) => {
        const restaurant = await tx.restaurant.findUniqueOrThrow({
          where: { id: scope.restaurantId },
          select: { defaultLocale: true },
        });
        const updated = await tx.modifierGroup.update({
          where: { id: groupId },
          data: { status: 'INACTIVE' },
          select: GROUP_SAFE_SELECT,
        });
        const translation = await tx.modifierGroupTranslation.findFirstOrThrow({
          where: { modifierGroupId: updated.id, locale: restaurant.defaultLocale },
          select: { name: true, helperText: true },
        });
        const options = await tx.modifierOption.findMany({
          where: { modifierGroupId: updated.id },
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
        const optionsWithDeleteFlags = await Promise.all(
          options.map(async (option) => ({
            ...option,
            canDelete: !(await optionHasHistoricalReferences(tx, option.id)),
          })),
        );
        return {
          outcome: 'deactivated' as const,
          data: this.toGroupView({
            ...updated,
            translations: [translation],
            options: optionsWithDeleteFlags,
            canDelete: false,
          }),
        };
      });
    };

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const group = await tx.modifierGroup.findFirst({
          where: { id: scope.groupId, productId: product.id, restaurantId: scope.restaurantId },
          select: { id: true },
        });
        if (!group) {
          return { outcome: 'groupNotFound' as const };
        }
        if (await groupHasHistoricalReferences(tx, group.id)) {
          return { outcome: 'needsDeactivate' as const, groupId: group.id };
        }
        await tx.modifierOption.deleteMany({ where: { modifierGroupId: group.id } });
        await tx.modifierGroup.delete({ where: { id: group.id } });
        return { outcome: 'deleted' as const };
      });

      if (outcome.outcome === 'groupNotFound') {
        return { outcome: 'groupNotFound' };
      }
      if (outcome.outcome === 'deleted') {
        return { outcome: 'deleted' };
      }
      // 'needsDeactivate' -- a separate transaction, since the first one
      // intentionally made no writes once history was detected.
      return await deactivate(outcome.groupId);
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        // A genuine race: an Order referencing this Group landed between
        // the check and the delete -- fall back to deactivate rather than
        // surfacing a raw constraint error to Staff. Safe to use the raw
        // `scope.groupId` here: a P2003 could only occur deleting a row
        // that genuinely existed (and was already ownership-verified by
        // the same scoped query above) in the first place.
        return await deactivate(scope.groupId);
      }
      throw error;
    }
  }
}
