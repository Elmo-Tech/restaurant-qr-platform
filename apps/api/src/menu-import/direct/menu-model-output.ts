import { parseSheetPrice } from '../menu-import-sheet';

/**
 * Turns the model's answers into the one extraction shape the Backend validates (Menu Import, DIRECT engine,
 * DEC-059). One answer per image; they are put together in upload order. The result is UNTRUSTED like any other
 * extraction and still goes through `normalizeExtraction`: this step only reads the model's text and fixes what a
 * model gets wrong (Arabic digits in prices, language names instead of codes, a reversed Arabic ligature).
 */

export type FailureCode =
  | 'MODEL_BUSY'
  | 'MODEL_ERROR'
  | 'INVALID_MODEL_OUTPUT'
  | 'TRUNCATED_OUTPUT'
  | 'UNSUPPORTED_FILE'
  | 'EMPTY_SHEET';

/** What came back for one request: the model's text, or why there is none. */
export type PageResult =
  | { ok: true; text: string; finishReason: string | null }
  | { ok: false; code: FailureCode; message: string };

interface RawProduct {
  translations: Record<string, { name: string; description: string | null }>;
  price: string | null;
  priceOptions: {
    translations: Record<string, { label: string }>;
    price: string;
  }[];
  confidence: string;
}
interface RawCategory {
  translations: Record<string, { name: string }>;
  products: RawProduct[];
}

export interface RawExtraction {
  schemaVersion: 1;
  status: 'EXTRACTED';
  /** Stored as the Job's model name: the usage record of what read the menu. */
  model: string;
  languages: string[];
  warnings: string[];
  categories: RawCategory[];
}

export interface RawFailure {
  schemaVersion: 1;
  status: 'FAILED';
  errorCode: FailureCode;
  model: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  arabic: 'ar',
  english: 'en',
  french: 'fr',
  turkish: 'tr',
  german: 'de',
  italian: 'it',
  spanish: 'es',
  russian: 'ru',
  persian: 'fa',
  farsi: 'fa',
  kurdish: 'ku',
};

/** "ar", "ar-EG" and "Arabic" are all `ar`; anything else is not a language the import knows. */
export function canonicalLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (LANGUAGE_NAMES[text]) return LANGUAGE_NAMES[text];
  const match = /^([a-z]{2})(?:[-_][a-z0-9]{2,4})?$/.exec(text);
  return match ? match[1] : null;
}

