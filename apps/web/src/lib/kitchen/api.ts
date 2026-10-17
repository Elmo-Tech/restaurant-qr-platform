import { apiFetch } from '../api/client';
import type { KitchenTicket } from './types';

/**
 * Kitchen View V1: the kitchen's read side. Moving a ticket forward uses the
 * existing `updateOrderStatus` (`lib/orders/api.ts`), whose kitchen steps
 * already require `kitchen.update` on the Backend.
 */
export async function listKitchenTickets(
  restaurantId: string,
  branchId?: string,
): Promise<KitchenTicket[]> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  const body = await apiFetch<{ data: KitchenTicket[] }>(
    `/restaurants/${restaurantId}/kitchen/orders${query}`,
  );
  return body.data;
}
