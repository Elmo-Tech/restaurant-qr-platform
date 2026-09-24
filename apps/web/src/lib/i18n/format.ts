import type { StaffLocale } from './locale';

/**
 * FT-10A: locale-aware DISPLAY of dates and times only. Money and other stored
 * values are never reformatted here -- amounts stay the Backend's exact decimal
 * strings. One place decides the conventions:
 *  - English: day-first, 24-hour (`en-GB`), a clear professional format.
 *  - Arabic: Arabic month/day names (`ar-EG`, Gregorian) with Western digits
 *    (`-u-nu-latn`), so a date reads consistently next to money, phone numbers
 *    and IDs, which stay in Western digits. Changing this is a one-line edit.
 */
const INTL_LOCALE: Record<StaffLocale, string> = {
  en: 'en-GB',
  ar: 'ar-EG-u-nu-latn',
};

export function formatDateTime(isoOrDate: string | Date, locale: StaffLocale): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTime(isoOrDate: string | Date, locale: StaffLocale): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDayMonth(isoOrDate: string | Date, locale: StaffLocale): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short' }).format(date);
}
