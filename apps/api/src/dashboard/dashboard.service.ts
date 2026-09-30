import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { OrderStatus, OrderType } from '../generated/prisma/client';
import { resolveOrderBranchIdFilter, type OrderBranchScope } from '../orders/order-branch-scope';
import { averageOf, calculateOrderTiming } from '../orders/order-timing';
import { resolveDashboardDateRange } from './dashboard-date-range';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';

/** Statuses that still require operational attention right now (mirrors the Staff Orders workspace's own "Active" view, `lib/orders/order-views.ts` on the Web). Not bound by the selected date range -- this is a live count. */
const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

/** ORDER_LIFECYCLE_SPEC.md #72/73: a REJECTED or CANCELLED Order contributes 0 to any payable/financial total, but still counts as a real submitted Order for volume purposes. */
const NON_REVENUE_STATUSES: readonly OrderStatus[] = ['REJECTED', 'CANCELLED'];

const ALL_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
];
const ALL_TYPES: readonly OrderType[] = ['DINE_IN', 'PICKUP', 'DELIVERY'];

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export interface DashboardKpis {
  revenue: string;
  totalOrders: number;
  averageOrderValue: string;
  activeOrders: number;
}

export interface DashboardTypeBreakdown {
  count: number;
  revenue: string;
}

export interface DashboardTiming {
  acceptanceSeconds: number | null;
  preparationSeconds: number | null;
  readyWaitSeconds: number | null;
  pickupFulfillmentSeconds: number | null;
  deliveryFulfillmentSeconds: number | null;
  totalFulfillmentSeconds: number | null;
}

export interface DashboardTimeSeriesPoint {
  bucketStart: string;
  orderCount: number;
  revenue: string;
}

export interface DashboardMetrics {
  range: { from: string; to: string };
  kpis: DashboardKpis;
  byType: Record<OrderType, DashboardTypeBreakdown>;
  byStatus: Record<OrderStatus, number>;
  timing: DashboardTiming;
  timeSeries: DashboardTimeSeriesPoint[];
}

