import type { OrderStatus, OrderType } from '../orders/types';

export type DashboardRange = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

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

/**
 * FT-11: averages over Orders in the selected range, in whole seconds.
 * `null` means no Order in range has the supporting status events for that
 * duration (e.g. no Order was ever ACCEPTED) -- render as unavailable, never
 * as 0.
 */
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

/** Best sellers: units and line value over non-rejected, non-cancelled Orders in range. */
export interface DashboardTopProduct {
  productId: string;
  name: string;
  quantity: number;
  amount: string;
}

export interface DashboardMetrics {
  range: { from: string; to: string };
  kpis: DashboardKpis;
  byType: Record<OrderType, DashboardTypeBreakdown>;
  byStatus: Record<OrderStatus, number>;
  timing: DashboardTiming;
  timeSeries: DashboardTimeSeriesPoint[];
  topProducts: DashboardTopProduct[];
}
