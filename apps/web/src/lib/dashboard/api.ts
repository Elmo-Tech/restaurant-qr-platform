import { apiFetch } from '../api/client';
import type { DashboardMetrics, DashboardRange } from './types';

export interface DashboardQuery {
  branchId?: string;
  range: DashboardRange;
  /** Required only when `range === 'custom'`, as `YYYY-MM-DD` local calendar dates. */
  from?: string;
  to?: string;
}

/** Thin Staff Dashboard request layer (FT-11), mirroring `lib/orders/api.ts`'s exact pattern. */
export async function getDashboardMetrics(
  restaurantId: string,
  query: DashboardQuery,
): Promise<DashboardMetrics> {
  const search = new URLSearchParams();
  if (query.branchId) search.set('branchId', query.branchId);
  search.set('range', query.range);
  if (query.from) search.set('from', query.from);
  if (query.to) search.set('to', query.to);

  const body = await apiFetch<{ data: DashboardMetrics }>(
    `/restaurants/${restaurantId}/dashboard?${search.toString()}`,
  );
  return body.data;
}
