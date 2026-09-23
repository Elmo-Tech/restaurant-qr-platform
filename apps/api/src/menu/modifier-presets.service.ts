import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  ModifierPresetOptionStatus,
  ModifierPresetStatus,
} from '../generated/prisma/client';
import { isRestaurantLocaleActive } from './menu-translation.helper';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';

/** Converts a Prisma Decimal to the exact 2-fractional-digit decimal-string API contract (API_CONVENTIONS.md #48). Never JavaScript floating-point arithmetic. */
function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export interface ModifierPresetOptionView {
  id: string;
  status: ModifierPresetOptionStatus;
  name: string;
  priceAdjustment: string;
  displayOrder: number;
  // FT-6B closeout, Section 5: true only when NO Product-local
  // `ModifierOption` currently links to this Preset Option
  // (`sourcePresetOptionId`). Staff UI offers "Delete" only when true,
  // "Deactivate" otherwise.
  canDelete: boolean;
}

export interface ModifierPresetView {
  id: string;
  status: ModifierPresetStatus;
  name: string;
  helperText: string | null;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
  options: ModifierPresetOptionView[];
  // FT-6B closeout, Section 5: true only when NO Product-local
  // `ModifierGroup` is currently linked to this Preset (`sourcePresetId`).
  canDelete: boolean;
}

export interface AuthorizedRestaurantScope {
  restaurantId: string;
}

export interface AuthorizedPresetScope extends AuthorizedRestaurantScope {
  presetId: string;
}

export interface AuthorizedPresetOptionScope extends AuthorizedPresetScope {
  presetOptionId: string;
}

export type ListModifierPresetsResult = { outcome: 'found'; data: ModifierPresetView[] };

export interface CreateModifierPresetInput extends AuthorizedRestaurantScope {
  name: string;
  helperText: string | null;
  status: ModifierPresetStatus;
  minimumSelections: number;
  maximumSelections: number;
  displayOrder: number;
}

export type CreateModifierPresetResult =
  | { outcome: 'created'; data: ModifierPresetView }
  | { outcome: 'invalidSelectionRange' };

export interface UpdateModifierPresetInput extends AuthorizedPresetScope {
  name?: string;
  helperText?: string | null;
  status?: ModifierPresetStatus;
  minimumSelections?: number;
  maximumSelections?: number;
  displayOrder?: number;
}

export type UpdateModifierPresetResult =
  | { outcome: 'updated'; data: ModifierPresetView }
  | { outcome: 'presetNotFound' }
  | { outcome: 'invalidSelectionRange' };

export interface CreateModifierPresetOptionInput extends AuthorizedPresetScope {
  name: string;
  status: ModifierPresetOptionStatus;
  priceAdjustment: string;
  displayOrder: number;
}

export type CreateModifierPresetOptionResult =
  | { outcome: 'created'; data: ModifierPresetOptionView }
  | { outcome: 'presetNotFound' };

export interface UpdateModifierPresetOptionInput extends AuthorizedPresetOptionScope {
  name?: string;
  status?: ModifierPresetOptionStatus;
  priceAdjustment?: string;
  displayOrder?: number;
}

export type UpdateModifierPresetOptionResult =
  | { outcome: 'updated'; data: ModifierPresetOptionView }
  | { outcome: 'presetNotFound' }
  | { outcome: 'presetOptionNotFound' };

/** FT-6B closeout, Section 5: "Delete" a Preset -- allowed only when unattached to any Product. */
export type DeleteModifierPresetResult =
  | { outcome: 'deleted' }
  | { outcome: 'presetNotFound' }
  | { outcome: 'hasLinkedProducts' };

export type DeleteModifierPresetOptionResult =
  | { outcome: 'deleted' }
  | { outcome: 'presetNotFound' }
  | { outcome: 'presetOptionNotFound' }
  | { outcome: 'hasLinkedProducts' };

export interface ModifierPresetTranslationView {
  locale: string;
  name: string;
  helperText: string | null;
}

export interface ModifierPresetOptionTranslationView {
  locale: string;
  name: string;
}

