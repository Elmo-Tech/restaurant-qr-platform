import { apiFetch } from '../api/client';

/** Restaurant announcements (DEC-042): Staff request layer for `/restaurants/{id}/announcements`. */

export type AnnouncementStatus = 'ACTIVE' | 'INACTIVE';
export type AnnouncementStyle = 'INFO' | 'PROMO' | 'WARNING';

export interface Announcement {
  id: string;
  status: AnnouncementStatus;
  style: AnnouncementStyle;
  /** Inclusive "YYYY-MM-DD", or null. */
  startsOn: string | null;
  endsOn: string | null;
  /** `{ <locale>: text }` for the languages that have one. */
  texts: Record<string, string>;
  /** Where it stands today: shown now, not started yet, ended, or switched off. */
  state: 'LIVE' | 'SCHEDULED' | 'EXPIRED' | 'OFF';
}

export interface AnnouncementInput {
  status?: AnnouncementStatus;
  style?: AnnouncementStyle;
  startsOn?: string | null;
  endsOn?: string | null;
  texts?: Record<string, string | null>;
}

const base = (restaurantId: string): string => `/restaurants/${restaurantId}/announcements`;

export async function listAnnouncements(restaurantId: string): Promise<Announcement[]> {
  const body = await apiFetch<{ data: Announcement[] }>(base(restaurantId));
  return body.data;
}

export async function createAnnouncement(restaurantId: string, input: AnnouncementInput): Promise<Announcement> {
  const body = await apiFetch<{ data: Announcement }>(base(restaurantId), { method: 'POST', body: input });
  return body.data;
}

export async function updateAnnouncement(
  restaurantId: string,
  id: string,
  input: AnnouncementInput,
): Promise<Announcement> {
  const body = await apiFetch<{ data: Announcement }>(`${base(restaurantId)}/${id}`, { method: 'PATCH', body: input });
  return body.data;
}

export async function deleteAnnouncement(restaurantId: string, id: string): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${id}`, { method: 'DELETE' });
}
