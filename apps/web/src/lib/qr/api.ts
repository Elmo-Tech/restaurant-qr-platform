import { apiFetch } from '../api/client';

/** FT-9: the Restaurant-wide Generic QR (the public Pickup/Delivery entry point). */
export interface GenericQr {
  publicCode: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function path(restaurantId: string): string {
  return `/restaurants/${restaurantId}/generic-qr`;
}

/** `null` when the Restaurant has no Generic QR yet. */
export async function getGenericQr(restaurantId: string): Promise<GenericQr | null> {
  const body = await apiFetch<{ data: GenericQr | null }>(path(restaurantId));
  return body.data;
}

export async function createGenericQr(restaurantId: string): Promise<GenericQr> {
  const body = await apiFetch<{ data: GenericQr }>(path(restaurantId), { method: 'POST' });
  return body.data;
}

export async function setGenericQrStatus(
  restaurantId: string,
  status: GenericQr['status'],
): Promise<GenericQr> {
  const body = await apiFetch<{ data: GenericQr }>(path(restaurantId), {
    method: 'PATCH',
    body: { status },
  });
  return body.data;
}
