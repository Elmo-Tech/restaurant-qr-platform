import { apiFetch } from '../api/client';

/** FT-7: the Restaurant's existing public Guest Menu code, or `null` when it has no ACTIVE GENERIC QR. Read-only -- never creates a QR. */
export async function getGuestMenuPublicCode(restaurantId: string): Promise<string | null> {
  const body = await apiFetch<{ data: { publicCode: string | null } }>(
    `/restaurants/${restaurantId}/guest-menu-link`,
  );
  return body.data.publicCode;
}
