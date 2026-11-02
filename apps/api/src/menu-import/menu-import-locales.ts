/**
 * Which language a piece of text from an imported file ends up in (Menu Import, DEC-040). Pure: no I/O.
 */

/**
 * A menu written in only one language (say Arabic) still has to give the Restaurant's
 * default language a name. When that language is missing, the name read from the file
 * is used as-is (never translated); the item is flagged so Staff can add a translation.
 */
export function defaultText(
  names: Record<string, string>,
  defaultLocale: string,
): string | undefined {
  if (names[defaultLocale]) return names[defaultLocale];
  const first = Object.keys(names)
    .sort()
    .find((locale) => names[locale]);
  return first === undefined ? undefined : names[first];
}

/**
 * Keeps the text in the Restaurant's active languages. When the file only has text in a language the Restaurant
 * does not use (a size written "S / M / L" in a Restaurant that works in Arabic only, a category named in English),
 * that text is kept as it is under the default language instead of being thrown away: dropping it used to remove
 * the whole size, or leave the category without a name.
 */
export function keepActiveText(
  map: Record<string, string>,
  active: ReadonlySet<string>,
  defaultLocale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(map))
    if (active.has(locale)) out[locale] = text;
  if (Object.keys(out).length > 0) return out;
  const fallback = defaultText(map, defaultLocale);
  return fallback === undefined ? out : { [defaultLocale]: fallback };
}
