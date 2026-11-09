import {
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  allocateRestaurantSlug,
  isValidSlug,
  looksLikeSlug,
  numberedSlug,
  slugProblem,
  slugify,
  transliterateArabic,
} from './restaurant-slug';
import { createQrPublicCode } from '../qr/qr-public-code';

function lookup(taken: string[]) {
  return {
    restaurantSlug: {
      findMany: jest.fn(({ where }: { where: { slug: { in: string[] } } }) =>
        Promise.resolve(
          where.slug.in
            .filter((s) => taken.includes(s))
            .map((slug) => ({ slug })),
        ),
      ),
    },
  };
}

describe('slugify', () => {
  it.each([
    ['VERDE Napoletana', 'verde-napoletana'],
    ['El Sherbiny', 'el-sherbiny'],
    ['Makkboz', 'makkboz'],
    ["Joe's Café & Bar", 'joes-cafe-and-bar'],
    ['  Pizza   House!!  ', 'pizza-house'],
    ['Café 24/7', 'cafe-24-7'],
  ])('turns %p into %p', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('writes Arabic names as readable Latin letters', () => {
    expect(slugify('الشربيني')).toBe('al-shrbyny');
    expect(slugify('مكبوز')).toBe('mkbwz');
    expect(slugify('مطعم ٢٤')).toBe('mtam-24');
  });

  it('handles mixed Arabic and English names', () => {
    expect(slugify('مطعم Verde')).toBe('mtam-verde');
  });

  it('always returns a valid slug, even for names with no Latin or Arabic letters', () => {
    for (const name of ['', '   ', '!!!', '🍕🍕', '日本', 'ab', 'x']) {
      const slug = slugify(name);
      expect(isValidSlug(slug)).toBe(true);
    }
    expect(slugify('🍕')).toBe('restaurant');
    expect(slugify('ab')).toBe('ab-menu');
  });

  it('keeps long names within the limit, ending on a whole word', () => {
    const slug = slugify(
      'The Very Long Restaurant Name That Keeps Going And Going Forever',
    );
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toBe('the-very-long-restaurant-name-that');
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe('transliterateArabic', () => {
  it('leaves non-Arabic text unchanged and drops diacritics-free letters correctly', () => {
    expect(transliterateArabic('Hello')).toBe('Hello');
    expect(transliterateArabic('بيتزا')).toBe('bytza');
  });
});

describe('slug validity', () => {
  it('accepts lowercase Latin letters, digits and single hyphens (3 to 40 characters)', () => {
    for (const ok of ['abc', 'el-sherbiny', 'cafe-24', 'a1b'])
      expect(isValidSlug(ok)).toBe(true);
  });

  it.each([
    'ab',
    'Upper',
    'has space',
    '-lead',
    'trail-',
    'double--hyphen',
    'under_score',
    'slash/slash',
    'dot.dot',
    'مطعم',
    'a'.repeat(41),
  ])('rejects %p', (bad) => {
    expect(isValidSlug(bad)).toBe(false);
    expect(slugProblem(bad)).toBe('format');
  });

  it('refuses reserved words', () => {
    for (const word of ['admin', 'api', 'staff', 'q', 'platform', 'control', 'cdn', 'mail']) {
      expect(RESERVED_SLUGS.has(word)).toBe(true);
    }
    expect(slugProblem('admin')).toBe('reserved');
    expect(slugProblem('el-sherbiny')).toBeNull();
  });

  it('can never be confused with a generated 43-character QR public code', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isValidSlug(createQrPublicCode())).toBe(false);
      expect(looksLikeSlug(createQrPublicCode())).toBe(false);
    }
    expect(looksLikeSlug('el-sherbiny')).toBe(true);
    expect(looksLikeSlug('L'.repeat(43))).toBe(false);
  });
});

describe('numberedSlug', () => {
  it('adds a simple number', () => {
    expect(numberedSlug('pizza-house', 2)).toBe('pizza-house-2');
    expect(numberedSlug('pizza-house', 12)).toBe('pizza-house-12');
  });

  it('stays within the limit for the longest names', () => {
    const long = 'a'.repeat(SLUG_MAX_LENGTH);
    const slug = numberedSlug(long, 10);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isValidSlug(slug)).toBe(true);
    expect(slug.endsWith('-10')).toBe(true);
  });
});

describe('allocateRestaurantSlug', () => {
  it('uses the plain name when it is free', async () => {
    await expect(
      allocateRestaurantSlug(lookup([]), 'El Sherbiny'),
    ).resolves.toBe('el-sherbiny');
  });

  it('adds -2, then -3 when same-named restaurants exist', async () => {
    await expect(
      allocateRestaurantSlug(lookup(['pizza-house']), 'Pizza House'),
    ).resolves.toBe('pizza-house-2');
    await expect(
      allocateRestaurantSlug(
        lookup(['pizza-house', 'pizza-house-2']),
        'Pizza House',
      ),
    ).resolves.toBe('pizza-house-3');
  });

  it('treats a former slug of another restaurant as taken (it keeps redirecting there)', async () => {
    // `taken` stands for current AND former slugs: the table holds both.
    await expect(
      allocateRestaurantSlug(lookup(['old-name']), 'Old Name'),
    ).resolves.toBe('old-name-2');
  });

  it('never hands out a reserved word', async () => {
    await expect(allocateRestaurantSlug(lookup([]), 'Admin')).resolves.toBe(
      'admin-2',
    );
  });

  it('respects slugs a dry run has already planned', async () => {
    await expect(
      allocateRestaurantSlug(
        lookup([]),
        'Pizza House',
        new Set(['pizza-house']),
      ),
    ).resolves.toBe('pizza-house-2');
  });

  it('asks the database only about its own candidates (no broad scan)', async () => {
    const db = lookup([]);
    await allocateRestaurantSlug(db, 'Pizza House');
    expect(db.restaurantSlug.findMany).toHaveBeenCalledTimes(1);
    const arg = db.restaurantSlug.findMany.mock.calls[0][0];
    expect(arg.where.slug.in[0]).toBe('pizza-house');
    expect(arg.where.slug.in).toContain('pizza-house-2');
  });
});