/**
 * FT-11 Section 6: the Dashboard analytics read model. Deliberately NOT a
 * BI engine (Section 6/9) -- one bounded `Order` read plus one bounded
 * `OrderStatusEvent` read for the resolved window, aggregated in
 * application code with exact `Prisma.Decimal` arithmetic, never
 * JavaScript floating point (CLAUDE.md #27). At realistic single-Restaurant
 * Pilot volume (hundreds, not millions, of Orders per month) this stays
 * fast without any raw SQL or window functions.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(scope: OrderBranchScope, query: DashboardQueryDto): Promise<DashboardMetrics> {
    const branchIdFilter = await resolveOrderBranchIdFilter(this.prisma, scope, query.branchId);

    const branches = await this.prisma.branch.findMany({
      where: {
        restaurantId: scope.restaurantId,
        ...(branchIdFilter ? { id: { in: branchIdFilter } } : {}),
      },
      select: { id: true, timezone: true },
      orderBy: { id: 'asc' },
    });
    // FT-11 Section 7 documented assumption: a Dashboard view spanning more
    // than one Branch (no branchId filter, multiple authorized Branches) has
    // no single well-defined "Restaurant timezone" -- the first authorized
    // Branch (by id) is used as the day-boundary reference for the whole
    // Restaurant-wide view. A single selected Branch always uses its own
    // timezone exactly.
    const timezone = branches[0]?.timezone ?? 'UTC';

    const { from, to, isSingleDay } = resolveDashboardDateRange(
      query.range,
      timezone,
      { from: query.from, to: query.to },
    );

    const branchWhere = branchIdFilter ? { branchId: { in: branchIdFilter } } : {};

    const [activeOrders, ordersInRange] = await Promise.all([
      this.prisma.order.count({
        where: { restaurantId: scope.restaurantId, ...branchWhere, status: { in: [...ACTIVE_STATUSES] } },
      }),
      this.prisma.order.findMany({
        where: {
          restaurantId: scope.restaurantId,
          ...branchWhere,
          createdAt: { gte: from, lt: to },
        },
        select: { id: true, createdAt: true, status: true, type: true, totalAmount: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const orderIds = ordersInRange.map((order) => order.id);
    const events =
      orderIds.length > 0
        ? await this.prisma.orderStatusEvent.findMany({
            where: { orderId: { in: orderIds } },
            select: { orderId: true, newStatus: true, transitionedAt: true },
            orderBy: { transitionedAt: 'asc' },
          })
        : [];
    const eventsByOrderId = new Map<string, { newStatus: OrderStatus; transitionedAt: Date }[]>();
    for (const event of events) {
      const list = eventsByOrderId.get(event.orderId) ?? [];
      list.push({ newStatus: event.newStatus, transitionedAt: event.transitionedAt });
      eventsByOrderId.set(event.orderId, list);
    }

    const revenueOrders = ordersInRange.filter((order) => !NON_REVENUE_STATUSES.includes(order.status));
    const revenue = revenueOrders.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0));
    const averageOrderValue =
      revenueOrders.length > 0 ? revenue.dividedBy(revenueOrders.length) : new Prisma.Decimal(0);

    const byType = Object.fromEntries(
      ALL_TYPES.map((type) => {
        const ordersOfType = revenueOrders.filter((order) => order.type === type);
        const typeRevenue = ordersOfType.reduce(
          (sum, order) => sum.plus(order.totalAmount),
          new Prisma.Decimal(0),
        );
        return [type, { count: ordersOfType.length, revenue: money(typeRevenue) }];
      }),
    ) as Record<OrderType, DashboardTypeBreakdown>;

    const byStatus = Object.fromEntries(
      ALL_STATUSES.map((status) => [
        status,
        ordersInRange.filter((order) => order.status === status).length,
      ]),
    ) as Record<OrderStatus, number>;

    const timingSamples = ordersInRange.map((order) =>
      calculateOrderTiming({
        type: order.type,
        createdAt: order.createdAt,
        events: eventsByOrderId.get(order.id) ?? [],
      }),
    );
    const timing: DashboardTiming = {
      acceptanceSeconds: averageOf(timingSamples.map((sample) => sample.acceptanceSeconds)),
      preparationSeconds: averageOf(timingSamples.map((sample) => sample.preparationSeconds)),
      readyWaitSeconds: averageOf(timingSamples.map((sample) => sample.readyWaitSeconds)),
      pickupFulfillmentSeconds: averageOf(
        timingSamples.map((sample) => sample.pickupFulfillmentSeconds),
      ),
      deliveryFulfillmentSeconds: averageOf(
        timingSamples.map((sample) => sample.deliveryFulfillmentSeconds),
      ),
      totalFulfillmentSeconds: averageOf(timingSamples.map((sample) => sample.totalFulfillmentSeconds)),
    };

    const timeSeries = buildTimeSeries(ordersInRange, from, to, isSingleDay);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        revenue: money(revenue),
        totalOrders: ordersInRange.length,
        averageOrderValue: money(averageOrderValue),
        activeOrders,
      },
      byType,
      byStatus,
      timing,
      timeSeries,
    };
  }
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Buckets by hour for a single-day range, otherwise by day -- a plain in-memory bucket pass over the one already-fetched order list (Section 6/9: no second query, no raw SQL date_trunc). */
function buildTimeSeries(
  orders: readonly { createdAt: Date; totalAmount: Prisma.Decimal; status: OrderStatus }[],
  from: Date,
  to: Date,
  isSingleDay: boolean,
): DashboardTimeSeriesPoint[] {
  const bucketSizeMs = isSingleDay ? HOUR_MS : DAY_MS;
  const bucketCount = Math.round((to.getTime() - from.getTime()) / bucketSizeMs);

  const buckets: { orderCount: number; revenue: Prisma.Decimal }[] = Array.from(
    { length: bucketCount },
    () => ({ orderCount: 0, revenue: new Prisma.Decimal(0) }),
  );

  for (const order of orders) {
    const index = Math.floor((order.createdAt.getTime() - from.getTime()) / bucketSizeMs);
    if (index < 0 || index >= buckets.length) continue;
    // Volume counts every submitted Order (matches `byStatus`'s totals);
    // only revenue excludes REJECTED/CANCELLED (ORDER_LIFECYCLE_SPEC.md #72/73).
    buckets[index].orderCount += 1;
    if (!NON_REVENUE_STATUSES.includes(order.status)) {
      buckets[index].revenue = buckets[index].revenue.plus(order.totalAmount);
    }
  }

  return buckets.map((bucket, index) => ({
    bucketStart: new Date(from.getTime() + index * bucketSizeMs).toISOString(),
    orderCount: bucket.orderCount,
    revenue: money(bucket.revenue),
  }));
}
