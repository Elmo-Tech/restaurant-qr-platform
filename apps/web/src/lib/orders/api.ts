import { apiFetch } from '../api/client';
import type { OrderDetail, OrderListItem, OrderStatus } from './types';

/**
 * Thin Staff Order request layer (FT-5), mirroring `lib/menu/api.ts`'s/
 * `lib/tables/api.ts`'s exact pattern: each function calls the one
 * documented Backend route exactly, using the existing `apiFetch`
 * transport -- no generic repository-wide SDK.
 */
function restaurantPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}`;
}

export interface ListOrdersFilters {
  branchId?: string;
  status?: OrderStatus;
}

export async function listOrders(
  restaurantId: string,
  filters: ListOrdersFilters = {},
): Promise<OrderListItem[]> {
  const query = new URLSearchParams();
  if (filters.branchId) query.set('branchId', filters.branchId);
  if (filters.status) query.set('status', filters.status);
  const queryString = query.size > 0 ? `?${query.toString()}` : '';

  const body = await apiFetch<{ data: OrderListItem[] }>(
    `${restaurantPath(restaurantId)}/orders${queryString}`,
  );
  return body.data;
}

export async function getOrderDetail(
  restaurantId: string,
  orderId: string,
): Promise<OrderDetail> {
  const body = await apiFetch<{ data: OrderDetail }>(
    `${restaurantPath(restaurantId)}/orders/${orderId}`,
  );
  return body.data;
}

export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  input: { expectedStatus: OrderStatus; status: OrderStatus },
): Promise<OrderDetail> {
  const body = await apiFetch<{ data: OrderDetail }>(
    `${restaurantPath(restaurantId)}/orders/${orderId}/status`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}
