/**
 * PRESENTATION-ONLY display labels for currently supported locale codes
 * (LOC-3, Section 14). The authoritative supported-locale registry remains
 * the Backend's `GET .../locales` response -- this map is never iterated on
 * its own and never used to decide which locales exist; it only supplies a
 * friendly label for a locale the Backend already returned. An unknown
 * future locale still renders safely using its own code rather than
 * disappearing.
 */
const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
};

export function localeLabel(locale: string): string {
  return LOCALE_LABELS[locale] ?? locale.toUpperCase();
}
