import { readSheet } from 'read-excel-file/node';
import { cleanPrice } from './menu-import-extraction';
import { invalid } from './menu-import-file';

/**
 * Menu Import, Excel template (DEC-058, MENU_IMPORT_SPEC.md #3A): an `.xlsx` whose header row follows the
 * Platform's template is read HERE, without n8n and without a model. The sheet is mapped to the same shape n8n
 * returns, and the caller runs it through `normalizeExtraction` like any other answer, so validation, Draft and
 * review are identical. Only stored cell values are read (formulas are never evaluated).
 */

/** Safety limits for the archive and the sheet (MENU_IMPORT_SPEC.md #21). */
export const SHEET_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const SHEET_MAX_ENTRIES = 200;
export const SHEET_MAX_ROWS = 2000;
const HEADER_SEARCH_ROWS = 10;
const MAX_SIZES = 3;
const LANGUAGES = ['ar', 'en'] as const;
type Language = (typeof LANGUAGES)[number];

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const ZIP_MAX_COMMENT = 65535;
const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;

/**
 * Reads only the ZIP central directory, before anything is decompressed: refuses an archive with too many entries
 * or too much declared data after decompression (a "zip bomb"), a ZIP64 archive, or a broken directory.
 */
export function zipIsSafe(buffer: Buffer): boolean {
  if (buffer.length < 22) return false;
  const lowest = Math.max(0, buffer.length - 22 - ZIP_MAX_COMMENT);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= lowest; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return false;
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (
    entries === UINT16_MAX ||
    directorySize === UINT32_MAX ||
    directoryOffset === UINT32_MAX
  ) {
    return false; // ZIP64: not used by an ordinary menu sheet
  }
  if (entries === 0 || entries > SHEET_MAX_ENTRIES) return false;
  if (directoryOffset + directorySize > eocd) return false;

  let offset = directoryOffset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_ENTRY_SIGNATURE
    ) {
      return false;
    }
    const size = buffer.readUInt32LE(offset + 24);
    if (size === UINT32_MAX) return false;
    total += size;
    if (total > SHEET_MAX_UNCOMPRESSED_BYTES) return false;
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return true;
}

/** "Name AR", "name-ar" and "NAME_AR" are the same header. */
function headerKey(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s\-_]+/g, '')
    : '';
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';
function asciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_INDIC.indexOf(digit)));
}

/**
 * A price cell -> an exact two-decimal string, or null when it is not a safe non-zero price (never guessed).
 * Arabic digits, decimal commas, thousands separators and currency words are accepted.
 */
export function parseSheetPrice(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > 999999999.99)
      return null;
    const cents = Math.round(value * 100);
    if (Math.abs(value * 100 - cents) > 1e-6) return null; // more than two decimals: not a price
    return cleanPrice((cents / 100).toFixed(2));
  }
  if (typeof value !== 'string') return null;
  const cleaned = asciiDigits(value).replace(/٫/g, '.').replace(/[٬،]/g, ',');
  // Exactly one number may be written (currency words around it are fine): "1e5" or "10 - 12" are not a price.
  const numbers = cleaned.match(/\d[\d.,]*/g);
  if (numbers === null || numbers.length !== 1) return null;
  // ".75" would silently become 75: a number needs its leading digit.
  const start = cleaned.indexOf(numbers[0]);
  if (start > 0 && /[.,]/.test(cleaned[start - 1])) return null;
  let text = numbers[0].replace(/[.,]+$/, '');
  if (text === '') return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, '');
  } else if (text.includes(',')) {
    const pieces = text.split(',');
    text =
      pieces.length === 2 && pieces[1].length <= 2
        ? `${pieces[0]}.${pieces[1]}`
        : pieces.join('');
  }
  return cleanPrice(text);
}

function cellText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export interface SheetExtractionProduct {
  translations: Record<string, { name: string; description: string | null }>;
  price: string | null;
  priceOptions: {
    translations: Record<string, { label: string }>;
    price: string;
  }[];
  confidence: 'high';
}
export interface SheetExtraction {
  schemaVersion: 1;
  status: 'EXTRACTED';
  /** Recorded as the Job's model name, so imports read without a model are visible in the usage record. */
  model: 'excel-template';
  languages: string[];
  categories: {
    translations: Record<string, { name: string }>;
    products: SheetExtractionProduct[];
  }[];
}

