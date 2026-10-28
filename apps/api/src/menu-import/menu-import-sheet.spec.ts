import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeExtraction } from './menu-import-extraction';
import {
  parseSheetPrice,
  readMenuTemplate,
  rowsToExtraction,
  SHEET_MAX_ENTRIES,
  SHEET_MAX_UNCOMPRESSED_BYTES,
  zipIsSafe,
} from './menu-import-sheet';

const fixture = (name: string): Buffer =>
  readFileSync(
    join(__dirname, '..', '..', 'test', 'fixtures', 'menu-import', name),
  );

/** A buffer with only a ZIP central directory: enough for the safety check, which reads nothing else. */
function fakeZip(sizes: number[]): Buffer {
  const entries = sizes.map((size) => {
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt32LE(size, 24);
    return entry;
  });
  const directory = Buffer.concat(entries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sizes.length, 8);
  end.writeUInt16LE(sizes.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([directory, end]);
}

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return (
      error as { getResponse(): { error: { code: string } } }
    ).getResponse().error.code;
  }
  return 'NO_ERROR';
};

describe('menu import Excel template: archive safety', () => {
  it('accepts an ordinary archive and the real fixtures', () => {
    expect(zipIsSafe(fakeZip([100, 2000, 30000]))).toBe(true);
    expect(zipIsSafe(fixture('menu-template-sample.xlsx'))).toBe(true);
    expect(zipIsSafe(fixture('menu-other-layout.xlsx'))).toBe(true);
  });

  it('refuses too many entries, too much data after decompression, ZIP64 markers and broken directories', () => {
    expect(
      zipIsSafe(
        fakeZip(Array.from({ length: SHEET_MAX_ENTRIES + 1 }, () => 10)),
      ),
    ).toBe(false);
    expect(zipIsSafe(fakeZip([SHEET_MAX_UNCOMPRESSED_BYTES + 1]))).toBe(false);
    expect(
      zipIsSafe(
        fakeZip([
          SHEET_MAX_UNCOMPRESSED_BYTES / 2,
          SHEET_MAX_UNCOMPRESSED_BYTES / 2 + 1,
        ]),
      ),
    ).toBe(false);
    expect(zipIsSafe(fakeZip([0xffffffff]))).toBe(false);
    expect(zipIsSafe(fakeZip([]))).toBe(false);
    expect(
      zipIsSafe(Buffer.from('PK\u0003\u0004 not really a zip file at all')),
    ).toBe(false);
    expect(zipIsSafe(Buffer.alloc(10))).toBe(false);
    const truncated = fixture('menu-template-sample.xlsx');
    expect(zipIsSafe(truncated.subarray(0, truncated.length - 30))).toBe(false);
  });
});

describe('menu import Excel template: prices', () => {
  it('reads numbers and text the way the extraction workflow does', () => {
    expect(parseSheetPrice(75)).toBe('75.00');
    expect(parseSheetPrice(15.5)).toBe('15.50');
    expect(parseSheetPrice('75')).toBe('75.00');
    expect(parseSheetPrice('٩٥ جنيه')).toBe('95.00');
    expect(parseSheetPrice('۱۲٫۵')).toBe('12.50');
    expect(parseSheetPrice('1,250.50')).toBe('1250.50');
    expect(parseSheetPrice('12,5')).toBe('12.50');
    expect(parseSheetPrice('1,250')).toBe('1250.00');
    expect(parseSheetPrice('EGP 40')).toBe('40.00');
    expect(parseSheetPrice('40 L.E.')).toBe('40.00');
    expect(parseSheetPrice('ج.م 75')).toBe('75.00');
  });

  it('never guesses: anything that is not a safe non-zero price is null', () => {
    for (const bad of [
      0,
      -5,
      12.345,
      Number.NaN,
      1e21,
      '',
      '   ',
      'free',
      '0',
      '1.234',
      '1e5',
      '10 - 12',
      '.75',
      null,
      undefined,
      true,
    ]) {
      expect(parseSheetPrice(bad)).toBeNull();
    }
  });
});

