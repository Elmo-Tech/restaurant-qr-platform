/**
 * Display-name resolution for Branches and Delivery zones in the Staff UI.
 *
 * The Backend keeps `name` as the Restaurant default-locale name (and the
 * legacy single-language value) and sends the per-locale `translations`
 * alongside it. The Staff language's own translation wins; anything missing
 * falls back to `name`, so existing single-language data never shows an empty
 * label.
 */
export interface LocalizedNameSource {
  name: string;
  translations?: readonly { locale: string; name: string }[];
}

export function localizedName(item: LocalizedNameSource, locale: string): string {
  const match = item.translations?.find(
    (row) => row.locale === locale && row.name.trim() !== '',
  );
  return match?.name ?? item.name;
}

/** Initial form values: one entry per translation, with the default locale always present (falling back to the legacy name). */
export function initialNameValues(
  item: LocalizedNameSource | null,
  defaultLocale: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of item?.translations ?? []) {
    values[row.locale] = row.name;
  }
  if (!values[defaultLocale]) {
    values[defaultLocale] = item?.name ?? '';
  }
  return values;
}

/**
 * Splits form values into the API contract: `name` is the default-locale name
 * and `translations` carries every other ACTIVE locale (an empty value removes
 * that locale's translation). Locales that are not active are never sent, so
 * their existing translations are left untouched.
 */
export function toNamePayload(
  values: Record<string, string>,
  defaultLocale: string,
  activeLocales: readonly string[] | null,
): { name: string; translations?: { locale: string; name: string }[] } {
  const name = (values[defaultLocale] ?? '').trim();
  if (!activeLocales) {
    return { name };
  }
  const translations = activeLocales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => ({ locale, name: (values[locale] ?? '').trim() }));
  return translations.length > 0 ? { name, translations } : { name };
}