/**
 * Maps sheet rows to the extraction shape, or null when the first rows are not the template (no header row with a
 * name column AND a price column). Pure: no I/O.
 */
export function rowsToExtraction(
  rows: readonly unknown[][],
): SheetExtraction | null {
  const headerIndex = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some((cell) => headerKey(cell) !== ''));
  if (headerIndex < 0) return null;

  const column = new Map<string, number>();
  rows[headerIndex].forEach((cell, index) => {
    const key = headerKey(cell);
    if (key !== '' && !column.has(key)) column.set(key, index);
  });
  const hasName = column.has('namear') || column.has('nameen');
  const hasPrice = column.has('price') || column.has('size1price');
  if (!hasName || !hasPrice) return null;

  const at = (row: readonly unknown[], key: string): unknown => {
    const index = column.get(key);
    return index === undefined ? undefined : row[index];
  };

  const categories: SheetExtraction['categories'] = [];
  const categoryByKey = new Map<
    string,
    SheetExtraction['categories'][number]
  >();
  let currentNames: Record<string, { name: string }> | null = null;
  const used = new Set<Language>();

  for (const row of rows.slice(
    headerIndex + 1,
    headerIndex + 1 + SHEET_MAX_ROWS,
  )) {
    // A blank category cell means "the same category as the row above".
    const categoryNames: Record<string, { name: string }> = {};
    for (const language of LANGUAGES) {
      const name = cellText(at(row, `category${language}`));
      if (name !== '') categoryNames[language] = { name };
    }
    if (Object.keys(categoryNames).length > 0) currentNames = categoryNames;

    const translations: SheetExtractionProduct['translations'] = {};
    for (const language of LANGUAGES) {
      const name = cellText(at(row, `name${language}`));
      if (name === '') continue;
      translations[language] = {
        name,
        description: cellText(at(row, `description${language}`)) || null,
      };
    }
    if (Object.keys(translations).length === 0) continue; // no name: not a product row

    const priceOptions: SheetExtractionProduct['priceOptions'] = [];
    for (let size = 1; size <= MAX_SIZES; size += 1) {
      const price = parseSheetPrice(at(row, `size${size}price`));
      const labels: Record<string, { label: string }> = {};
      for (const language of LANGUAGES) {
        const label = cellText(at(row, `size${size}${language}`));
        if (label !== '') labels[language] = { label };
      }
      if (price !== null && Object.keys(labels).length > 0) {
        priceOptions.push({ translations: labels, price });
      }
    }
    let price = parseSheetPrice(at(row, 'price'));
    if (price === null && priceOptions.length > 0) {
      // Prices are exact two-decimal strings, so comparing them numerically only picks the smallest one.
      price = priceOptions
        .map((option) => option.price)
        .reduce((smallest, next) =>
          Number(next) < Number(smallest) ? next : smallest,
        );
    }

    const names = currentNames ?? {
      ar: { name: 'المنيو' },
      en: { name: 'Menu' },
    };
    const key = (names.ar?.name ?? names.en?.name ?? '').toLowerCase();
    let category = categoryByKey.get(key);
    if (!category) {
      category = { translations: names, products: [] };
      categories.push(category);
      categoryByKey.set(key, category);
    }
    category.products.push({
      translations,
      price,
      priceOptions,
      confidence: 'high',
    });
    for (const language of LANGUAGES)
      if (translations[language]) used.add(language);
  }

  return {
    schemaVersion: 1,
    status: 'EXTRACTED',
    model: 'excel-template',
    languages: LANGUAGES.filter((language) => used.has(language)),
    categories,
  };
}

export type TemplateReadResult =
  { kind: 'template'; extraction: SheetExtraction } | { kind: 'other' };

const UNREADABLE =
  'This Excel file could not be read. Check that it is a valid .xlsx file.';

/**
 * Tells whether an `.xlsx` follows the template and, if it does, reads it. A corrupt or oversized archive is refused
 * with the stable `IMPORT_FILE_INVALID` before anything is decompressed.
 */
export async function readMenuTemplate(
  buffer: Buffer,
): Promise<TemplateReadResult> {
  if (!zipIsSafe(buffer)) throw invalid(UNREADABLE);
  let rows: unknown[][];
  try {
    rows = await readSheet(buffer);
  } catch {
    throw invalid(UNREADABLE);
  }
  const extraction = rowsToExtraction(rows);
  return extraction ? { kind: 'template', extraction } : { kind: 'other' };
}
