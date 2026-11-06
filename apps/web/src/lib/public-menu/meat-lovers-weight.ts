import type { PublicMenuProduct } from './types';

/**
 * Meat Lovers sells by weight: every size of a cut is a weight (250 g, 500 g, 1 kg ...) whose price is the
 * per-kilo price scaled to that weight (computed once, with exact decimals, in the seed or by the Restaurant).
 * This reads the weight a size NAME states so the menu can show the per-kilo price on the card without any
 * arithmetic on money: it simply finds the 1 kg size and shows ITS price. A product whose sizes are not all
 * weights, or that has no 1 kg size, is shown like any other product.
 */
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const normalize = (name: string): string =>
  name
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/٫/g, '.')
    .replace(/,/g, '.')
    .toLowerCase();

/** The weight in grams a size name states ("1 كجم", "ربع كيلو (250 جم)", "500 g", "2 kg"), or null. */
export function variantGrams(name: string): number | null {
  const text = normalize(name);
  const kilos = /(\d+(?:\.\d+)?)\s*(?:كجم|كيلو|كغم|كغ|كج|kg|kgs|kilo|kilos)(?![\p{L}])/u.exec(text);
  if (kilos) return Math.round(Number(kilos[1]) * 1000);
  const grams = /(\d+(?:\.\d+)?)\s*(?:جرام|غرام|جم|غ|gr|gm|g)(?![\p{L}])/u.exec(text);
  if (grams) return Math.round(Number(grams[1]));
  if (/ربع\s*كيلو|quarter\s*(?:of a\s*)?kilo?/.test(text)) return 250;
  if (/(?:نص|نصف)\s*كيلو|half\s*(?:a\s*)?kilo?/.test(text)) return 500;
  if (/(?:^|\s)كيلو(?:\s|$)|^1\s*kilo$/.test(text)) return 1000;
  return null;
}

export interface PerKiloPrice {
  /** The 1 kg size's price, exactly as the Backend sent it. */
  price: string;
  /** The 1 kg size's price while a discount applies to it, else null. */
  discountedPrice: string | null;
}

/** The per-kilo price of a product sold by weight, or null when it is not one (shown like any other product). */
export function perKiloPrice(product: Pick<PublicMenuProduct, 'variants'>): PerKiloPrice | null {
  const variants = product.variants ?? [];
  if (variants.length === 0) return null;
  let kilo: PerKiloPrice | null = null;
  for (const variant of variants) {
    const grams = variantGrams(variant.name);
    if (grams === null) return null;
    if (grams === 1000 && kilo === null) kilo = { price: variant.price, discountedPrice: variant.discountedPrice };
  }
  return kilo;
}