/** Some PDFs store the lam + hamza-alef ligature reversed ("الأرز" arrives as "األرز"): put the letters back. */
export function fixArabic(text: string): string {
  return text.replace(/(^|[\s([/،-])([وبكفل]?)األ/g, '$1$2الأ');
}

function cleanText(value: unknown): string {
  return typeof value === 'string'
    ? fixArabic(value.replace(/\s+/g, ' ').trim())
    : '';
}

/** The model may wrap its JSON in a markdown fence or add a sentence: take the outermost { ... }. */
export function readModelJson(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const parsed: unknown = JSON.parse(unfenced.slice(first, last + 1));
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ "<lang>": { field: text } }` -> `{ lang: { field: text } }`, keeping only languages with the first field. */
function readTranslations(
  raw: unknown,
  fields: readonly string[],
): Record<string, Record<string, string | null>> {
  const result: Record<string, Record<string, string | null>> = {};
  if (!isRecord(raw)) return result;
  for (const key of Object.keys(raw)) {
    const language = canonicalLanguage(key);
    const entry = raw[key];
    if (language === null || !isRecord(entry) || result[language]) continue;
    const text = cleanText(entry[fields[0]]);
    if (text === '') continue;
    const read: Record<string, string | null> = { [fields[0]]: text };
    for (const field of fields.slice(1))
      read[field] = cleanText(entry[field]) || null;
    result[language] = read;
  }
  return result;
}

function sanitizeCategories(list: unknown[]): RawCategory[] {
  const categories: RawCategory[] = [];
  for (const rawCategory of list) {
    if (!isRecord(rawCategory)) continue;
    const names = readTranslations(rawCategory.translations, ['name']);
    const translations: RawCategory['translations'] = {};
    for (const language of Object.keys(names)) {
      translations[language] = { name: names[language].name as string };
    }
    const products: RawProduct[] = [];
    for (const rawProduct of Array.isArray(rawCategory.products)
      ? rawCategory.products
      : []) {
      if (!isRecord(rawProduct)) continue;
      const read = readTranslations(rawProduct.translations, [
        'name',
        'description',
      ]);
      if (Object.keys(read).length === 0) continue;
      const productTranslations: RawProduct['translations'] = {};
      for (const language of Object.keys(read)) {
        productTranslations[language] = {
          name: read[language].name as string,
          description: read[language].description,
        };
      }
      const priceOptions: RawProduct['priceOptions'] = [];
      for (const rawOption of Array.isArray(rawProduct.priceOptions)
        ? rawProduct.priceOptions
        : []) {
        if (!isRecord(rawOption)) continue;
        const price = parseSheetPrice(rawOption.price);
        const labels = readTranslations(rawOption.translations, ['label']);
        const labelTranslations: Record<string, { label: string }> = {};
        for (const language of Object.keys(labels)) {
          labelTranslations[language] = {
            label: labels[language].label as string,
          };
        }
        if (price !== null && Object.keys(labelTranslations).length > 0) {
          priceOptions.push({ translations: labelTranslations, price });
        }
      }
      const confidence =
        typeof rawProduct.confidence === 'string'
          ? rawProduct.confidence.trim().toLowerCase()
          : 'medium';
      products.push({
        translations: productTranslations,
        price: parseSheetPrice(rawProduct.price),
        priceOptions,
        confidence: ['high', 'medium', 'low'].includes(confidence)
          ? confidence
          : 'medium',
      });
    }
    categories.push({
      // A category the model left unnamed would lose its products: give it the default name.
      translations:
        Object.keys(translations).length > 0
          ? translations
          : { ar: { name: 'المنيو' }, en: { name: 'Menu' } },
      products,
    });
  }
  return categories;
}

/**
 * Puts the answers for all files together. Categories keep upload order; the same category on two images and a
 * repeated product are merged by `normalizeExtraction` afterwards. If some files fail and others succeed the
 * result carries `SOME_FILES_FAILED`; if all fail it is a failure with the first file's code.
 */
export function mergePages(
  pages: readonly PageResult[],
  modelName: string,
): RawExtraction | RawFailure {
  const categories: RawCategory[] = [];
  const declared: string[] = [];
  let succeeded = 0;
  let failedFiles = 0;
  let truncated = false;
  let firstFailure: FailureCode | null = null;

  const fail = (code: FailureCode): void => {
    failedFiles += 1;
    firstFailure ??= code;
  };

  for (const page of pages) {
    if (!page.ok) {
      fail(page.code);
      continue;
    }
    if (page.text === '') {
      fail('MODEL_ERROR');
      continue;
    }
    const data = readModelJson(page.text);
    if (data === null) {
      fail(
        page.finishReason === 'length'
          ? 'TRUNCATED_OUTPUT'
          : 'INVALID_MODEL_OUTPUT',
      );
      continue;
    }
    if (!Array.isArray(data.categories)) {
      fail('INVALID_MODEL_OUTPUT');
      continue;
    }
    if (page.finishReason === 'length') truncated = true;
    succeeded += 1;
    if (Array.isArray(data.languages)) {
      for (const entry of data.languages) {
        const code = canonicalLanguage(entry);
        if (code !== null && !declared.includes(code)) declared.push(code);
      }
    }
    categories.push(...sanitizeCategories(data.categories));
  }

  if (succeeded === 0) {
    return {
      schemaVersion: 1,
      status: 'FAILED',
      errorCode: firstFailure ?? 'MODEL_ERROR',
      model: modelName,
    };
  }
  const warnings: string[] = [];
  if (failedFiles > 0) warnings.push('SOME_FILES_FAILED');
  if (truncated) warnings.push('MODEL_OUTPUT_MAY_BE_INCOMPLETE');
  return {
    schemaVersion: 1,
    status: 'EXTRACTED',
    model: modelName,
    languages: declared,
    warnings,
    categories,
  };
}
