/**
 * One domain's Staff UI messages, English and Arabic side by side. The type
 * parameter is inferred from the English keys, so a key missing from the
 * Arabic block is a compile error -- the two dictionaries can never drift
 * apart. Arabic may ADD extra plural forms (`<base>.zero|two|few|many`) that
 * English does not need; those extras are allowed but never required.
 *
 * Values may contain `{name}` placeholders (see `translate.ts`). A countable
 * phrase is written as a `<base>.one` / `<base>.other` pair and read with `tp()`.
 */
export function defineMessages<const K extends string>(messages: {
  en: Record<K, string>;
  ar: Record<NoInfer<K>, string> & Partial<Record<string, string>>;
}): { en: Record<K, string>; ar: Record<K, string> & Partial<Record<string, string>> } {
  return messages;
}
