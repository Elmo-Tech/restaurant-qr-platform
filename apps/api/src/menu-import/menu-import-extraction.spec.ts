import {
  cleanPrice,
  cleanText,
  languageCode,
  matchKey,
  normalizeExtraction,
} from './menu-import-extraction';
import {
  inspectMenuFile,
  inspectMenuFiles,
  MAX_IMPORT_FILES,
} from './menu-import-file';

function ok(raw: unknown) {
  const result = normalizeExtraction(raw);
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result.data;
}

const product = (
  en: string,
  ar: string | null,
  price: unknown,
  extra = {},
) => ({
  translations: {
    en: { name: en },
    ...(ar ? { ar: { name: ar } } : {}),
  },
  price,
  confidence: 'HIGH',
  ...extra,
});

const base = (categories: unknown[], extra = {}) => ({
  schemaVersion: 1,
  status: 'EXTRACTED',
  categories,
  ...extra,
});

describe('menu import extraction normalizer', () => {
  it('rejects unknown schema versions and non-objects', () => {
    expect(normalizeExtraction(null)).toEqual({
      ok: false,
      code: 'INVALID_EXTRACTION_RESULT',
    });
    expect(normalizeExtraction({ ...base([]), schemaVersion: 2 })).toEqual({
      ok: false,
      code: 'INVALID_EXTRACTION_RESULT',
    });
  });

  it('maps a known failure code and collapses unknown ones', () => {
    expect(
      normalizeExtraction({
        schemaVersion: 1,
        status: 'FAILED',
        errorCode: 'EMPTY_SHEET',
      }),
    ).toEqual({
      ok: false,
      code: 'EMPTY_SHEET',
    });
    expect(
      normalizeExtraction({
        schemaVersion: 1,
        status: 'FAILED',
        errorCode: 'secret provider text',
      }),
    ).toEqual({ ok: false, code: 'EXTRACTION_FAILED' });
  });

  it('keeps prices as exact strings and refuses numbers, negatives and garbage', () => {
    expect(cleanPrice('60')).toBe('60.00');
    expect(cleanPrice('60.5')).toBe('60.50');
    expect(cleanPrice('007.25')).toBe('7.25');
    expect(cleanPrice(60)).toBeNull();
    expect(cleanPrice('-5')).toBeNull();
    expect(cleanPrice('0')).toBeNull();
    expect(cleanPrice('1e9')).toBeNull();
    expect(cleanPrice('60.999')).toBeNull();
    expect(cleanPrice('1234567890')).toBeNull();
  });

  it('cleans text: control characters, kashida, whitespace and length', () => {
    expect(cleanText('  Piz\u0000za \n  Margherita ', 50)).toBe(
      'Piz za Margherita',
    );
    expect(cleanText('بيـــتزا', 50)).toBe('بيتزا');
    expect(cleanText('x'.repeat(300), 120)).toHaveLength(120);
    expect(cleanText(42, 10)).toBe('');
  });

  it('accepts only two-letter language codes', () => {
    expect(languageCode('AR')).toBe('ar');
    expect(languageCode('ar-EG')).toBe('ar');
    expect(languageCode('arabic')).toBeNull();
    expect(languageCode('<script>')).toBeNull();
  });

  it('builds a bilingual result and flags products missing a translation', () => {
    const data = ok(
      base([
        {
          translations: { en: { name: 'Pizza' }, ar: { name: 'بيتزا' } },
          products: [
            product('Margherita', 'مارجريتا', '90'),
            product('Pepperoni', 'بيبروني', '110'),
            product('Four Cheese', null, '120'),
          ],
        },
      ]),
    );
    expect(data.languages.sort()).toEqual(['ar', 'en']);
    const [a, , c] = data.categories[0].products;
    expect(a.flags).toEqual([]);
    expect(c.flags).toEqual(['MISSING_TRANSLATION']);
    expect(a.price).toBe('90.00');
  });

  it('merges duplicate categories, drops duplicate products, empty ones and nameless ones', () => {
    const data = ok(
      base([
        {
          translations: { en: { name: 'Drinks' } },
          products: [product('Cola', null, '20')],
        },
        {
          translations: { en: { name: 'drinks' } },
          products: [
            product('cola', null, '25'),
            product('Juice', null, '30'),
            { translations: {} },
          ],
        },
        { translations: { en: { name: 'Empty' } }, products: [] },
      ]),
    );
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].products.map((p) => p.names.en)).toEqual([
      'Cola',
      'Juice',
    ]);
  });

  it('keeps valid sizes only and a null price when none was readable', () => {
    const data = ok(
      base([
        {
          translations: { en: { name: 'Coffee' } },
          products: [
            product('Latte', null, null, {
              priceOptions: [
                { translations: { en: { label: 'Small' } }, price: '40' },
                { translations: { en: { label: 'Large' } }, price: 60 },
                { translations: {}, price: '50' },
              ],
            }),
          ],
        },
      ]),
    );
    const latte = data.categories[0].products[0];
    expect(latte.price).toBeNull();
    expect(latte.priceOptions).toEqual([
      { labels: { en: 'Small' }, price: '40.00' },
    ]);
  });

  it('caps categories and products and reports it', () => {
    const categories = Array.from({ length: 90 }, (_, i) => ({
      translations: { en: { name: `Cat ${i}` } },
      products: [product(`Item ${i}`, null, '10')],
    }));
    const data = ok(base(categories));
    expect(data.categories).toHaveLength(80);
    expect(data.warnings).toContain('RESULT_TRUNCATED');
  });

  it('fails an empty menu', () => {
    expect(normalizeExtraction(base([]))).toEqual({
      ok: false,
      code: 'EMPTY_RESULT',
    });
  });

  it('keeps the stable failure codes of the extraction service, MODEL_BUSY included, and collapses unknown ones', () => {
    const failed = (errorCode: string) =>
      normalizeExtraction({ schemaVersion: 1, status: 'FAILED', errorCode });
    expect(failed('MODEL_BUSY')).toEqual({ ok: false, code: 'MODEL_BUSY' });
    expect(failed('MODEL_ERROR')).toEqual({ ok: false, code: 'MODEL_ERROR' });
    expect(failed('SOMETHING_NEW')).toEqual({
      ok: false,
      code: 'EXTRACTION_FAILED',
    });
  });

  it('passes the SOME_FILES_FAILED warning through (some of several images could not be read)', () => {
    const data = ok(
      base(
        [
          {
            translations: { en: { name: 'A' } },
            products: [product('B', null, '5')],
          },
        ],
        { warnings: ['SOME_FILES_FAILED'] },
      ),
    );
    expect(data.warnings).toEqual(['SOME_FILES_FAILED']);
  });

  it('only accepts uppercase warning codes from the model', () => {
    const data = ok(
      base(
        [
          {
            translations: { en: { name: 'A' } },
            products: [product('B', null, '5')],
          },
        ],
        {
          warnings: ['LOW_RESOLUTION', 'please visit http://evil.example'],
        },
      ),
    );
    expect(data.warnings).toEqual(['LOW_RESOLUTION']);
  });

  it('matches names ignoring case, diacritics, alef/yeh variants and punctuation', () => {
    expect(matchKey('Café  Latte!')).toBe(matchKey('cafe latte'));
    expect(matchKey('أيس كريم')).toBe(matchKey('ايس كريم'));
    expect(matchKey('شاى')).toBe(matchKey('شاي'));
  });
});

