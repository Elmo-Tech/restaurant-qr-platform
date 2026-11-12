import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ModifierGroupStatus, ModifierOptionStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { isWellFormedUuid } from '../common/is-uuid';
import type { PutModifierSizeSettingsDto } from './dto/put-modifier-size-settings.dto';

export interface ModifierSizeScope {
  restaurantId: string;
  productId: string;
  groupId: string;
  variantId: string;
}

export interface ModifierSizeSettingsView {
  enabled: boolean;
  options: { optionId: string; enabled: boolean; priceAdjustment: string | null }[];
}

const NOT_FOUND = { error: { code: 'MODIFIER_SIZE_NOT_FOUND', message: 'Product modifier or size not found.' } };
const INVALID_OPTIONS = { error: { code: 'MODIFIER_SIZE_INVALID_OPTIONS', message: 'Supply this group\'s options once each, with valid enabled flags and prices.' } };
const UNSATISFIABLE = { error: { code: 'MODIFIER_SIZE_REQUIRED_UNAVAILABLE', message: 'This size must allow enough active options to satisfy the required group.' } };

/**
 * Per-size overrides for a Product-local Modifier Group/Option.
 *
 * No override rows = inherit original Product or linked Preset settings. The
 * server validates the Restaurant+Product identity of BOTH group and size,
 * and every Option under that group, before making any mutation. Guest reads
 * the same live rows when quoting / accepting an Order.
 */
@Injectable()
export class ModifierSizeSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(scope: ModifierSizeScope, tx: Prisma.TransactionClient | PrismaService) {
    if (![scope.productId, scope.groupId, scope.variantId].every(isWellFormedUuid)) {
      throw new NotFoundException(NOT_FOUND);
    }
    const [group, variant] = await Promise.all([
      tx.modifierGroup.findFirst({
        where: { id: scope.groupId, productId: scope.productId, restaurantId: scope.restaurantId },
        select: {
          id: true, status: true, minimumSelections: true,
          options: { select: { id: true, status: true } },
        },
      }),
      tx.productVariant.findFirst({
        where: { id: scope.variantId, productId: scope.productId, restaurantId: scope.restaurantId },
        select: { id: true },
      }),
    ]);
    if (!group || !variant) throw new NotFoundException(NOT_FOUND);
    return group;
  }

  async get(scope: ModifierSizeScope): Promise<ModifierSizeSettingsView> {
    const group = await this.scope(scope, this.prisma);
    const [setting, optionSettings] = await Promise.all([
      this.prisma.modifierGroupSizeSetting.findUnique({
        where: { groupId_variantId: { groupId: group.id, variantId: scope.variantId } },
        select: { enabled: true },
      }),
      this.prisma.modifierOptionSizeSetting.findMany({
        where: { variantId: scope.variantId, optionId: { in: group.options.map(option => option.id) } },
        select: { optionId: true, enabled: true, priceAdjustment: true },
      }),
    ]);
    const byOption = new Map(optionSettings.map(row => [row.optionId, row]));
    return {
      enabled: setting?.enabled ?? true,
      options: group.options.map(option => ({
        optionId: option.id,
        enabled: byOption.get(option.id)?.enabled ?? true,
        priceAdjustment: byOption.get(option.id)?.priceAdjustment?.toFixed(2) ?? null,
      })),
    };
  }

  async put(scope: ModifierSizeScope, input: PutModifierSizeSettingsDto): Promise<ModifierSizeSettingsView> {
    // Every write must happen together or not at all: no partial selection rules.
    return this.prisma.$transaction(async tx => {
      const group = await this.scope(scope, tx);
      const byOption = new Map(input.options.map(option => [option.optionId, option]));
      if (byOption.size !== group.options.length ||
        group.options.some(option => !byOption.has(option.id))) {
        throw new BadRequestException(INVALID_OPTIONS);
      }

      if (input.enabled && group.status === ModifierGroupStatus.ACTIVE &&
        group.options.filter(option =>
          option.status === ModifierOptionStatus.ACTIVE && byOption.get(option.id)?.enabled).length < group.minimumSelections) {
        throw new BadRequestException(UNSATISFIABLE);
      }

      await tx.modifierGroupSizeSetting.deleteMany({
        where: { groupId: group.id, variantId: scope.variantId },
      });
      if (!input.enabled) {
        await tx.modifierGroupSizeSetting.create({
          data: { restaurantId: scope.restaurantId, groupId: group.id,
            variantId: scope.variantId, enabled: false },
        });
      }

      await tx.modifierOptionSizeSetting.deleteMany({
        where: { variantId: scope.variantId, optionId: { in: group.options.map(option => option.id) } },
      });
      const overrides = input.options.filter(option => !option.enabled || option.priceAdjustment != null);
      if (overrides.length) {
        await tx.modifierOptionSizeSetting.createMany({
          data: overrides.map(option => ({
            restaurantId: scope.restaurantId, optionId: option.optionId,
            variantId: scope.variantId, enabled: option.enabled,
            priceAdjustment: option.priceAdjustment == null ? null : new Prisma.Decimal(option.priceAdjustment),
          })),
        });
      }
      return {
        enabled: input.enabled,
        options: group.options.map(option => ({
          optionId: option.id,
          enabled: byOption.get(option.id)!.enabled,
          priceAdjustment: byOption.get(option.id)!.priceAdjustment == null
            ? null : new Prisma.Decimal(byOption.get(option.id)!.priceAdjustment!).toFixed(2),
        })),
      };
    });
  }
}