describe('menu import Excel template: rows to extraction', () => {
  const HEADER = [
    'category_ar',
    'category_en',
    'name_ar',
    'name_en',
    'description_ar',
    'description_en',
    'price',
    'size1_ar',
    'size1_en',
    'size1_price',
    'size2_ar',
    'size2_en',
    'size2_price',
  ];
  const blank = (values: Record<string, unknown>): unknown[] =>
    HEADER.map((key) => values[key] ?? null);

  it('recognizes the template by its headers, whatever the case, spacing or column order', () => {
    expect(
      rowsToExtraction([
        ['Name EN', 'PRICE'],
        ['Tea', 10],
      ]),
    ).not.toBeNull();
    expect(
      rowsToExtraction([
        ['price', 'name-ar'],
        [10, 'شاي'],
      ]),
    ).not.toBeNull();
    expect(
      rowsToExtraction([[], [], ['name_en', 'size1_price'], ['Tea', 10]]),
    ).not.toBeNull(); // empty rows above the header
  });

  it('does not take other layouts for the template', () => {
    expect(rowsToExtraction([])).toBeNull();
    expect(
      rowsToExtraction([
        ['Item', 'Cost'],
        ['Tea', 10],
      ]),
    ).toBeNull();
    expect(
      rowsToExtraction([
        ['name_en', 'notes'],
        ['Tea', 'hot'],
      ]),
    ).toBeNull(); // a name column but no price column
    expect(
      rowsToExtraction([
        ['price', 'category_en'],
        [10, 'Drinks'],
      ]),
    ).toBeNull(); // a price column but no name column
  });

  it('maps rows to categories and products, with sizes, fill-down categories and the cheapest size as price', () => {
    const extraction = rowsToExtraction([
      HEADER,
      blank({
        category_ar: 'بيتزا',
        category_en: 'Pizza',
        name_ar: 'مارجريتا',
        name_en: 'Margherita',
        size1_ar: 'صغير',
        size1_en: 'Small',
        size1_price: 80,
        size2_ar: 'كبير',
        size2_en: 'Large',
        size2_price: 60,
      }),
      blank({ name_en: 'Pepperoni', price: '95', description_en: 'Spicy' }),
      blank({ price: 12 }), // no name: skipped
      blank({ category_en: 'Drinks', name_en: 'Cola', price: 15.5 }),
    ]);
    expect(extraction).not.toBeNull();
    expect(extraction?.categories).toHaveLength(2);
    const [pizza, drinks] = extraction?.categories ?? [];
    expect(pizza.translations).toEqual({
      ar: { name: 'بيتزا' },
      en: { name: 'Pizza' },
    });
    expect(pizza.products).toHaveLength(2); // the second row reused the category above
    expect(pizza.products[0].price).toBe('60.00'); // blank price: the cheapest size
    expect(pizza.products[0].priceOptions).toHaveLength(2);
    expect(pizza.products[1].price).toBe('95.00');
    expect(pizza.products[1].translations.en).toEqual({
      name: 'Pepperoni',
      description: 'Spicy',
    });
    expect(drinks.translations).toEqual({ en: { name: 'Drinks' } });
    expect(drinks.products[0].price).toBe('15.50');
    expect(extraction?.languages).toEqual(['ar', 'en']);
    expect(extraction?.model).toBe('excel-template');
  });

  it('puts products with no category into a default one, and only reports the languages that are used', () => {
    const extraction = rowsToExtraction([
      HEADER,
      blank({ name_ar: 'شاي', price: 10 }),
    ]);
    expect(extraction?.languages).toEqual(['ar']);
    expect(extraction?.categories).toHaveLength(1);
    expect(extraction?.categories[0].translations.ar.name).toBe('المنيو');
  });

  it('stops at the row limit', () => {
    const rows: unknown[][] = [HEADER];
    for (let i = 0; i < 2500; i += 1)
      rows.push(blank({ name_en: `Item ${i}`, price: 10 }));
    const total = rowsToExtraction(rows)?.categories.reduce(
      (sum, c) => sum + c.products.length,
      0,
    );
    expect(total).toBe(2000);
  });

  it('gives the same answer shape as the extraction service, so the usual validation applies', () => {
    const extraction = rowsToExtraction([
      HEADER,
      blank({ category_en: 'Drinks', name_en: 'Cola', price: 15 }),
      blank({ name_en: 'Water' }),
    ]);
    const result = normalizeExtraction(extraction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.modelName).toBe('excel-template');
    const products = result.data.categories[0].products;
    expect(products.map((p) => p.price)).toEqual(['15.00', null]); // a missing price stays null: a blocker in review
  });
});

describe('menu import Excel template: real files', () => {
  it('reads the sample sheet: fill-down, Arabic digits, a nameless row, a missing price', async () => {
    const read = await readMenuTemplate(fixture('menu-template-sample.xlsx'));
    expect(read.kind).toBe('template');
    if (read.kind !== 'template') return;
    const result = normalizeExtraction(read.extraction);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [pizza, drinks] = result.data.categories;
    expect(pizza.names).toEqual({ ar: 'بيتزا', en: 'Pizza' });
    expect(pizza.products.map((p) => p.names.en)).toEqual([
      'Margherita',
      'Pepperoni',
    ]);
    expect(pizza.products[0].price).toBe('60.00');
    expect(pizza.products[0].priceOptions).toHaveLength(2);
    expect(pizza.products[1].price).toBe('95.00');
    expect(drinks.products.map((p) => [p.names.en, p.price])).toEqual([
      ['Cola', '15.50'],
      ['Water', null],
    ]);
  });

  it('sends an Excel file in another layout on to the model', async () => {
    expect(
      (await readMenuTemplate(fixture('menu-other-layout.xlsx'))).kind,
    ).toBe('other');
  });

  it('refuses a corrupt archive with the stable code', async () => {
    expect(
      await codeOf(() =>
        readMenuTemplate(Buffer.from('PK\u0003\u0004 definitely corrupt')),
      ),
    ).toBe('IMPORT_FILE_INVALID');
    // a well-formed archive with no workbook in it
    expect(await codeOf(() => readMenuTemplate(fakeZip([100])))).toBe(
      'IMPORT_FILE_INVALID',
    );
  });
});
