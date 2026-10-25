import {
  normalizeEmberTemplateConfigView,
  normalizeEmberTemplateSettings,
  EMBER_COPY_KEYS,
  type EmberTemplateSettings,
  type EmberTemplateConfigView,
} from '../public-menu/ember-settings';
import {
  BLOOM_COPY_KEYS,
  normalizeBloomTemplateConfigView,
  normalizeBloomTemplateSettings,
  type BloomTemplateConfigView,
  type BloomTemplateSettings,
} from '../public-menu/bloom-settings';
import type { MenuTemplateApi } from '../public-menu/templates';
import type { ContactField, RestaurantContact } from '../contact/types';
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

/** The Guest menu template (DEC-044): presentation only. */
export async function updateMenuTemplate(
  restaurantId: string,
  menuTemplate: MenuTemplateApi,
): Promise<{ menuTemplate: MenuTemplateApi }> {
  const body = await apiFetch<{ data: { menuTemplate: MenuTemplateApi } }>(
    `/restaurants/${restaurantId}/menu-template`,
    { method: 'PATCH', body: { menuTemplate } },
  );
  return body.data;
}

/** Presentation-only EMBER drafts and publication are separate from template selection. */
/** Keep draft and published content readable across API upgrades. */
export async function getEmberTemplateConfig(restaurantId: string): Promise<EmberTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/ember-template`,
  );
  return normalizeEmberTemplateConfigView(body.data);
}

export async function saveEmberTemplateDraft(
  restaurantId: string,
  settings: EmberTemplateSettings,
): Promise<EmberTemplateConfigView> {
  const expected = normalizeEmberTemplateSettings(settings);
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/ember-template/draft`,
    {
      method: 'PATCH',
      // Asset paths are generated and managed exclusively by the upload route.
      body: Object.fromEntries(
        Object.entries(expected).filter(([key]) => key !== 'heroImageAssetPath'),
      ),
    },
  );
  const result = normalizeEmberTemplateConfigView(body.data);
  // Old API builds may silently discard newly introduced fields. Don't tell
  // restaurant owners that their draft was saved if it wasn't persisted.
  const required = ['palette', 'motion', 'heroImageMode', ...EMBER_COPY_KEYS] as const;
  if (required.some((key) => result.draft[key] !== expected[key])) {
    throw new Error('EMBER settings were not saved. Restart the API with the latest branch updates and try again.');
  }
  return result;
}

/** Store a separate EMBER-only hero picture in the private draft. */
export async function uploadEmberTemplateHeroImage(
  restaurantId: string,
  file: File,
): Promise<EmberTemplateConfigView> {
  const formData = new FormData();
  formData.set('image', file);
  const body = await apiFetchFormData<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/ember-template/hero-image`,
    formData,
  );
  return normalizeEmberTemplateConfigView(body.data);
}

/** Discard the template-specific draft image; the published image is unchanged until Publish. */
export async function resetEmberTemplateHeroImage(
  restaurantId: string,
): Promise<EmberTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/ember-template/hero-image`,
    { method: 'DELETE' },
  );
  return normalizeEmberTemplateConfigView(body.data);
}

export async function publishEmberTemplateConfig(
  restaurantId: string,
): Promise<EmberTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/ember-template/publish`,
    { method: 'POST' },
  );
  return normalizeEmberTemplateConfigView(body.data);
}

/** BLOOM appearance stays private until published. */
export async function getBloomTemplateConfig(restaurantId: string): Promise<BloomTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(`${restaurantPath(restaurantId)}/bloom-template`);
  return normalizeBloomTemplateConfigView(body.data);
}
export async function saveBloomTemplateDraft(
  restaurantId: string, settings: BloomTemplateSettings,
): Promise<BloomTemplateConfigView> {
  const expected = normalizeBloomTemplateSettings(settings);
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/bloom-template/draft`,
    { method: 'PATCH', body: Object.fromEntries(
      Object.entries(expected).filter(([key]) => key !== 'heroImageAssetPath'),
    ) },
  );
  const saved = normalizeBloomTemplateConfigView(body.data);
  const fields = ['palette', 'motion', 'heroImageMode', ...BLOOM_COPY_KEYS] as const;
  if (fields.some((key) => saved.draft[key] !== expected[key])) {
    throw new Error('BLOOM settings were not saved. Restart the API with the latest BLOOM branch and try again.');
  }
  return saved;
}
export async function uploadBloomTemplateHeroImage(
  restaurantId: string, file: File,
): Promise<BloomTemplateConfigView> {
  const data = new FormData();
  data.set('image', file);
  const body = await apiFetchFormData<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/bloom-template/hero-image`, data,
  );
  return normalizeBloomTemplateConfigView(body.data);
}
export async function resetBloomTemplateHeroImage(restaurantId: string): Promise<BloomTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/bloom-template/hero-image`, { method: 'DELETE' },
  );
  return normalizeBloomTemplateConfigView(body.data);
}
export async function publishBloomTemplateConfig(restaurantId: string): Promise<BloomTemplateConfigView> {
  const body = await apiFetch<{ data: unknown }>(
    `${restaurantPath(restaurantId)}/bloom-template/publish`, { method: 'POST' },
  );
  return normalizeBloomTemplateConfigView(body.data);
}

/** Switch Pickup and / or Delivery on or off for the whole Restaurant (omitted fields stay unchanged). */
export async function updateOrderingOptions(
  restaurantId: string,
  input: {
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    tableOrderingEnabled?: boolean;
    whatsappOrderingEnabled?: boolean;
  },
): Promise<RestaurantOrderingOptions> {
  const body = await apiFetch<{ data: RestaurantOrderingOptions }>(
    `${restaurantPath(restaurantId)}/ordering-options`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

/** Save the Guest Menu contact details (omitted fields stay unchanged; null or blank clears one). */
export async function updateContact(
  restaurantId: string,
  input: Partial<Record<ContactField, string | null>>,
): Promise<RestaurantContact> {
  const body = await apiFetch<{ data: RestaurantContact }>(
    `${restaurantPath(restaurantId)}/contact`,
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
