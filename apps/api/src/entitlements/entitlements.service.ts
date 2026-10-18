import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveFeatures, type FeatureKey, type FeatureMap } from './features';

/**
 * "May this Restaurant use feature X" (DEC-043): the single question every gated feature asks.
 * Reads the Restaurant's overrides (none = the default, every feature) with one tenant-scoped
 * query; never trusts a feature list sent by a client.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every feature for one Restaurant. */
  async forRestaurant(restaurantId: string): Promise<FeatureMap> {
    const rows = await this.prisma.restaurantFeature.findMany({
      where: { restaurantId },
      select: { feature: true, enabled: true },
    });
    return resolveFeatures(rows);
  }

  /** Every feature for several Restaurants (one query), keyed by Restaurant id. */
  async forRestaurants(
    restaurantIds: readonly string[],
  ): Promise<Map<string, FeatureMap>> {
    const rows = await this.prisma.restaurantFeature.findMany({
      where: { restaurantId: { in: [...restaurantIds] } },
      select: { restaurantId: true, feature: true, enabled: true },
    });
    const byRestaurant = new Map<string, FeatureMap>();
    for (const id of restaurantIds) {
      byRestaurant.set(
        id,
        resolveFeatures(rows.filter((row) => row.restaurantId === id)),
      );
    }
    return byRestaurant;
  }

  async isEnabled(restaurantId: string, feature: FeatureKey): Promise<boolean> {
    return (await this.forRestaurant(restaurantId))[feature];
  }
}
