/**
 * Menu Import (DEC-040, MENU_IMPORT_SPEC.md #17-18): n8n's answer is UNTRUSTED
 * input, like any model output. This module re-validates and re-cleans it
 * completely -- it does not rely on n8n having done so -- and turns it into the
 * one normalized shape the rest of the import works with. Pure functions only:
 * no I/O, no clock, no database.
 */

export const EXTRACTION_SCHEMA_VERSION = 1;

export const MAX_CATEGORIES = 80;
export const MAX_PRODUCTS = 800;
export const MAX_LANGUAGES = 5;
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_LABEL = 60;

export type ImportConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface NormalizedPriceOption {
  /** locale -> size label */
  labels: Record<string, string>;
  /** Exact decimal string with two fraction digits, e.g. "60.00". */
  price: string;
}

export interface NormalizedProduct {
  /** locale -> name */
  names: Record<string, string>;
  /** locale -> description (only the locales that have one) */
  descriptions: Record<string, string>;
  /** Exact decimal string, or null when the file showed no usable price. */
  price: string | null;
  priceOptions: NormalizedPriceOption[];
  confidence: ImportConfidence;
  /** Extraction-time flags (currently only MISSING_TRANSLATION). */
  flags: string[];
}

export interface NormalizedCategory {
  names: Record<string, string>;
  products: NormalizedProduct[];
}

export interface NormalizedExtraction {
  /** Languages that are really used by the menu, ordered. */
  languages: string[];
  modelName: string | null;
  categories: NormalizedCategory[];
  warnings: string[];
}

/** Stable, guest-safe failure codes. Anything unknown collapses to EXTRACTION_FAILED. */
const KNOWN_FAILURE_CODES = new Set([
  'NO_FILE',
  'UNSUPPORTED_FILE',
  'FILE_TOO_LARGE',
  'EMPTY_SHEET',
  'NOT_CONFIGURED',
  'MODEL_ERROR',
  /** Every model key of the extraction service is at its limit (DEC-057). */
  'MODEL_BUSY',
  'INVALID_MODEL_OUTPUT',
  'TRUNCATED_OUTPUT',
  'EMPTY_RESULT',
]);

export type NormalizeFailureCode =
  | 'INVALID_EXTRACTION_RESULT'
  | 'EXTRACTION_FAILED'
  | 'EMPTY_RESULT'
  | 'NO_FILE'
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_SHEET'
  | 'NOT_CONFIGURED'
  | 'MODEL_ERROR'
  | 'MODEL_BUSY'
  | 'INVALID_MODEL_OUTPUT'
  | 'TRUNCATED_OUTPUT';

export type NormalizeResult =
  | { ok: true; data: NormalizedExtraction }
  | { ok: false; code: NormalizeFailureCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collapses whitespace, strips the kashida decoration and control characters, caps the length. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/ـ/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/** Two-letter lowercase language code, or null. Regional suffixes are dropped ("ar-EG" -> "ar"). */
export function languageCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^([a-z]{2})(?:[-_][a-z0-9]{2,4})?$/.exec(
    value.trim().toLowerCase(),
  );
  return match ? match[1] : null;
}

/** Exact money string with two fractions, or null when it is not a safe non-zero price. Numbers are never accepted. */
export function cleanPrice(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fraction = ((match[2] ?? '') + '00').slice(0, 2);
  const result = `${whole}.${fraction}`;
  return result === '0.00' ? null : result;
}

/** Reads `{ <locale>: { <field>: text } }` into per-field locale maps. */
function readTranslations(
  raw: unknown,
  fields: readonly string[],
  limits: Record<string, number>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const field of fields) result[field] = {};
  if (!isRecord(raw)) return result;
  for (const rawLocale of Object.keys(raw)) {
    const locale = languageCode(rawLocale);
    const entry = raw[rawLocale];
    if (locale === null || !isRecord(entry)) continue;
    for (const field of fields) {
      const text = cleanText(entry[field], limits[field]);
      if (text !== '' && result[field][locale] === undefined)
        result[field][locale] = text;
    }
  }
  return result;
}

function firstText(map: Record<string, string>): string {
  for (const locale of Object.keys(map).sort()) {
    if (map[locale]) return map[locale];
  }
  return '';
}

/**
 * @param raw the JSON body n8n returned
 */
