import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveFeatures, type FeatureKey, type FeatureMap } from './features';

/**
 * "May this Restaurant use feature X" (DEC-043, DEC-046): the single question every gated feature
 * asks. Reads the Restaurant's own overrides and its package (none = every feature) with one
 * tenant-scoped query; never trusts a feature list sent by a client.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every feature for one Restaurant. */
  async forRestaurant(restaurantId: string): Promise<FeatureMap> {
    const row = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        features: { select: { feature: true, enabled: true } },
        package: { select: { features: { select: { feature: true } } } },
      },
    });
    return resolveFeatures(
      row?.features ?? [],
      row?.package?.features.map((f) => f.feature),
    );
  }

  /** Every feature for several Restaurants (one query), keyed by Restaurant id. */
  async forRestaurants(
    restaurantIds: readonly string[],
  ): Promise<Map<string, FeatureMap>> {
    const rows = await this.prisma.restaurant.findMany({
      where: { id: { in: [...restaurantIds] } },
      select: {
        id: true,
        features: { select: { feature: true, enabled: true } },
        package: { select: { features: { select: { feature: true } } } },
      },
    });
    const byRestaurant = new Map<string, FeatureMap>();
    for (const id of restaurantIds) {
      const row = rows.find((candidate) => candidate.id === id);
      byRestaurant.set(
        id,
        resolveFeatures(
          row?.features ?? [],
          row?.package?.features.map((f) => f.feature),
        ),
      );
    }
    return byRestaurant;
  }

  async isEnabled(restaurantId: string, feature: FeatureKey): Promise<boolean> {
    return (await this.forRestaurant(restaurantId))[feature];
  }
}
