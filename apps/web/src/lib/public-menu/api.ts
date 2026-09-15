import { headers } from 'next/headers';
import { API_BASE_URL } from '../api/config';
import type { PublicMenuData } from './types';

export type GetPublicMenuResult =
  | { outcome: 'found'; data: PublicMenuData }
  | { outcome: 'notFound' }
  | { outcome: 'unavailable' };

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

  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/public/qr/${encodeURIComponent(publicCode)}/menu${query}`,
      {
        method: 'GET',
        headers: acceptLanguage ? { 'accept-language': acceptLanguage } : undefined,
        cache: 'no-store',
      },
    );
  } catch {
    return { outcome: 'notFound' };
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    if (errorBody?.error?.code === 'MENU_NOT_AVAILABLE') {
      return { outcome: 'unavailable' };
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
