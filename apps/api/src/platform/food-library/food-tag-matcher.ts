/** Deterministic multilingual lexicon matching; no AI, no translation or hidden ingredient inference. */
export interface MatchableTag {
  code: string;
  aliases: readonly string[];
}

/** Normalize AR/EN/IT consistently for seed, autocomplete and product-name matching. */
export function normalizeFoodText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A suggestion is a *candidate*, not a visually confirmed image tag.
 * We only match full token/phrase boundaries, and skip terms that mean DIFFERENT
 * canonical tags in different locales (e.g. Italian 'latte'=milk vs English Latte=coffee).
 * Never infer RAW/COOKED or a business sector from a tag or filename.
 */
export function suggestFoodTagCodes(
  originalName: string,
  tags: readonly MatchableTag[],
): string[] {
  const haystack =
    ' ' + normalizeFoodText(originalName.replace(/\.[^.]+$/, '')) + ' ';
  const byTerm = new Map<string, Set<string>>();
  for (const tag of tags) {
    for (const alias of tag.aliases) {
      const normalized = normalizeFoodText(alias);
      if (!normalized || normalized.length < 3) continue;
      if (!byTerm.has(normalized)) byTerm.set(normalized, new Set());
      byTerm.get(normalized)!.add(tag.code);
    }
  }
  const result = new Set<string>();
  for (const [term, codes] of byTerm) {
    if (codes.size !== 1) continue;
    if (haystack.includes(' ' + term + ' ')) result.add([...codes][0]);
  }
  return [...result].sort();
}
