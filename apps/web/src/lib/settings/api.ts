import { apiFetch, apiFetchFormData } from '../api/client';
import type { RestaurantLocalesResponse, RestaurantProfile } from './types';

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

export async function updateRestaurantProfile(
  restaurantId: string,
  input: { name: string },
): Promise<RestaurantProfile> {
  const body = await apiFetch<{ data: RestaurantProfile }>(restaurantPath(restaurantId), {
    method: 'PATCH',
    body: input,
  });
  return body.data;
}

/** The multipart field name must be exactly `image`, matching the Backend's `FileInterceptor('image', ...)`. */
export async function uploadRestaurantLogo(
  restaurantId: string,
  file: File,
): Promise<RestaurantProfile> {
  const formData = new FormData();
  formData.set('image', file);
  const body = await apiFetchFormData<{ data: RestaurantProfile }>(
    `${restaurantPath(restaurantId)}/logo`,
    formData,
  );
  return body.data;
}

export async function removeRestaurantLogo(restaurantId: string): Promise<void> {
  await apiFetch<undefined>(`${restaurantPath(restaurantId)}/logo`, { method: 'DELETE' });
}
