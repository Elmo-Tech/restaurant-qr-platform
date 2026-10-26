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
import {BREW_COPY_KEYS,normalizeBrewTemplateSettings,normalizeBrewTemplateConfigView,type BrewTemplateSettings,type BrewTemplateConfigView} from '../public-menu/brew-settings';
import {normalizeEditorialTemplateSettings,type EditorialTemplateSettings} from '../public-menu/editorial-settings';
import { FOLIO_COPY_KEYS, normalizeFolioTemplateSettings, normalizeFolioTemplateConfigView, type FolioTemplateSettings, type FolioTemplateConfigView } from '../public-menu/folio-settings';
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


/** BREW private appearance draft and publication. */
export async function getBrewTemplateConfig(restaurantId:string):Promise<BrewTemplateConfigView>{
 const x=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/brew-template`);
 return normalizeBrewTemplateConfigView(x.data);
}
export async function saveBrewTemplateDraft(restaurantId:string,settings:BrewTemplateSettings):Promise<BrewTemplateConfigView>{
 const expected=normalizeBrewTemplateSettings(settings);
 const body=Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='promoImageAssetPath'));
 const x=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/brew-template/draft`,{method:'PATCH',body});
 const result=normalizeBrewTemplateConfigView(x.data);
 for(const k of [...BREW_COPY_KEYS,'palette','motion','promoMode','promoEnabled','promoImageMode'] as const)
  if(result.draft[k]!==expected[k])throw new Error('BREW settings were not saved. Restart latest API.');
 if(JSON.stringify(result.draft.categoryPromos)!==JSON.stringify(expected.categoryPromos))
   throw new Error('BREW category promos were not saved. Restart latest API.');
 return result;
}
export async function uploadBrewPromoImage(restaurantId:string,file:File):Promise<BrewTemplateConfigView>{
 const form=new FormData();form.set('image',file);
 const x=await apiFetchFormData<{data:unknown}>(`${restaurantPath(restaurantId)}/brew-template/promo-image`,form);
 return normalizeBrewTemplateConfigView(x.data);
}
export async function resetBrewPromoImage(restaurantId:string):Promise<BrewTemplateConfigView>{
 const x=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/brew-template/promo-image`,{method:'DELETE'});
 return normalizeBrewTemplateConfigView(x.data);
}
export async function publishBrewTemplate(restaurantId:string):Promise<BrewTemplateConfigView>{
 const x=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/brew-template/publish`,{method:'POST'});
 return normalizeBrewTemplateConfigView(x.data);
}

/** FOLIO private draft / published appearance. No cross-tenant direct asset paths. */
export async function getFolioTemplateConfig(restaurantId: string): Promise<FolioTemplateConfigView> {
  const x = await apiFetch<{data: unknown}>(`${restaurantPath(restaurantId)}/folio-template`);
  return normalizeFolioTemplateConfigView(x.data);
}
export async function saveFolioTemplateDraft(restaurantId: string, settings: FolioTemplateSettings): Promise<FolioTemplateConfigView> {
  const expected = normalizeFolioTemplateSettings(settings);
  const body = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'artworkAssetPath' && key !== 'categoryArtwork'));
  const response = await apiFetch<{data: unknown}>(`${restaurantPath(restaurantId)}/folio-template/draft`, {method: 'PATCH', body});
  const result = normalizeFolioTemplateConfigView(response.data);
  const keys = [...FOLIO_COPY_KEYS, 'palette', 'motion', 'artworkMode'] as const;
  if (keys.some(key => result.draft[key] !== expected[key])) {
    throw new Error('FOLIO appearance was not saved. Restart the latest API and try again.');
  }
  return result;
}
export async function uploadFolioArtwork(restaurantId: string, file: File): Promise<FolioTemplateConfigView> {
  const form = new FormData(); form.set('image', file);
  const x = await apiFetchFormData<{data: unknown}>(`${restaurantPath(restaurantId)}/folio-template/artwork`, form);
  return normalizeFolioTemplateConfigView(x.data);
}
/** FOLIO-only category artwork: never modifies the global menu Category image. */
export async function uploadFolioCategoryArtwork(
  restaurantId: string, categoryId: string, file: File,
): Promise<FolioTemplateConfigView> {
  const form = new FormData(); form.set('image', file);
  const x = await apiFetchFormData<{data: unknown}>(
    `${restaurantPath(restaurantId)}/folio-template/categories/${categoryId}/artwork`, form,
  );
  return normalizeFolioTemplateConfigView(x.data);
}
export async function resetFolioCategoryArtwork(
  restaurantId: string, categoryId: string,
): Promise<FolioTemplateConfigView> {
  const x = await apiFetch<{data: unknown}>(
    `${restaurantPath(restaurantId)}/folio-template/categories/${categoryId}/artwork`,
    {method: 'DELETE'},
  );
  return normalizeFolioTemplateConfigView(x.data);
}

export async function resetFolioArtwork(restaurantId: string): Promise<FolioTemplateConfigView> {
  const x = await apiFetch<{data: unknown}>(`${restaurantPath(restaurantId)}/folio-template/artwork`, {method: 'DELETE'});
  return normalizeFolioTemplateConfigView(x.data);
}
export async function publishFolioTemplate(restaurantId: string): Promise<FolioTemplateConfigView> {
  const x = await apiFetch<{data: unknown}>(`${restaurantPath(restaurantId)}/folio-template/publish`, {method: 'POST'});
  return normalizeFolioTemplateConfigView(x.data);
}

/** Editorial-only price rendering; saving applies to the published guest menu immediately. */
export async function getEditorialTemplateSettings(restaurantId:string):Promise<EditorialTemplateSettings> {
  const response=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/editorial-template`);
  return normalizeEditorialTemplateSettings(response.data);
}
export async function saveEditorialTemplateSettings(restaurantId:string,settings:EditorialTemplateSettings):Promise<EditorialTemplateSettings> {
  const input=normalizeEditorialTemplateSettings(settings);
  const response=await apiFetch<{data:unknown}>(`${restaurantPath(restaurantId)}/editorial-template`,{
    method:'PATCH',body:input,
  });
  const saved=normalizeEditorialTemplateSettings(response.data);
  if(saved.priceDisplay!==input.priceDisplay){
    throw new Error('Editorial display option was not saved. Restart Wayta API with the updated branch.');
  }
  return saved;
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
