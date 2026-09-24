/**
 * FT-10A: the Staff UI language. This is DELIBERATELY independent of the
 * Restaurant's Menu content languages (`restaurant_locales`): a Staff member
 * can use the Arabic interface while editing English menu content, and vice
 * versa. Only two Staff UI locales exist.
 */
export const STAFF_LOCALES = ['en', 'ar'] as const;
export type StaffLocale = (typeof STAFF_LOCALES)[number];

export const DEFAULT_STAFF_LOCALE: StaffLocale = 'en';

/** The persisted Staff UI preference. A cookie (not localStorage) so the SERVER can render the right `lang`/`dir` on the very first paint, with no flash. */
export const STAFF_LOCALE_COOKIE = 'staff_ui_locale';

export function isStaffLocale(value: unknown): value is StaffLocale {
  return value === 'en' || value === 'ar';
}

export function directionOf(locale: StaffLocale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * The highest-priority supported language in an `Accept-Language` header
 * (respecting q-values): "ar-EG,ar;q=0.9,en;q=0.8" -> ar,
 * "en-US,en;q=0.9,ar;q=0.8" -> en. `null` when neither is listed.
 */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): StaffLocale | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split('-')[0], q: Number.isNaN(q) ? 0 : q, index };
    })
    .filter((candidate) => isStaffLocale(candidate.primary) && candidate.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return candidates.length > 0 ? (candidates[0].primary as StaffLocale) : null;
}

/** Saved choice wins; otherwise the browser's preferred Arabic/English; otherwise English. */
export function resolveStaffLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): StaffLocale {
  if (isStaffLocale(cookieValue)) return cookieValue;
  return pickLocaleFromAcceptLanguage(acceptLanguage) ?? DEFAULT_STAFF_LOCALE;
}
