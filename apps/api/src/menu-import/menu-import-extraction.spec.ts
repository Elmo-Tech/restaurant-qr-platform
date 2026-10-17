import {
  cleanPrice,
  cleanText,
  languageCode,
  matchKey,
  normalizeExtraction,
} from './menu-import-extraction';
import { inspectMenuFile } from './menu-import-file';

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
