import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  AUTO_MIN_SERVED_ORDERS,
  AUTO_MIN_TOGETHER,
  AUTO_WINDOW_DAYS,
  mergeSuggestions,
  usesAutomatic,
  usesManualRules,
} from '../suggestions/suggestion-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Complete your meal" (DEC-042, slice 8): which products the Guest cart suggests. Everything
 * is scoped to the Restaurant the public code belongs to; the answer is a list of product
 * ids the menu the Guest already loaded can show, never a name, price or any order data.
 */
@Injectable()
export class PublicSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(input: {
    publicCode: string;
    productIds: readonly string[];
  }): Promise<string[]> {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode: input.publicCode },
      select: {
        status: true,
        restaurantId: true,
        restaurant: { select: { status: true, suggestionsMode: true } },
      },
    });
    if (!qr || qr.status !== 'ACTIVE' || qr.restaurant.status !== 'ACTIVE')
      return [];
    const mode = qr.restaurant.suggestionsMode;
    if (mode === 'OFF') return [];

    const restaurantId = qr.restaurantId;
    const cart = [...new Set(input.productIds)];

    const manual = usesManualRules(mode)
      ? await this.manualRules(restaurantId, cart)
      : [];
    const automatic = usesAutomatic(mode)
      ? await this.boughtTogether(restaurantId, cart)
      : [];

    const candidates = [...new Set([...manual, ...automatic])];
    if (candidates.length === 0) return [];
    // Only what the Guest could actually order from the live menu right now.
    const eligibleRows = await this.prisma.product.findMany({
      where: {
        restaurantId,
        id: { in: candidates },
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        category: {
          status: 'ACTIVE',
          menu: { isPrimary: true, status: 'ACTIVE' },
        },
      },
      select: { id: true },
    });
    return mergeSuggestions({
      cart,
      manual,
      automatic,
      eligible: new Set(eligibleRows.map((row) => row.id)),
    });
  }

  /** The Restaurant's own rules for the products in the cart: cart order first, then each rule's order. */
  private async manualRules(
    restaurantId: string,
    cart: readonly string[],
  ): Promise<string[]> {
    const rows = await this.prisma.productSuggestion.findMany({
      where: { restaurantId, productId: { in: [...cart] } },
      select: { productId: true, suggestedProductId: true, position: true },
    });
    return rows
      .sort(
        (a, b) =>
          cart.indexOf(a.productId) - cart.indexOf(b.productId) ||
          a.position - b.position,
      )
      .map((row) => row.suggestedProductId);
  }

  /**
   * Products most often ordered together with the cart's products in this Restaurant's own
   * served orders (last `AUTO_WINDOW_DAYS` days). Aggregate counts only, and only once there is
   * enough data: a young menu with a few orders answers nothing rather than something random.
   */
  private async boughtTogether(
    restaurantId: string,
    cart: readonly string[],
  ): Promise<string[]> {
    const since = new Date(Date.now() - AUTO_WINDOW_DAYS * DAY_MS);
    const served = await this.prisma.order.count({
      where: { restaurantId, status: 'SERVED', createdAt: { gte: since } },
    });
    if (served < AUTO_MIN_SERVED_ORDERS) return [];
    const rows = await this.prisma.$queryRaw<{ suggested: string }[]>`
      SELECT oi2.product_id::text AS suggested
      FROM order_items oi1
      JOIN orders o ON o.id = oi1.order_id
      JOIN order_items oi2 ON oi2.order_id = o.id AND oi2.product_id <> oi1.product_id
      WHERE o.restaurant_id = ${restaurantId}::uuid
        AND o.status = 'SERVED'
        AND o.created_at >= ${since}
        AND oi1.product_id = ANY(${[...cart]}::uuid[])
      GROUP BY oi2.product_id
      HAVING COUNT(DISTINCT o.id) >= ${AUTO_MIN_TOGETHER}
      ORDER BY COUNT(DISTINCT o.id) DESC, oi2.product_id
      LIMIT 30`;
    return rows.map((row) => row.suggested);
  }
}
