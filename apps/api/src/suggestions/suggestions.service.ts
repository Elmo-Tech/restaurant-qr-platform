import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FeatureNotAvailableError } from '../entitlements/features';
import type { SuggestionsMode } from '../generated/prisma/client';
import {
  AUTO_MIN_SERVED_ORDERS,
  AUTO_WINDOW_DAYS,
  MAX_RULES_PER_PRODUCT,
} from './suggestion-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SuggestionsSettings {
  mode: SuggestionsMode;
  /** How much data the automatic source has: it starts once `servedOrders` reaches `minimumOrders`. */
  automatic: {
    servedOrders: number;
    minimumOrders: number;
    windowDays: number;
    ready: boolean;
  };
}

export type ProductRulesResult =
  | { outcome: 'ok'; productIds: string[] }
  | { outcome: 'notFound' }
  | { outcome: 'invalid' };

/**
 * Staff side of smart suggestions (DEC-042): the Restaurant's mode and the manual rules per
 * product. Every query carries the authorized Restaurant id; a product of another Restaurant is
 * "not found", never an error that reveals it exists.
 */
@Injectable()
export class SuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async getSettings(restaurantId: string): Promise<SuggestionsSettings> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { suggestionsMode: true },
    });
    const servedOrders = await this.prisma.order.count({
      where: {
        restaurantId,
        status: 'SERVED',
        createdAt: { gte: new Date(Date.now() - AUTO_WINDOW_DAYS * DAY_MS) },
      },
    });
    return {
      mode: restaurant.suggestionsMode,
      automatic: {
        servedOrders,
        minimumOrders: AUTO_MIN_SERVED_ORDERS,
        windowDays: AUTO_WINDOW_DAYS,
        ready: servedOrders >= AUTO_MIN_SERVED_ORDERS,
      },
    };
  }

  async setMode(
    restaurantId: string,
    mode: SuggestionsMode,
  ): Promise<SuggestionsSettings> {
    // Turning suggestions on is a platform feature (DEC-043); turning them off is always allowed.
    if (mode !== 'OFF' && !(await this.entitlements.isEnabled(restaurantId, 'SMART_SUGGESTIONS'))) {
      throw new FeatureNotAvailableError('SMART_SUGGESTIONS');
    }
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { suggestionsMode: mode },
    });
    return this.getSettings(restaurantId);
  }

  async getProductRules(
    restaurantId: string,
    productId: string,
  ): Promise<ProductRulesResult> {
    if (!isWellFormedUuid(productId)) return { outcome: 'notFound' };
    const product = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: { id: true },
    });
    if (!product) return { outcome: 'notFound' };
    const rows = await this.prisma.productSuggestion.findMany({
      where: { restaurantId, productId },
      orderBy: { position: 'asc' },
      select: { suggestedProductId: true },
    });
    return {
      outcome: 'ok',
      productIds: rows.map((row) => row.suggestedProductId),
    };
  }

  /**
   * Replace a product's rules with `productIds` (in order). Invalid when it lists the product
   * itself, a repeat, too many, or a product that is not this Restaurant's.
   */
  async replaceProductRules(
    restaurantId: string,
    productId: string,
    productIds: readonly string[],
  ): Promise<ProductRulesResult> {
    if (!isWellFormedUuid(productId)) return { outcome: 'notFound' };
    const product = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId },
      select: { id: true },
    });
    if (!product) return { outcome: 'notFound' };

    const unique = new Set(productIds);
    if (
      unique.size !== productIds.length ||
      productIds.length > MAX_RULES_PER_PRODUCT ||
      unique.has(productId)
    ) {
      return { outcome: 'invalid' };
    }
    if (productIds.length > 0) {
      const known = await this.prisma.product.count({
        where: { restaurantId, id: { in: [...productIds] } },
      });
      if (known !== productIds.length) return { outcome: 'invalid' };
    }

    await this.prisma.$transaction([
      this.prisma.productSuggestion.deleteMany({
        where: { restaurantId, productId },
      }),
      this.prisma.productSuggestion.createMany({
        data: productIds.map((suggestedProductId, position) => ({
          restaurantId,
          productId,
          suggestedProductId,
          position,
        })),
      }),
    ]);
    return { outcome: 'ok', productIds: [...productIds] };
  }
}