export type GetModifierPresetTranslationsResult =
  | { outcome: 'found'; data: ModifierPresetTranslationView[] }
  | { outcome: 'presetNotFound' };

export interface PutModifierPresetTranslationInput extends AuthorizedPresetScope {
  locale: PlatformSupportedLocale;
  name: string;
  helperText: string | null;
}

export type PutModifierPresetTranslationResult =
  | { outcome: 'updated'; data: ModifierPresetTranslationView }
  | { outcome: 'presetNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteModifierPresetTranslationInput extends AuthorizedPresetScope {
  locale: PlatformSupportedLocale;
}

export type DeleteModifierPresetTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'presetNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

export type GetModifierPresetOptionTranslationsResult =
  | { outcome: 'found'; data: ModifierPresetOptionTranslationView[] }
  | { outcome: 'presetNotFound' }
  | { outcome: 'presetOptionNotFound' };

export interface PutModifierPresetOptionTranslationInput extends AuthorizedPresetOptionScope {
  locale: PlatformSupportedLocale;
  name: string;
}

export type PutModifierPresetOptionTranslationResult =
  | { outcome: 'updated'; data: ModifierPresetOptionTranslationView }
  | { outcome: 'presetNotFound' }
  | { outcome: 'presetOptionNotFound' }
  | { outcome: 'localeNotActive' };

export interface DeleteModifierPresetOptionTranslationInput extends AuthorizedPresetOptionScope {
  locale: PlatformSupportedLocale;
}

export type DeleteModifierPresetOptionTranslationResult =
  | { outcome: 'deleted' }
  | { outcome: 'presetNotFound' }
  | { outcome: 'presetOptionNotFound' }
  | { outcome: 'localeNotActive' }
  | { outcome: 'defaultTranslationRequired' };

const PRESET_OPTION_SAFE_SELECT = {
  id: true,
  status: true,
  priceAdjustment: true,
  displayOrder: true,
} as const;

const PRESET_SAFE_SELECT = {
  id: true,
  status: true,
  minimumSelections: true,
  maximumSelections: true,
  displayOrder: true,
} as const;

/**
 * FT-6B: the Restaurant-scoped Modifier Preset library -- reusable Group
 * TEMPLATES (e.g. "Standard Size") Staff attach to many Products via
 * `ModifiersService.applyPresetToProduct` instead of hand-building the same
 * Group/Options repeatedly (Section 2). Mirrors `ModifiersService`'s exact
 * conventions (Tenant-scoped identity, atomic parent+translation writes,
 * status-only deactivation, default-locale-direct + secondary-locale-via-
 * dedicated-endpoint translation split).
 *
 * CRITICAL (Section 7): a Preset is never read by Public Menu/Cart/
 * PublicOrdersService -- it is authoring convenience only. Whenever a
 * Preset's own field or a Preset Option's field changes, this service
 * SYNCS that change into every linked Product-local `ModifierGroup`/
 * `ModifierOption` row (via `sourcePresetId`/`sourcePresetOptionId`),
 * except a `ModifierOption.priceAdjustment` that has been Product-locally
 * overridden (`priceIsOverridden = true`), which a sync always skips. A
 * Group's own Product-specific `displayOrder` (its position in that one
 * Product's Modifier list) is intentionally NEVER synced from the Preset --
 * it is Product-specific positioning, exactly like a Custom Group's.
 */
