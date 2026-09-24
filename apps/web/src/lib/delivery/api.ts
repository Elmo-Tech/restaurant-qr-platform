import { apiFetch } from '../api/client';

/**
 * FT-8: thin Restaurant Settings -> Delivery request layer, mirroring
 * `lib/settings/api.ts`'s conventions -- one function per documented Backend
 * route. Money is always the Backend's exact decimal string, never a Number.
 */
export type DeliveryZoneStatus = 'ACTIVE' | 'INACTIVE';

export interface DeliveryZone {
  id: string;
  name: string;
  deliveryFee: string;
  minimumOrder: string;
  status: DeliveryZoneStatus;
  displayOrder: number;
  /** True only when no Order has ever used this zone; otherwise it can only be deactivated. */
  canDelete: boolean;
}

export interface DeliveryBranch {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  zones: DeliveryZone[];
}

export interface DeliveryZoneInput {
  name: string;
  deliveryFee: string;
  minimumOrder: string;
  status?: DeliveryZoneStatus;
}

function restaurantPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}`;
}

export async function listDeliveryBranches(restaurantId: string): Promise<DeliveryBranch[]> {
  const body = await apiFetch<{ data: DeliveryBranch[] }>(`${restaurantPath(restaurantId)}/delivery`);
  return body.data;
}

export async function createDeliveryZone(
  restaurantId: string,
  branchId: string,
  input: DeliveryZoneInput,
): Promise<DeliveryZone> {
  const body = await apiFetch<{ data: DeliveryZone }>(
    `${restaurantPath(restaurantId)}/branches/${branchId}/delivery-zones`,
    { method: 'POST', body: input },
  );
  return body.data;
}

export async function updateDeliveryZone(
  restaurantId: string,
  zoneId: string,
  input: Partial<DeliveryZoneInput>,
): Promise<DeliveryZone> {
  const body = await apiFetch<{ data: DeliveryZone }>(
    `${restaurantPath(restaurantId)}/delivery-zones/${zoneId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

export async function deleteDeliveryZone(restaurantId: string, zoneId: string): Promise<void> {
  await apiFetch<undefined>(`${restaurantPath(restaurantId)}/delivery-zones/${zoneId}`, {
    method: 'DELETE',
  });
}