describe('menu import file inspection', () => {
  const file = (bytes: number[], name: string) => ({
    buffer: Buffer.from(bytes),
    originalname: name,
    mimetype: 'application/octet-stream',
    size: bytes.length,
  });

  it('identifies files by content, not by name or declared type', () => {
    expect(
      inspectMenuFile(file([0xff, 0xd8, 0xff, 0xe0, 0], 'a.txt')).mimeType,
    ).toBe('image/jpeg');
    expect(
      inspectMenuFile(
        file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a'),
      ).sourceType,
    ).toBe('IMAGE');
    expect(
      inspectMenuFile(file([...Buffer.from('%PDF-1.7')], 'menu.bin'))
        .sourceType,
    ).toBe('PDF');
    expect(
      inspectMenuFile(
        file([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')], 'x'),
      ).mimeType,
    ).toBe('image/webp');
  });

  it('accepts a zip only as .xlsx and rejects other containers and unknown bytes', () => {
    const zip = [0x50, 0x4b, 0x03, 0x04, 0, 0];
    expect(inspectMenuFile(file(zip, 'prices.xlsx')).sourceType).toBe(
      'SPREADSHEET',
    );
    expect(() => inspectMenuFile(file(zip, 'report.docx'))).toThrow();
    expect(() => inspectMenuFile(file([1, 2, 3, 4], 'menu.jpg'))).toThrow();
    expect(() => inspectMenuFile(undefined)).toThrow();
  });

  it('strips directories and control characters from the display name', () => {
    expect(
      inspectMenuFile(
        file([...Buffer.from('%PDF-1.4')], '..\\..\\etc/pass\u0000wd.pdf'),
      ).safeName,
    ).toBe('passwd.pdf');
  });

  it('rejects files over 10 MB', () => {
    const big = {
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x25),
      originalname: 'big.pdf',
      mimetype: 'application/pdf',
      size: 10 * 1024 * 1024 + 1,
    };
    expect(() => inspectMenuFile(big)).toThrow();
  });
});

describe('menu import file set inspection (DEC-057)', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
  const JPG = [0xff, 0xd8, 0xff, 0xe0, 0];
  const PDF = [...Buffer.from('%PDF-1.7')];
  const XLSX = [0x50, 0x4b, 0x03, 0x04, 0, 0];
  const upload = (bytes: number[] | Buffer, name: string) => {
    const buffer = Buffer.from(bytes);
    return {
      buffer,
      originalname: name,
      mimetype: 'application/octet-stream',
      size: buffer.length,
    };
  };
  const codeOf = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      return (
        error as { getResponse(): { error: { code: string } } }
      ).getResponse().error.code;
    }
    return 'NO_ERROR';
  };

  it('accepts one to ten images of any mix of formats, in upload order', () => {
    const set = inspectMenuFiles([
      upload(PNG, 'page 1.png'),
      upload(JPG, 'page 2.jpg'),
      upload(PNG, 'page 3.png'),
    ]);
    expect(set.sourceType).toBe('IMAGE');
    expect(set.files.map((f) => f.fileName)).toEqual([
      'page 1.png',
      'page 2.jpg',
      'page 3.png',
    ]);
    expect(set.files.map((f) => f.mimeType)).toEqual([
      'image/png',
      'image/jpeg',
      'image/png',
    ]);
    expect(set.fileName).toBe('page 1.png, page 2.jpg, page 3.png');
    expect(set.mimeType).toBe('image/png');
    expect(set.totalBytes).toBe(PNG.length * 2 + JPG.length);
    const ten = Array.from({ length: MAX_IMPORT_FILES }, (_, i) =>
      upload(PNG, `p${i}.png`),
    );
    expect(inspectMenuFiles(ten).files).toHaveLength(MAX_IMPORT_FILES);
  });

  it('keeps a single file of any kind working as before', () => {
    expect(inspectMenuFiles([upload(PDF, 'menu.pdf')])).toMatchObject({
      sourceType: 'PDF',
      fileName: 'menu.pdf',
      mimeType: 'application/pdf',
    });
    expect(inspectMenuFiles([upload(XLSX, 'prices.xlsx')]).sourceType).toBe(
      'SPREADSHEET',
    );
  });

  it('rejects nothing, too many files, and mixes that are not allowed, with the stable code', () => {
    expect(codeOf(() => inspectMenuFiles(undefined))).toBe(
      'IMPORT_FILE_INVALID',
    );
    expect(codeOf(() => inspectMenuFiles([]))).toBe('IMPORT_FILE_INVALID');
    const eleven = Array.from({ length: MAX_IMPORT_FILES + 1 }, (_, i) =>
      upload(PNG, `p${i}.png`),
    );
    expect(codeOf(() => inspectMenuFiles(eleven))).toBe('IMPORT_FILE_INVALID');
    expect(
      codeOf(() =>
        inspectMenuFiles([upload(PNG, 'a.png'), upload(PDF, 'b.pdf')]),
      ),
    ).toBe('IMPORT_FILE_INVALID');
    expect(
      codeOf(() =>
        inspectMenuFiles([upload(PDF, 'a.pdf'), upload(PDF, 'b.pdf')]),
      ),
    ).toBe('IMPORT_FILE_INVALID');
    expect(
      codeOf(() =>
        inspectMenuFiles([upload(XLSX, 'a.xlsx'), upload(XLSX, 'b.xlsx')]),
      ),
    ).toBe('IMPORT_FILE_INVALID');
    expect(
      codeOf(() =>
        inspectMenuFiles([upload(PNG, 'a.png'), upload([1, 2, 3, 4], 'b.png')]),
      ),
    ).toBe('IMPORT_FILE_INVALID');
  });

  it('rejects files that are over 10 MB, or over 40 MB together, with the stable code', () => {
    const size = 9 * 1024 * 1024;
    const image = (name: string) =>
      upload(Buffer.concat([Buffer.from(PNG), Buffer.alloc(size)]), name);
    expect(
      codeOf(() =>
        inspectMenuFiles([
          image('1.png'),
          image('2.png'),
          image('3.png'),
          image('4.png'),
        ]),
      ),
    ).toBe('NO_ERROR'); // 36 MB
    expect(
      codeOf(() =>
        inspectMenuFiles([
          image('1.png'),
          image('2.png'),
          image('3.png'),
          image('4.png'),
          image('5.png'),
        ]),
      ),
    ).toBe('IMPORT_FILE_TOO_LARGE'); // 45 MB
    expect(
      codeOf(() =>
        inspectMenuFiles([
          upload(
            Buffer.concat([Buffer.from(PNG), Buffer.alloc(10 * 1024 * 1024)]),
            'big.png',
          ),
        ]),
      ),
    ).toBe('IMPORT_FILE_TOO_LARGE');
  });

  it('cuts a long list of names for the Job record', () => {
    const names = Array.from({ length: 10 }, (_, i) =>
      upload(PNG, `a-rather-long-menu-page-name-${i}.png`),
    );
    expect(inspectMenuFiles(names).fileName.length).toBeLessThanOrEqual(120);
  });
});
