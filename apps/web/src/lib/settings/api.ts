import { apiFetch } from '../api/client';
import type { RestaurantLocalesResponse } from './types';

/**
 * Thin Restaurant Settings request layer (LOC-3, Section 12), mirroring
 * `lib/menu/api.ts`'s exact conventions -- one function per documented
 * Backend route, using the existing `apiFetch` transport. No second fetch
 * wrapper, no generic client.
 */

function restaurantPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}`;
}

export async function getRestaurantLocales(
  restaurantId: string,
): Promise<RestaurantLocalesResponse> {
  const body = await apiFetch<{ data: RestaurantLocalesResponse }>(
    `${restaurantPath(restaurantId)}/locales`,
  );
  return body.data;
}

export async function setRestaurantLocaleState(
  restaurantId: string,
  locale: string,
  isActive: boolean,
): Promise<{ locale: string; isActive: boolean }> {
  const body = await apiFetch<{ data: { locale: string; isActive: boolean } }>(
    `${restaurantPath(restaurantId)}/locales/${locale}`,
    { method: 'PUT', body: { isActive } },
  );
  return body.data;
}
