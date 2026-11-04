import { apiFetch } from '../api/client';

/**
 * FT-7: the URL segment of the Restaurant's public Guest Menu (`/q/{segment}`): its readable slug (DEC-066),
 * else the opaque public code of its ACTIVE GENERIC QR; `null` when it has no ACTIVE GENERIC QR.
 * Read-only -- never creates a QR.
 */
export async function getGuestMenuSegment(restaurantId: string): Promise<string | null> {
  const body = await apiFetch<{ data: { publicCode: string | null; slug: string | null } }>(
    `/restaurants/${restaurantId}/guest-menu-link`,
  );
  return body.data.publicCode ? (body.data.slug ?? body.data.publicCode) : null;
}
