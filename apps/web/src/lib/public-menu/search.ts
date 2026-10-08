/**
 * FT-13A: client-side product search over the already-loaded Guest Menu --
 * no endpoint, nothing leaves the page. Text is folded so that "cafe" finds
 * "Café" and, for Arabic, the usual spelling variants match: diacritics and
 * tatweel are dropped, hamza-alef forms fold to a bare alef, alef-maksura to
 * ya and ta-marbuta to ha.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every whitespace-separated term of the query must appear in the product's folded name/description. */
export function matchesSearch(haystack: string, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  return normalizedQuery.split(' ').every((term) => haystack.includes(term));
}
