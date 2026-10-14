import { apiFetch, apiFetchFormData } from '../api/client';
import type { QrStyle } from '../qr/style';
import type {
  DefaultLocaleReadiness,
  RestaurantLocalesResponse,
  RestaurantOrderingOptions,
  RestaurantProfile,
} from './types';

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

/** DEC-037: how many items still lack a name in `locale` (read-only; `409 LOCALE_NOT_ACTIVE` when the language is off). */
export async function getDefaultLocaleReadiness(
  restaurantId: string,
  locale: string,
): Promise<DefaultLocaleReadiness> {
  const body = await apiFetch<{ data: DefaultLocaleReadiness }>(
    `${restaurantPath(restaurantId)}/locales/${locale}/default-readiness`,
  );
  return body.data;
}

/** DEC-037: make an enabled language the default (`409 DEFAULT_LOCALE_INCOMPLETE` while names are missing). */
export async function setDefaultLocale(
  restaurantId: string,
  locale: string,
): Promise<RestaurantLocalesResponse> {
  const body = await apiFetch<{ data: RestaurantLocalesResponse }>(
    `${restaurantPath(restaurantId)}/locales/${locale}/default`,
    { method: 'POST' },
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

/** Save the Restaurant QR appearance; the Backend refuses a style that would not scan. */
export async function updateQrStyle(
  restaurantId: string,
  input: Partial<QrStyle>,
): Promise<QrStyle> {
  const body = await apiFetch<{ data: QrStyle }>(`${restaurantPath(restaurantId)}/qr-style`, {
    method: 'PATCH',
    body: input,
  });
  return body.data;
}

/** Switch Pickup and / or Delivery on or off for the whole Restaurant (omitted fields stay unchanged). */
export async function updateOrderingOptions(
  restaurantId: string,
  input: { pickupEnabled?: boolean; deliveryEnabled?: boolean },
): Promise<RestaurantOrderingOptions> {
  const body = await apiFetch<{ data: RestaurantOrderingOptions }>(
    `${restaurantPath(restaurantId)}/ordering-options`,
    { method: 'PATCH', body: input },
  );
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

/** Guest Menu cover image: same multipart field name (`image`) and contract as the logo. */
export async function uploadRestaurantCover(
  restaurantId: string,
  file: File,
): Promise<RestaurantProfile> {
  const formData = new FormData();
  formData.set('image', file);
  const body = await apiFetchFormData<{ data: RestaurantProfile }>(
    `${restaurantPath(restaurantId)}/cover`,
    formData,
  );
  return body.data;
}

export async function removeRestaurantCover(restaurantId: string): Promise<void> {
  await apiFetch<undefined>(`${restaurantPath(restaurantId)}/cover`, { method: 'DELETE' });
}