export function normalizeExtraction(raw: unknown): NormalizeResult {
  if (!isRecord(raw)) return { ok: false, code: 'INVALID_EXTRACTION_RESULT' };
  if (raw.schemaVersion !== EXTRACTION_SCHEMA_VERSION) {
    return { ok: false, code: 'INVALID_EXTRACTION_RESULT' };
  }
  if (raw.status === 'FAILED') {
    const code = typeof raw.errorCode === 'string' ? raw.errorCode : '';
    return {
      ok: false,
      code: KNOWN_FAILURE_CODES.has(code)
        ? (code as NormalizeFailureCode)
        : 'EXTRACTION_FAILED',
    };
  }
  if (raw.status !== 'EXTRACTED' || !Array.isArray(raw.categories)) {
    return { ok: false, code: 'INVALID_EXTRACTION_RESULT' };
  }

  const warnings: string[] = [];
  const categories: NormalizedCategory[] = [];
  const categoryByKey = new Map<string, NormalizedCategory>();
  const productKeys = new Map<NormalizedCategory, Set<string>>();
  let productCount = 0;
  let truncated = false;

  for (const rawCategory of raw.categories) {
    if (!isRecord(rawCategory)) continue;
    const categoryNames = readTranslations(rawCategory.translations, ['name'], {
      name: MAX_NAME,
    }).name;
    const categoryKey = firstText(categoryNames).toLowerCase();
    if (categoryKey === '') continue;

    let category = categoryByKey.get(categoryKey);
    if (!category) {
      if (categories.length >= MAX_CATEGORIES) {
        truncated = true;
        continue;
      }
      category = { names: categoryNames, products: [] };
      categories.push(category);
      categoryByKey.set(categoryKey, category);
      productKeys.set(category, new Set());
    } else {
      for (const locale of Object.keys(categoryNames)) {
        if (category.names[locale] === undefined)
          category.names[locale] = categoryNames[locale];
      }
    }
    const keys = productKeys.get(category) as Set<string>;

    const rawProducts = Array.isArray(rawCategory.products)
      ? rawCategory.products
      : [];
    for (const rawProduct of rawProducts) {
      if (!isRecord(rawProduct)) continue;
      const text = readTranslations(
        rawProduct.translations,
        ['name', 'description'],
        {
          name: MAX_NAME,
          description: MAX_DESCRIPTION,
        },
      );
      const productKey = firstText(text.name).toLowerCase();
      if (productKey === '' || keys.has(productKey)) continue;
      if (productCount >= MAX_PRODUCTS) {
        truncated = true;
        break;
      }

      const priceOptions: NormalizedPriceOption[] = [];
      if (Array.isArray(rawProduct.priceOptions)) {
        for (const rawOption of rawProduct.priceOptions) {
          if (!isRecord(rawOption)) continue;
          const price = cleanPrice(rawOption.price);
          const labels = readTranslations(rawOption.translations, ['label'], {
            label: MAX_LABEL,
          }).label;
          if (price !== null && firstText(labels) !== '')
            priceOptions.push({ labels, price });
        }
      }

      const confidence = (
        typeof rawProduct.confidence === 'string'
          ? rawProduct.confidence.toUpperCase()
          : ''
      ) as ImportConfidence;
      keys.add(productKey);
      category.products.push({
        names: text.name,
        descriptions: text.description,
        price: cleanPrice(rawProduct.price),
        priceOptions,
        confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(confidence)
          ? confidence
          : 'MEDIUM',
        flags: [],
      });
      productCount += 1;
    }
  }

  const kept = categories.filter((category) => category.products.length > 0);
  if (kept.length === 0) return { ok: false, code: 'EMPTY_RESULT' };

  // Which languages does the menu really use? The model's own list is only a hint.
  const declared: string[] = [];
  if (Array.isArray(raw.languages)) {
    for (const entry of raw.languages) {
      const code = languageCode(entry);
      if (code !== null && !declared.includes(code)) declared.push(code);
    }
  }
  const usage = new Map<string, number>();
  for (const category of kept) {
    for (const product of category.products) {
      for (const locale of Object.keys(product.names))
        usage.set(locale, (usage.get(locale) ?? 0) + 1);
    }
  }
  // A language that only a category name, a description or a size label uses is still part of the menu: keeping
  // just the product-name languages would erase that text (an Arabic menu whose first category is named in
  // English lost the category's name). Such a language counts zero products, so it never makes a product
  // "missing a translation" and sorts after the product-name languages.
  const addExtra = (map: Record<string, string>) => {
    for (const locale of Object.keys(map))
      if (!usage.has(locale)) usage.set(locale, 0);
  };
  for (const category of kept) {
    addExtra(category.names);
    for (const product of category.products) {
      addExtra(product.descriptions);
      for (const option of product.priceOptions) addExtra(option.labels);
    }
  }
  const languages = Array.from(usage.keys())
    .sort((a, b) => {
      const ia = declared.indexOf(a);
      const ib = declared.indexOf(b);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return (usage.get(b) ?? 0) - (usage.get(a) ?? 0);
    })
    .slice(0, MAX_LANGUAGES);

  // Keep only the kept languages everywhere.
  const keepLanguages = new Set(languages);
  const restrict = (map: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const locale of Object.keys(map))
      if (keepLanguages.has(locale)) out[locale] = map[locale];
    return out;
  };
  const total = kept.reduce(
    (sum, category) => sum + category.products.length,
    0,
  );
  // "A language of this menu" = at least half of the products have a name in it.
  const menuLanguages = languages.filter(
    (code) => (usage.get(code) ?? 0) * 2 >= total,
  );

  for (const category of kept) {
    category.names = restrict(category.names);
    for (const product of category.products) {
      product.names = restrict(product.names);
      product.descriptions = restrict(product.descriptions);
      product.priceOptions = product.priceOptions
        .map((option) => ({ ...option, labels: restrict(option.labels) }))
        .filter((option) => Object.keys(option.labels).length > 0);
      if (
        menuLanguages.length > 1 &&
        menuLanguages.some((code) => product.names[code] === undefined)
      ) {
        product.flags.push('MISSING_TRANSLATION');
      }
    }
  }

  if (truncated) warnings.push('RESULT_TRUNCATED');
  if (Array.isArray(raw.warnings)) {
    for (const warning of raw.warnings) {
      const code = cleanText(warning, 60);
      if (/^[A-Z_]+$/.test(code) && !warnings.includes(code))
        warnings.push(code);
    }
  }

  return {
    ok: true,
    data: {
      languages,
      modelName: cleanText(raw.model, 80) || null,
      categories: kept,
      warnings: warnings.slice(0, 10),
    },
  };
}

/**
 * Comparison key for "is this the same name?" (existing-content matching, #16):
 * case, diacritics, kashida, alef / yeh variants and punctuation never matter.
 */
export function matchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
