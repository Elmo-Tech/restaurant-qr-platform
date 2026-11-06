/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
 * the Prisma create arguments captured from the transaction double are inspected as plain data. */
import { Prisma } from '../generated/prisma/client';
import { menuSeedProblems, type MenuSeed } from './seed-menu';
import { offerSeedProblems, offerSeedPhotoNames, seedOffers, type SeedOffer } from './seed-offers';

/** A small example of the optional `offers` block of a menu seed (a test fixture, not a real restaurant's data). */
const EXAMPLE: SeedOffer[] = [
  {
    names: { ar: 'وجبة الفطار', en: 'Breakfast meal' },
    descriptions: { ar: 'ساندويتش فول أو طعمية + بطاطس هدية', en: 'Ful or taameya sandwich + free fries' },
    price: '35',
    badge: 'GIFT',
    active: true,
    image: 'breakfast.jpg',
    slots: [
      {
        kind: 'SINGLE',
        titles: { ar: 'اختار الساندويتش', en: 'Pick your sandwich' },
        options: [
          { names: { ar: 'فول', en: 'Ful' } },
          { names: { ar: 'طعمية', en: 'Taameya' } },
          { names: { ar: 'كبدة', en: 'Liver' }, extra: '10' },
        ],
      },
      {
        kind: 'FIXED',
        titles: { ar: 'هدية العرض', en: 'Gift' },
        options: [{ names: { ar: 'بطاطس هدية', en: 'Free fries' } }],
      },
    ],
  },
  {
    names: { ar: 'بوكس العيلة', en: 'Family box' },
    price: '120.00',
    days: [5],
    slots: [
      {
        kind: 'MULTI',
        count: 3,
        titles: { ar: 'اختار ٣', en: 'Pick 3' },
        options: [
          { names: { ar: 'فول', en: 'Ful' } },
          { names: { ar: 'جبنة', en: 'Cheese' }, extra: '5' },
        ],
      },
    ],
  },
];

function fakeTx(existingNames: string[] = []) {
  const created: any[] = [];
  const tx = {
    offerTranslation: { findMany: jest.fn().mockResolvedValue(existingNames.map((name) => ({ name }))) },
    offer: {
      aggregate: jest.fn().mockResolvedValue({ _max: { displayOrder: 2 } }),
      create: jest.fn((args: unknown) => {
        created.push(args);
        return Promise.resolve({});
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, created, raw: tx };
}

describe('offers in the menu seed (DEC-069)', () => {
  it('accepts the example and lists the photo it names', () => {
    expect(offerSeedProblems(EXAMPLE)).toEqual([]);
    expect(offerSeedProblems(undefined)).toEqual([]);
    expect(offerSeedPhotoNames(EXAMPLE)).toEqual(['breakfast.jpg']);
  });

  it('reports every reason an offer cannot be used', () => {
    const bad = (change: Partial<SeedOffer>) => offerSeedProblems([{ ...EXAMPLE[0], ...change }]);
    expect(bad({ price: '12.345' }).join()).toContain('bad price');
    expect(bad({ names: { ar: 'س', en: '' } }).join()).toContain('lacks a name');
    expect(bad({ days: [9] }).join()).toContain('bad days');
    expect(bad({ startsOn: '2026-02-30' }).join()).toContain('bad date');
    expect(bad({ startsOn: '2026-12-10', endsOn: '2026-12-01' }).join()).toContain('ends before');
    expect(bad({ slots: [] }).join()).toContain('NO_SLOTS');
    expect(
      bad({
        slots: [{ kind: 'FIXED', titles: { ar: 'ه', en: 'g' }, options: [{ names: { ar: 'س', en: 's' }, extra: '3' }] }],
      }).join(),
    ).toContain('FIXED_ADJUSTMENT');
    expect(offerSeedProblems([EXAMPLE[0], EXAMPLE[0]]).join()).toContain('repeats a name');
  });

  it('is part of the whole-seed validation', () => {
    const seed = {
      version: 1,
      restaurant: { name: 'X', defaultLocale: 'ar', currencyCode: 'EGP', countryCode: 'EG', timezone: 'Africa/Cairo' },
      branch: { names: { ar: 'ف', en: 'B' } },
      menu: { nameInternal: 'm', names: { ar: 'م', en: 'M' } },
      sharedModifierGroups: {},
      categories: [{ key: 'c', names: { ar: 'ق', en: 'C' }, products: [] }],
      offers: [{ ...EXAMPLE[0], price: 'free' }],
    } as unknown as MenuSeed;
    expect(menuSeedProblems(seed).join()).toContain('bad price');
  });

  it('creates new offers switched OFF unless the entry says active, with exact money and stored counts', async () => {
    const { tx, created } = fakeTx();
    const photo = jest.fn((image: string | undefined) => Promise.resolve(image ? `/media/${image}` : null));
    const result = await seedOffers(tx, 'restaurant-1', 'ar', EXAMPLE, photo);
    expect(result).toEqual({ created: ['وجبة الفطار', 'بوكس العيلة'], skipped: [] });
    const [breakfast, box] = created.map((call) => call.data);
    expect(breakfast).toMatchObject({ restaurantId: 'restaurant-1', status: 'ACTIVE', badge: 'GIFT', displayOrder: 3, imageAssetPath: '/media/breakfast.jpg' });
    expect(breakfast.price.toFixed(2)).toBe('35.00');
    expect(box).toMatchObject({ status: 'INACTIVE', badge: 'OFFER', daysOfWeek: [5], displayOrder: 4, imageAssetPath: null });
    expect(breakfast.slots.create.map((slot: any) => [slot.kind, slot.requiredCount])).toEqual([['SINGLE', 1], ['FIXED', 0]]);
    expect(box.slots.create[0].requiredCount).toBe(3);
    const liver = breakfast.slots.create[0].options.create[2];
    expect(liver.priceAdjustment.toFixed(2)).toBe('10.00');
    expect(breakfast.slots.create[1].options.create[0].priceAdjustment.toFixed(2)).toBe('0.00');
    expect(breakfast.translations.create).toEqual([
      { locale: 'ar', name: 'وجبة الفطار', description: 'ساندويتش فول أو طعمية + بطاطس هدية' },
      { locale: 'en', name: 'Breakfast meal', description: 'Ful or taameya sandwich + free fries' },
    ]);
  });

  it('is repeatable: an offer whose name already exists is left exactly as it is', async () => {
    const { tx, created } = fakeTx(['وجبة الفطار']);
    const result = await seedOffers(tx, 'restaurant-1', 'ar', EXAMPLE, () => Promise.resolve(null));
    expect(result).toEqual({ created: ['بوكس العيلة'], skipped: ['وجبة الفطار'] });
    expect(created).toHaveLength(1);
  });

  it('only looks at THIS restaurant\'s non-deleted offers', async () => {
    const { tx, raw } = fakeTx();
    await seedOffers(tx, 'restaurant-1', 'ar', EXAMPLE, () => Promise.resolve(null));
    expect(raw.offerTranslation.findMany).toHaveBeenCalledWith({
      where: { locale: 'ar', offer: { restaurantId: 'restaurant-1', status: { not: 'ARCHIVED' } } },
      select: { name: true },
    });
  });
});