@Injectable()
export class ModifierPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPresets(scope: AuthorizedRestaurantScope): Promise<ListModifierPresetsResult> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: scope.restaurantId },
      select: { defaultLocale: true },
    });

    const presets = await this.prisma.modifierPreset.findMany({
      where: { restaurantId: scope.restaurantId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...PRESET_SAFE_SELECT,
        translations: {
          where: { locale: restaurant.defaultLocale },
          select: { name: true, helperText: true },
          take: 1,
        },
        options: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            ...PRESET_OPTION_SAFE_SELECT,
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
      presets.map(async (preset) => ({
        ...preset,
        canDelete: !(await this.presetHasLinkedGroups(preset.id)),
        options: await Promise.all(
          preset.options.map(async (option) => ({
            ...option,
            canDelete: !(await this.presetOptionHasLinkedOptions(option.id)),
          })),
        ),
      })),
    );

    return { outcome: 'found', data: withDeleteFlags.map((preset) => this.toPresetView(preset)) };
  }

  async createPreset(input: CreateModifierPresetInput): Promise<CreateModifierPresetResult> {
    if (input.maximumSelections < input.minimumSelections) {
      return { outcome: 'invalidSelectionRange' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    const preset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierPreset.create({
        data: {
          restaurantId: input.restaurantId,
          status: input.status,
          minimumSelections: input.minimumSelections,
          maximumSelections: input.maximumSelections,
          displayOrder: input.displayOrder,
        },
        select: PRESET_SAFE_SELECT,
      });

      const translation = await tx.modifierPresetTranslation.create({
        data: {
          modifierPresetId: created.id,
          locale: restaurant.defaultLocale,
          name: input.name,
          helperText: input.helperText,
        },
        select: { name: true, helperText: true },
      });

      return { ...created, translations: [translation], options: [], canDelete: true };
    });

    return { outcome: 'created', data: this.toPresetView(preset) };
  }

  async updatePreset(input: UpdateModifierPresetInput): Promise<UpdateModifierPresetResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modifierPreset.findFirst({
        where: { id: input.presetId, restaurantId: input.restaurantId },
        select: PRESET_SAFE_SELECT,
      });
      if (!existing) {
        return { outcome: 'presetNotFound' };
      }

      const nextMinimum = input.minimumSelections ?? existing.minimumSelections;
      const nextMaximum = input.maximumSelections ?? existing.maximumSelections;
      if (nextMaximum < nextMinimum) {
        return { outcome: 'invalidSelectionRange' };
      }

      const presetData: {
        status?: ModifierPresetStatus;
        minimumSelections?: number;
        maximumSelections?: number;
        displayOrder?: number;
      } = {};
      if (input.status !== undefined) presetData.status = input.status;
      if (input.minimumSelections !== undefined) presetData.minimumSelections = input.minimumSelections;
      if (input.maximumSelections !== undefined) presetData.maximumSelections = input.maximumSelections;
      if (input.displayOrder !== undefined) presetData.displayOrder = input.displayOrder;

      const translationData: { name?: string; helperText?: string | null } = {};
      if (input.name !== undefined) translationData.name = input.name;
      if (input.helperText !== undefined) translationData.helperText = input.helperText;
      const hasTranslationChanges = Object.keys(translationData).length > 0;

      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      });

      let updatedPreset = existing;
      if (Object.keys(presetData).length > 0) {
        updatedPreset = await tx.modifierPreset.update({
          where: { id: existing.id },
          data: presetData,
          select: PRESET_SAFE_SELECT,
        });
      } else if (hasTranslationChanges) {
        updatedPreset = await tx.modifierPreset.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: PRESET_SAFE_SELECT,
        });
      }

      if (hasTranslationChanges) {
        await tx.modifierPresetTranslation.updateMany({
          where: { modifierPresetId: existing.id, locale: restaurant.defaultLocale },
          data: translationData,
        });
        await this.syncLinkedGroupTranslations(
          tx,
          existing.id,
          restaurant.defaultLocale,
          translationData,
        );
      }

      // Section 7: min/max ALWAYS sync as a pair to every linked
      // Product-local Group -- no override concept exists for these
      // (Section 6 explicitly out of scope), so the sync is unconditional.
      if (input.minimumSelections !== undefined || input.maximumSelections !== undefined) {
        await tx.modifierGroup.updateMany({
          where: { sourcePresetId: existing.id },
          data: { minimumSelections: nextMinimum, maximumSelections: nextMaximum },
        });
      }

      const translation = await tx.modifierPresetTranslation.findFirstOrThrow({
        where: { modifierPresetId: existing.id, locale: restaurant.defaultLocale },
        select: { name: true, helperText: true },
      });
      const options = await tx.modifierPresetOption.findMany({
        where: { modifierPresetId: existing.id },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
          ...PRESET_OPTION_SAFE_SELECT,
          translations: {
            where: { locale: restaurant.defaultLocale },
            select: { name: true },
            take: 1,
          },
        },
      });
      const presetCanDelete = !(await this.presetHasLinkedGroups(existing.id));
      const optionsWithDeleteFlags = await Promise.all(
        options.map(async (option) => ({
          ...option,
          canDelete: !(await this.presetOptionHasLinkedOptions(option.id)),
        })),
      );

      return {
        outcome: 'updated',
        data: this.toPresetView({
          ...updatedPreset,
          translations: [translation],
          options: optionsWithDeleteFlags,
          canDelete: presetCanDelete,
        }),
      };
    });
  }

  async createPresetOption(
    input: CreateModifierPresetOptionInput,
  ): Promise<CreateModifierPresetOptionResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: input.presetId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { defaultLocale: true },
    });

    const option = await this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierPresetOption.create({
        data: {
          restaurantId: input.restaurantId,
          modifierPresetId: preset.id,
          status: input.status,
          priceAdjustment: new Prisma.Decimal(input.priceAdjustment),
          displayOrder: input.displayOrder,
        },
        select: PRESET_OPTION_SAFE_SELECT,
      });

      const translation = await tx.modifierPresetOptionTranslation.create({
        data: {
          modifierPresetOptionId: created.id,
          locale: restaurant.defaultLocale,
          name: input.name,
        },
        select: { name: true },
      });

      return { ...created, translations: [translation], canDelete: true };
    });

    return { outcome: 'created', data: this.toPresetOptionView(option) };
  }

  async updatePresetOption(
    input: UpdateModifierPresetOptionInput,
  ): Promise<UpdateModifierPresetOptionResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: input.presetId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }
    if (!isWellFormedUuid(input.presetOptionId)) {
      return { outcome: 'presetOptionNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modifierPresetOption.findFirst({
        where: {
          id: input.presetOptionId,
          modifierPresetId: preset.id,
          restaurantId: input.restaurantId,
        },
        select: PRESET_OPTION_SAFE_SELECT,
      });
      if (!existing) {
        return { outcome: 'presetOptionNotFound' };
      }

      const optionData: {
        status?: ModifierPresetOptionStatus;
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
        updatedOption = await tx.modifierPresetOption.update({
          where: { id: existing.id },
          data: optionData,
          select: PRESET_OPTION_SAFE_SELECT,
        });

        // Section 7: status/displayOrder sync unconditionally (no override
        // concept for either, Section 6 out of scope); priceAdjustment
        // syncs ONLY to linked Options that have NOT been Product-locally
        // overridden -- the CRITICAL EXAMPLE's exact behavior.
        const linkedUpdateData: { status?: ModifierPresetOptionStatus; displayOrder?: number } = {};
        if (input.status !== undefined) linkedUpdateData.status = input.status;
        if (input.displayOrder !== undefined) linkedUpdateData.displayOrder = input.displayOrder;
        if (Object.keys(linkedUpdateData).length > 0) {
          await tx.modifierOption.updateMany({
            where: { sourcePresetOptionId: existing.id },
            data: linkedUpdateData,
          });
        }
        if (input.priceAdjustment !== undefined) {
          await tx.modifierOption.updateMany({
            where: { sourcePresetOptionId: existing.id, priceIsOverridden: false },
            data: { priceAdjustment: new Prisma.Decimal(input.priceAdjustment) },
          });
        }
      } else if (input.name !== undefined) {
        updatedOption = await tx.modifierPresetOption.update({
          where: { id: existing.id },
          data: { updatedAt: new Date() },
          select: PRESET_OPTION_SAFE_SELECT,
        });
      }

      if (input.name !== undefined) {
        await tx.modifierPresetOptionTranslation.updateMany({
          where: { modifierPresetOptionId: existing.id, locale: restaurant.defaultLocale },
          data: { name: input.name },
        });
        await this.syncLinkedOptionTranslations(tx, existing.id, restaurant.defaultLocale, {
          name: input.name,
        });
      }

      const translation = await tx.modifierPresetOptionTranslation.findFirstOrThrow({
        where: { modifierPresetOptionId: existing.id, locale: restaurant.defaultLocale },
        select: { name: true },
      });
      const canDelete = !(await this.presetOptionHasLinkedOptions(existing.id));

      return {
        outcome: 'updated',
        data: this.toPresetOptionView({ ...updatedOption, translations: [translation], canDelete }),
      };
    });
  }

  async getPresetTranslations(
    scope: AuthorizedPresetScope,
  ): Promise<GetModifierPresetTranslationsResult> {
    if (!isWellFormedUuid(scope.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: scope.presetId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }

    const translations = await this.prisma.modifierPresetTranslation.findMany({
      where: { modifierPresetId: preset.id },
      select: { locale: true, name: true, helperText: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  async putPresetTranslation(
    input: PutModifierPresetTranslationInput,
  ): Promise<PutModifierPresetTranslationResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const preset = await tx.modifierPreset.findFirst({
        where: { id: input.presetId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!preset) {
        return { outcome: 'presetNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.modifierPresetTranslation.findUnique({
        where: { modifierPresetId_locale: { modifierPresetId: preset.id, locale: input.locale } },
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

      await tx.modifierPresetTranslation.upsert({
        where: { modifierPresetId_locale: { modifierPresetId: preset.id, locale: input.locale } },
        create: {
          modifierPresetId: preset.id,
          locale: input.locale,
          name: input.name,
          helperText: input.helperText,
        },
        update: { name: input.name, helperText: input.helperText },
      });
      await this.syncLinkedGroupTranslations(tx, preset.id, input.locale, {
        name: input.name,
        helperText: input.helperText,
      });

      await tx.modifierPreset.update({ where: { id: preset.id }, data: { updatedAt: new Date() } });

      return {
        outcome: 'updated',
        data: { locale: input.locale, name: input.name, helperText: input.helperText },
      };
    });
  }

  async deletePresetTranslation(
    input: DeleteModifierPresetTranslationInput,
  ): Promise<DeleteModifierPresetTranslationResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      const preset = await tx.modifierPreset.findFirst({
        where: { id: input.presetId, restaurantId: input.restaurantId },
        select: { id: true },
      });
      if (!preset) {
        return { outcome: 'presetNotFound' };
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

      const deleted = await tx.modifierPresetTranslation.deleteMany({
        where: { modifierPresetId: preset.id, locale: input.locale },
      });
      if (deleted.count > 0) {
        await tx.modifierPreset.update({ where: { id: preset.id }, data: { updatedAt: new Date() } });
      }

      return { outcome: 'deleted' };
    });
  }

  async getPresetOptionTranslations(
    scope: AuthorizedPresetOptionScope,
  ): Promise<GetModifierPresetOptionTranslationsResult> {
    if (!isWellFormedUuid(scope.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: scope.presetId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }
    if (!isWellFormedUuid(scope.presetOptionId)) {
      return { outcome: 'presetOptionNotFound' };
    }
    const option = await this.prisma.modifierPresetOption.findFirst({
      where: {
        id: scope.presetOptionId,
        modifierPresetId: preset.id,
        restaurantId: scope.restaurantId,
      },
      select: { id: true },
    });
    if (!option) {
      return { outcome: 'presetOptionNotFound' };
    }

    const translations = await this.prisma.modifierPresetOptionTranslation.findMany({
      where: { modifierPresetOptionId: option.id },
      select: { locale: true, name: true },
      orderBy: { locale: 'asc' },
    });

    return { outcome: 'found', data: translations };
  }

  async putPresetOptionTranslation(
    input: PutModifierPresetOptionTranslationInput,
  ): Promise<PutModifierPresetOptionTranslationResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: input.presetId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      if (!isWellFormedUuid(input.presetOptionId)) {
        return { outcome: 'presetOptionNotFound' };
      }
      const option = await tx.modifierPresetOption.findFirst({
        where: {
          id: input.presetOptionId,
          modifierPresetId: preset.id,
          restaurantId: input.restaurantId,
        },
        select: { id: true },
      });
      if (!option) {
        return { outcome: 'presetOptionNotFound' };
      }

      const localeActive = await isRestaurantLocaleActive(tx, input.restaurantId, input.locale);
      if (!localeActive) {
        return { outcome: 'localeNotActive' };
      }

      const existing = await tx.modifierPresetOptionTranslation.findUnique({
        where: {
          modifierPresetOptionId_locale: { modifierPresetOptionId: option.id, locale: input.locale },
        },
        select: { name: true },
      });
      const isNoOp = existing !== null && existing.name === input.name;
      if (isNoOp) {
        return { outcome: 'updated', data: { locale: input.locale, name: existing.name } };
      }

      await tx.modifierPresetOptionTranslation.upsert({
        where: {
          modifierPresetOptionId_locale: { modifierPresetOptionId: option.id, locale: input.locale },
        },
        create: { modifierPresetOptionId: option.id, locale: input.locale, name: input.name },
        update: { name: input.name },
      });
      await this.syncLinkedOptionTranslations(tx, option.id, input.locale, { name: input.name });

      await tx.modifierPresetOption.update({
        where: { id: option.id },
        data: { updatedAt: new Date() },
      });

      return { outcome: 'updated', data: { locale: input.locale, name: input.name } };
    });
  }

  async deletePresetOptionTranslation(
    input: DeleteModifierPresetOptionTranslationInput,
  ): Promise<DeleteModifierPresetOptionTranslationResult> {
    if (!isWellFormedUuid(input.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: input.presetId, restaurantId: input.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }

    return this.prisma.$transaction(async (tx) => {
      if (!isWellFormedUuid(input.presetOptionId)) {
        return { outcome: 'presetOptionNotFound' };
      }
      const option = await tx.modifierPresetOption.findFirst({
        where: {
          id: input.presetOptionId,
          modifierPresetId: preset.id,
          restaurantId: input.restaurantId,
        },
        select: { id: true },
      });
      if (!option) {
        return { outcome: 'presetOptionNotFound' };
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

      const deleted = await tx.modifierPresetOptionTranslation.deleteMany({
        where: { modifierPresetOptionId: option.id, locale: input.locale },
      });
      if (deleted.count > 0) {
        await tx.modifierPresetOption.update({
          where: { id: option.id },
          data: { updatedAt: new Date() },
        });
      }

      return { outcome: 'deleted' };
    });
  }

  /** Section 7 sync: propagates a Preset's name/helperText for ONE locale to every linked Product-local ModifierGroupTranslation for that SAME locale. A Group not yet carrying that locale (e.g. a secondary locale added to the Preset after the Group was created) is simply left as-is by `updateMany` -- it never invents a new translation row on a Product-local Group behind Staff's back. */
  private async syncLinkedGroupTranslations(
    tx: Prisma.TransactionClient,
    presetId: string,
    locale: string,
    data: { name?: string; helperText?: string | null },
  ): Promise<void> {
    const linkedGroups = await tx.modifierGroup.findMany({
      where: { sourcePresetId: presetId },
      select: { id: true },
    });
    if (linkedGroups.length === 0) return;

    await tx.modifierGroupTranslation.updateMany({
      where: { modifierGroupId: { in: linkedGroups.map((group) => group.id) }, locale },
      data,
    });
  }

  /** Section 7 sync: propagates a Preset Option's name for ONE locale to every linked Product-local ModifierOptionTranslation for that SAME locale. */
  private async syncLinkedOptionTranslations(
    tx: Prisma.TransactionClient,
    presetOptionId: string,
    locale: string,
    data: { name: string },
  ): Promise<void> {
    const linkedOptions = await tx.modifierOption.findMany({
      where: { sourcePresetOptionId: presetOptionId },
      select: { id: true },
    });
    if (linkedOptions.length === 0) return;

    await tx.modifierOptionTranslation.updateMany({
      where: { modifierOptionId: { in: linkedOptions.map((option) => option.id) }, locale },
      data,
    });
  }

  private toPresetOptionView(option: {
    id: string;
    status: ModifierPresetOptionStatus;
    priceAdjustment: Prisma.Decimal;
    displayOrder: number;
    canDelete: boolean;
    translations: { name: string }[];
  }): ModifierPresetOptionView {
    return {
      id: option.id,
      status: option.status,
      name: option.translations[0]?.name ?? '',
      priceAdjustment: formatMoney(option.priceAdjustment),
      displayOrder: option.displayOrder,
      canDelete: option.canDelete,
    };
  }

  private toPresetView(preset: {
    id: string;
    status: ModifierPresetStatus;
    minimumSelections: number;
    maximumSelections: number;
    displayOrder: number;
    canDelete: boolean;
    translations: { name: string; helperText: string | null }[];
    options: {
      id: string;
      status: ModifierPresetOptionStatus;
      priceAdjustment: Prisma.Decimal;
      displayOrder: number;
      canDelete: boolean;
      translations: { name: string }[];
    }[];
  }): ModifierPresetView {
    return {
      id: preset.id,
      status: preset.status,
      name: preset.translations[0]?.name ?? '',
      helperText: preset.translations[0]?.helperText ?? null,
      minimumSelections: preset.minimumSelections,
      maximumSelections: preset.maximumSelections,
      displayOrder: preset.displayOrder,
      options: preset.options.map((option) => this.toPresetOptionView(option)),
      canDelete: preset.canDelete,
    };
  }

  /** FT-6B closeout, Section 5: is this Preset currently linked to ANY Product (regardless of that Group's own active/inactive state)? */
  private async presetHasLinkedGroups(presetId: string): Promise<boolean> {
    const count = await this.prisma.modifierGroup.count({ where: { sourcePresetId: presetId } });
    return count > 0;
  }

  /** FT-6B closeout, Section 5: is this Preset Option currently linked to ANY Product-local Option? */
  private async presetOptionHasLinkedOptions(presetOptionId: string): Promise<boolean> {
    const count = await this.prisma.modifierOption.count({
      where: { sourcePresetOptionId: presetOptionId },
    });
    return count > 0;
  }

  /**
   * FT-6B closeout, Section 5: hard DELETE a Preset, but ONLY when it is
   * not currently attached to any Product (`ModifierPresetView.canDelete`).
   * Never cascades into Product-local Groups -- those are a separate
   * runtime authority (Section 3) and the FK is `SetNull`, not `Restrict`,
   * specifically so this check (not a DB constraint) is the one true guard.
   */
  async deletePreset(scope: AuthorizedPresetScope): Promise<DeleteModifierPresetResult> {
    if (!isWellFormedUuid(scope.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: scope.presetId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }
    if (await this.presetHasLinkedGroups(preset.id)) {
      return { outcome: 'hasLinkedProducts' };
    }

    await this.prisma.modifierPreset.delete({ where: { id: preset.id } });
    return { outcome: 'deleted' };
  }

  /**
   * FT-6B closeout, Section 5: hard DELETE a Preset Option, same
   * "unreferenced only" rule as `deletePreset`.
   */
  async deletePresetOption(
    scope: AuthorizedPresetOptionScope,
  ): Promise<DeleteModifierPresetOptionResult> {
    if (!isWellFormedUuid(scope.presetId)) {
      return { outcome: 'presetNotFound' };
    }
    const preset = await this.prisma.modifierPreset.findFirst({
      where: { id: scope.presetId, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!preset) {
      return { outcome: 'presetNotFound' };
    }
    if (!isWellFormedUuid(scope.presetOptionId)) {
      return { outcome: 'presetOptionNotFound' };
    }
    const option = await this.prisma.modifierPresetOption.findFirst({
      where: { id: scope.presetOptionId, modifierPresetId: preset.id, restaurantId: scope.restaurantId },
      select: { id: true },
    });
    if (!option) {
      return { outcome: 'presetOptionNotFound' };
    }
    if (await this.presetOptionHasLinkedOptions(option.id)) {
      return { outcome: 'hasLinkedProducts' };
    }

    await this.prisma.modifierPresetOption.delete({ where: { id: option.id } });
    return { outcome: 'deleted' };
  }
}
