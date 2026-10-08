/**
 * FT-13B: Guest-facing price DISPLAY. Pure string handling on the Backend's exact
 * decimal strings -- never `Number`/`parseFloat` (CLAUDE.md #27). Authoritative
 * amounts are untouched; only how they are shown changes.
 *
 * - Whole amounts drop the zero decimals: "145.00" -> "145".
 * - Anything with real cents keeps two decimals: "92.75" -> "92.75", "92.50" -> "92.50".
 * - The currency label is localized for Egyptian pounds in Arabic ("ج.م"); every other
 *   currency, and English, shows the ISO code.
 */
const WHOLE_AMOUNT = /^(-?\d+)\.0+$/;

export function formatAmount(amount: string): string {
  const match = WHOLE_AMOUNT.exec(amount);
  return match ? match[1] : amount;
}

export function currencyLabel(currencyCode: string, locale: string): string {
  if (locale === 'ar' && currencyCode === 'EGP') return 'ج.م';
  return currencyCode;
}

/** A plain-text money string for sentences ("Minimum order 100 EGP"): number, space, label. */
export function formatMoney(amount: string, currencyCode: string, locale: string): string {
  return `${formatAmount(amount)} ${currencyLabel(currencyCode, locale)}`;
}
