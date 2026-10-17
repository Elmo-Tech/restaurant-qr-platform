/**
 * Restaurant announcements (DEC-042, slice 4): the pure rules. No I/O.
 * An announcement is a short banner at the top of the Guest Menu. Its dates are
 * inclusive calendar dates read in the menu's own timezone (the same convention as
 * Product discounts), so "today" is a "YYYY-MM-DD" string and plain string comparison
 * is correct.
 */

export const MAX_ACTIVE_ANNOUNCEMENTS = 3;
export const MAX_ANNOUNCEMENT_TEXT = 200;

export type AnnouncementStatus = 'ACTIVE' | 'INACTIVE';
export type AnnouncementStyle = 'INFO' | 'PROMO' | 'WARNING';

export interface LiveCheck {
  status: AnnouncementStatus;
  /** "YYYY-MM-DD" or null. */
  startsOn: string | null;
  endsOn: string | null;
}

/** Is it shown today? ACTIVE, and today is inside the (inclusive) date range. */
export function isLiveOn(announcement: LiveCheck, today: string): boolean {
  if (announcement.status !== 'ACTIVE') return false;
  if (announcement.startsOn !== null && today < announcement.startsOn)
    return false;
  if (announcement.endsOn !== null && today > announcement.endsOn) return false;
  return true;
}

/** Collapses whitespace, drops control characters and caps the length. Emoji are kept. */
export function cleanAnnouncementText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_ANNOUNCEMENT_TEXT)
  );
}

/** The calendar date "YYYY-MM-DD" for a Date column (UTC midnight), or null. */
export function dateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" that is also a real calendar date; null otherwise. */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

/**
 * The text a Guest reads: their language, else the Restaurant default, else whatever
 * exists. Null when there is no text at all (the announcement is then not shown).
 */
export function resolveAnnouncementText(
  translations: { locale: string; text: string }[],
  resolvedLocale: string,
  defaultLocale: string,
): string | null {
  const find = (locale: string): string | undefined =>
    translations.find((row) => row.locale === locale && row.text.trim() !== '')
      ?.text;
  return (
    find(resolvedLocale) ??
    find(defaultLocale) ??
    translations.find((row) => row.text.trim() !== '')?.text ??
    null
  );
}
