import { headers } from 'next/headers';
import { SERVER_API_BASE_URL } from '../api/config';
import { forwardedForHeader } from '../api/server-fetch';
import type { PublicMenuData } from './types';
import { restaurantSlugFromHost } from './restaurant-subdomains';

/** What the "no menu yet" outcome carries for a Restaurant with an exclusive design (a branded page instead of an error). */
export interface PublicMenuBranding {
  restaurantName: string;
  logoAssetPath: string | null;
  exclusiveRendererKey: 'VERDE_NAPOLI_V1' | 'SHERBINY_FIRE_DOUGH_V1' | 'MAKKBOZ_HERITAGE_V1' | 'MEAT_LOVERS_BUTCHER_V1';
  locale: 'ar' | 'en';
}

export type GetPublicMenuResult =
  | { outcome: 'found'; data: PublicMenuData }
  | { outcome: 'notFound' }
  | { outcome: 'unavailable'; branding?: PublicMenuBranding };

const RENDERER_KEYS = ['VERDE_NAPOLI_V1', 'SHERBINY_FIRE_DOUGH_V1', 'MAKKBOZ_HERITAGE_V1', 'MEAT_LOVERS_BUTCHER_V1'] as const;

/** The branding block of a MENU_NOT_AVAILABLE answer, or undefined when it is missing or not exactly what is expected. */
function parseBranding(value: unknown): PublicMenuBranding | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const key = RENDERER_KEYS.find((candidate) => candidate === raw.exclusiveRendererKey);
  if (!key || typeof raw.restaurantName !== 'string' || !raw.restaurantName.trim()) return undefined;
  if (raw.logoAssetPath !== null && typeof raw.logoAssetPath !== 'string') return undefined;
  return {
    restaurantName: raw.restaurantName.slice(0, 120),
    logoAssetPath: raw.logoAssetPath as string | null,
    exclusiveRendererKey: key,
    locale: raw.locale === 'ar' ? 'ar' : 'en',
  };
}

/**
 * FT-3: the one public Guest QR Menu request, deliberately separate from
 * `lib/menu/api.ts` (Staff editing) and from `lib/api/server-fetch.ts`
 * (Staff's session-checking Server Component transport). Unlike either of
 * those, this never forwards the `Cookie` header -- there is no Guest
 * session, and this must work identically in an incognito/no-cookie
 * browser -- but it does forward the visiting browser's own
 * `Accept-Language` header so the Backend can apply its locale fallback
 * chain (Section 8). `cache: 'no-store'`: a Guest must always see the
 * Restaurant's current Menu, never a stale cached snapshot.
 *
 * `QR_NOT_FOUND` and any other non-2xx failure (network error, malformed
 * `publicCode`, unexpected 5xx) all converge on the same guest-safe
 * `'notFound'` outcome -- only the one distinguishable `MENU_NOT_AVAILABLE`
 * code gets its own outcome, since that alone means the QR resolved but the
 * Restaurant has no ACTIVE primary Menu right now (QR_SPEC.md #47/#48: the
 * Guest never sees a raw error code either way).
 */
export async function getPublicMenu(
  publicCode: string,
  lang: string | undefined,
): Promise<GetPublicMenuResult> {
  const incomingHeaders = await headers();
  const acceptLanguage = incomingHeaders.get('accept-language');
  // The internal API normally sees Host: api:4000. For an actual restaurant
  // hostname that would bypass PublicRestaurantHostGuard; forward only the
  // validated single-label tenant host, not a raw caller-supplied value.
  const baseDomain = process.env.RESTAURANT_BASE_DOMAIN;
  const tenantSlug = restaurantSlugFromHost(incomingHeaders.get('host'), baseDomain);
  const tenantHost = tenantSlug && baseDomain
    ? `${tenantSlug}.${baseDomain.toLowerCase()}`
    : null;

  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  let response: Response;
  try {
    response = await fetch(
      `${SERVER_API_BASE_URL}/public/qr/${encodeURIComponent(publicCode)}/menu${query}`,
      {
        method: 'GET',
        headers: {
          ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
          ...(tenantHost ? { host: tenantHost } : {}),
          ...forwardedForHeader(incomingHeaders),
        },
        cache: 'no-store',
      },
    );
  } catch {
    return { outcome: 'notFound' };
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: { code?: string; branding?: unknown };
    } | null;
    if (errorBody?.error?.code === 'MENU_NOT_AVAILABLE') {
      const branding = parseBranding(errorBody.error.branding);
      return branding ? { outcome: 'unavailable', branding } : { outcome: 'unavailable' };
    }
    return { outcome: 'notFound' };
  }

  const body = (await response.json().catch(() => null)) as {
    data: PublicMenuData;
  } | null;
  if (!body) {
    return { outcome: 'notFound' };
  }

  return { outcome: 'found', data: body.data };
}
