import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FEATURE_KEYS, resolveFeatures } from '../entitlements/features';
import {
  PlatformAuditService,
  type AuditEntryView,
} from './platform-audit.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlatformOverview {
  restaurants: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
  };
  last30Days: { newRestaurants: number; orders: number };
  totals: { branches: number; products: number; orders: number };
  /** Restaurants with at least one feature switched off by the platform. */
  restrictedRestaurants: number;
  recentRestaurants: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
  recentActivity: AuditEntryView[];
}

/** The numbers on the platform home screen: aggregates only, no personal or order data. */
@Injectable()
export class PlatformOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(): Promise<PlatformOverview> {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [
      byStatus,
      newRestaurants,
      orders30d,
      branches,
      products,
      orders,
      restricted,
      recent,
      activity,
    ] = await Promise.all([
      this.prisma.restaurant.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.restaurant.count({ where: { createdAt: { gte: since } } }),
      this.prisma.order.count({ where: { createdAt: { gte: since } } }),
      this.prisma.branch.count(),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.restrictedRestaurantCount(),
      this.prisma.restaurant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.audit.recent({ limit: 8 }),
    ]);
    const count = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;
    return {
      restaurants: {
        total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        active: count('ACTIVE'),
        suspended: count('SUSPENDED'),
        inactive: count('INACTIVE'),
      },
      last30Days: { newRestaurants, orders: orders30d },
      totals: { branches, products, orders },
      restrictedRestaurants: restricted,
      recentRestaurants: recent.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      recentActivity: activity,
    };
  }

  /** Restaurants that effectively lack at least one feature (their package and overrides applied). */
  private async restrictedRestaurantCount(): Promise<number> {
    const rows = await this.prisma.restaurant.findMany({
      select: {
        features: { select: { feature: true, enabled: true } },
        package: { select: { features: { select: { feature: true } } } },
      },
    });
    return rows.filter((row) => {
      const effective = resolveFeatures(
        row.features,
        row.package?.features.map((f) => f.feature),
      );
      return FEATURE_KEYS.some((key) => !effective[key]);
    }).length;
  }
}
