import { normalizeExtraction } from '../menu-import-extraction';
import {
  canonicalLanguage,
  fixArabic,
  mergePages,
  readModelJson,
  type PageResult,
} from './menu-model-output';

const answer = (
  data: unknown,
  finishReason: string | null = 'stop',
): PageResult => ({
  ok: true,
  text: JSON.stringify(data),
  finishReason,
});
const failed = (
  code: 'MODEL_BUSY' | 'MODEL_ERROR' = 'MODEL_ERROR',
): PageResult => ({
  ok: false,
  code,
  message: 'x',
});
const product = (
  en: string,
  ar: string | null,
  price: unknown,
  extra = {},
) => ({
  translations: {
    en: { name: en, description: null },
    ...(ar ? { ar: { name: ar, description: null } } : {}),
  },
  price,
  priceOptions: [],
  confidence: 'high',
  ...extra,
});
const category = (en: string, ar: string | null, products: unknown[]) => ({
  translations: { en: { name: en }, ...(ar ? { ar: { name: ar } } : {}) },
  products,
});

describe('reading the model text', () => {
  it('finds the JSON inside a fence or a sentence, and refuses what is not an object', () => {
    expect(readModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(readModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(readModelJson('Here you go: {"a":1} Hope it helps')).toEqual({
      a: 1,
    });
    expect(readModelJson('[1,2]')).toBeNull();
    expect(readModelJson('{"a":')).toBeNull();
    expect(readModelJson('no json')).toBeNull();
  });

  it('knows languages by code, region or name', () => {
    expect(canonicalLanguage('ar')).toBe('ar');
    expect(canonicalLanguage(' EN ')).toBe('en');
    expect(canonicalLanguage('ar-EG')).toBe('ar');
    expect(canonicalLanguage('Arabic')).toBe('ar');
    expect(canonicalLanguage('klingon')).toBeNull();
    expect(canonicalLanguage(5)).toBeNull();
  });

  it('puts a reversed Arabic ligature back', () => {
    expect(fixArabic('األرز')).toBe('الأرز');
    expect(fixArabic('سلطة واألرز')).toBe('سلطة والأرز');
    expect(fixArabic('الأرز')).toBe('الأرز');
  });
});

describe('putting the answers together', () => {
  it('merges two images into one result: same category once, a repeated product once, prices as exact strings', () => {
    const merged = mergePages(
      [
        answer({
          languages: ['en'],
          categories: [
            category('Pizza', null, [product('Margherita', null, '60')]),
          ],
        }),
        answer({
          languages: ['ar', 'en'],
          categories: [
            category('Pizza', null, [
              product('Margherita', null, '60'),
              product('Pepperoni', null, 70),
            ]),
            category('Drinks', null, [product('Cola', null, '15.5')]),
          ],
        }),
      ],
      'gemini-x',
    );
    expect(merged.status).toBe('EXTRACTED');
    const result = normalizeExtraction(merged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.modelName).toBe('gemini-x');
    expect(result.data.categories.map((c) => c.names.en)).toEqual([
      'Pizza',
      'Drinks',
    ]);
    expect(
      result.data.categories[0].products.map((p) => [p.names.en, p.price]),
    ).toEqual([
      ['Margherita', '60.00'],
      ['Pepperoni', '70.00'],
    ]);
    expect(result.data.categories[1].products[0].price).toBe('15.50');
    expect(result.data.warnings).toEqual([]);
  });

  it('fixes what models get wrong: Arabic digits, currency words, language names, a missing category name', () => {
    const merged = mergePages(
      [
        answer({
          languages: ['Arabic'],
          categories: [
            {
              translations: { Arabic: { name: 'مشروبات' } },
              products: [
                {
                  translations: { Arabic: { name: 'عصير' } },
                  price: '٧٥ جنيه',
                  priceOptions: [
                    {
                      translations: { Arabic: { label: 'كبير' } },
                      price: '٩٠',
                    },
                  ],
                  confidence: 'HIGH',
                },
              ],
            },
            { translations: {}, products: [product('Tea', null, 'free')] },
          ],
        }),
      ],
      'm',
    );
    const result = normalizeExtraction(merged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [drinks, unnamed] = result.data.categories;
    expect(drinks.names).toEqual({ ar: 'مشروبات' });
    expect(drinks.products[0]).toMatchObject({
      price: '75.00',
      confidence: 'HIGH',
    });
    expect(drinks.products[0].priceOptions).toEqual([
      { labels: { ar: 'كبير' }, price: '90.00' },
    ]);
    expect(unnamed.names.en ?? unnamed.names.ar).toBeTruthy(); // the default name, so its products are not lost
    expect(unnamed.products[0].price).toBeNull(); // "free" is not a price: never guessed
  });

  it('skips junk the model put in the answer instead of failing', () => {
    const merged = mergePages(
      [
        answer({
          categories: [
            null,
            5,
            'x',
            category('Real', null, [
              null,
              { translations: {} },
              product('Item', null, '10'),
            ]),
          ],
        }),
      ],
      'm',
    );
    const result = normalizeExtraction(merged);
    expect(result.ok && result.data.categories[0].products).toHaveLength(1);
  });

  it('keeps going when some images fail and says so; fails with the first code when all do', () => {
    const partial = mergePages(
      [
        answer({
          categories: [category('A', null, [product('X', null, '1')])],
        }),
        failed('MODEL_BUSY'),
      ],
      'm',
    );
    expect(partial).toMatchObject({
      status: 'EXTRACTED',
      warnings: ['SOME_FILES_FAILED'],
    });

    expect(
      mergePages([failed('MODEL_BUSY'), failed('MODEL_ERROR')], 'm'),
    ).toEqual({
      schemaVersion: 1,
      status: 'FAILED',
      errorCode: 'MODEL_BUSY',
      model: 'm',
    });
    expect(mergePages([], 'm')).toMatchObject({
      status: 'FAILED',
      errorCode: 'MODEL_ERROR',
    });
  });

  it('classifies unusable answers: empty, not JSON, cut off, no categories', () => {
    const code = (page: PageResult) =>
      (mergePages([page], 'm') as { errorCode: string }).errorCode;
    expect(code({ ok: true, text: '', finishReason: 'stop' })).toBe(
      'MODEL_ERROR',
    );
    expect(
      code({ ok: true, text: 'sorry, I cannot', finishReason: 'stop' }),
    ).toBe('INVALID_MODEL_OUTPUT');
    expect(
      code({ ok: true, text: '{"categories":[{"tra', finishReason: 'length' }),
    ).toBe('TRUNCATED_OUTPUT');
    expect(
      code({ ok: true, text: '{"languages":["en"]}', finishReason: 'stop' }),
    ).toBe('INVALID_MODEL_OUTPUT');
  });

  it('warns when an answer was cut off but still readable', () => {
    const merged = mergePages(
      [
        answer(
          { categories: [category('A', null, [product('X', null, '1')])] },
          'length',
        ),
      ],
      'm',
    );
    expect(merged).toMatchObject({
      status: 'EXTRACTED',
      warnings: ['MODEL_OUTPUT_MAY_BE_INCOMPLETE'],
    });
  });

  it('an answer with no product at all is an empty result for the usual validation', () => {
    const result = normalizeExtraction(
      mergePages([answer({ categories: [] })], 'm'),
    );
    expect(result).toEqual({ ok: false, code: 'EMPTY_RESULT' });
  });
});
