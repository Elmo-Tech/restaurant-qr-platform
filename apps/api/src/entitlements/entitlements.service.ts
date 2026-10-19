import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { resolveFeatures, type FeatureKey, type FeatureMap } from './features';
import {
  allowedTemplates,
  type MenuTemplateKey,
  type PackageTemplateRule,
} from './templates';

/** What a Restaurant may use: its features and the Guest menu templates (DEC-043, DEC-051). */
export interface RestaurantEntitlements {
  features: FeatureMap;
  templates: MenuTemplateKey[];
}

const entitlementSelect = {
  features: { select: { feature: true, enabled: true } },
  package: {
    select: {
      allTemplates: true,
      features: { select: { feature: true } },
      templates: { select: { template: true } },
    },
  },
} as const;

interface EntitlementRow {
  features: { feature: string; enabled: boolean }[];
  package: {
    allTemplates: boolean;
    features: { feature: string }[];
    templates: { template: string }[];
  } | null;
}

function resolveRow(row: EntitlementRow | undefined): RestaurantEntitlements {
  const features = resolveFeatures(
    row?.features ?? [],
    row?.package?.features.map((f) => f.feature),
  );
  const rule: PackageTemplateRule | null = row?.package
    ? {
        includesFeature: row.package.features.some(
          (f) => f.feature === 'MENU_TEMPLATES',
        ),
        all: row.package.allTemplates,
        selected: row.package.templates.map((t) => t.template),
      }
    : null;
  return {
    features,
    templates: allowedTemplates({
      featureEnabled: features.MENU_TEMPLATES,
      rule,
    }),
  };
}

/**
 * "May this Restaurant use feature X, or template Y" (DEC-043, DEC-046, DEC-051): the single question every
 * gated feature asks. Reads the Restaurant's own overrides and its package (none = every feature) with one
 * tenant-scoped query; never trusts a feature list sent by a client.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every feature for one Restaurant. */
  async forRestaurant(restaurantId: string): Promise<FeatureMap> {
    return (await this.detailsFor(restaurantId)).features;
  }

  /** The features and the allowed templates of one Restaurant, from one query. */
  async detailsFor(restaurantId: string): Promise<RestaurantEntitlements> {
    const row = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: entitlementSelect,
    });
    return resolveRow(row ?? undefined);
  }

  /** The templates one Restaurant may use (Classic always). */
  async templatesFor(restaurantId: string): Promise<MenuTemplateKey[]> {
    return (await this.detailsFor(restaurantId)).templates;
  }

  /** Every feature for several Restaurants (one query), keyed by Restaurant id. */
  async forRestaurants(
    restaurantIds: readonly string[],
  ): Promise<Map<string, FeatureMap>> {
    const details = await this.detailsForRestaurants(restaurantIds);
    return new Map(
      [...details].map(([id, value]) => [id, value.features] as const),
    );
  }

  /** Features and allowed templates for several Restaurants (one query), keyed by Restaurant id. */
  async detailsForRestaurants(
    restaurantIds: readonly string[],
  ): Promise<Map<string, RestaurantEntitlements>> {
    const rows = await this.prisma.restaurant.findMany({
      where: { id: { in: [...restaurantIds] } },
      select: { id: true, ...entitlementSelect },
    });
    const byRestaurant = new Map<string, RestaurantEntitlements>();
    for (const id of restaurantIds) {
      byRestaurant.set(id, resolveRow(rows.find((row) => row.id === id)));
    }
    return byRestaurant;
  }

  async isEnabled(restaurantId: string, feature: FeatureKey): Promise<boolean> {
    return (await this.forRestaurant(restaurantId))[feature];
  }
}
