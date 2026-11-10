import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '../generated/prisma/client';
import { menuSeedCounts, menuSeedProblems, seedMenu, type MenuSeed, type SeedAssets, type SeedCategory } from './seed-menu';

const SEED_DIR = join(__dirname, '..', '..', 'seed-data', 'makkboz');
const load = (): MenuSeed => JSON.parse(readFileSync(join(SEED_DIR, 'menu.json'), 'utf8')) as MenuSeed;
const category = (seed: MenuSeed, key: string): SeedCategory => {
  const found = seed.categories.find((c) => c.key === key);
  if (!found) throw new Error(`no category ${key}`);
  return found;
};
/** "medium/large" for sized dishes, the plain price otherwise. */
const prices = (seed: MenuSeed, key: string) =>
  category(seed, key).products.map((p) => (p.variants ? p.variants.map((v) => v.price).sort((a, b) => Number(a) - Number(b)).join('/') : p.price));

describe('Makkboz menu seed file', () => {
  const seed = load();

  it('is valid, bilingual everywhere and complete', () => {
    expect(menuSeedProblems(seed)).toEqual([]);
    expect(menuSeedCounts(seed)).toMatchObject({ categories: 11, products: 148 });
  });

  // The photographed printed menu (two sides): the numbers a guest pays must match it exactly.
  it('holds the printed prices of every section', () => {
    expect(prices(seed, 'sharqi')).toEqual([
      '265/375', '275/385', '285/395', '275/385', '275/385', '285/395', '245/355', '205/305', '225/335', '205/305',
      '225/335', '265/375', '295/405', '235/345', '375/495', '395/530', '220/310', '295/405', '295/395',
    ]);
    expect(prices(seed, 'iskandarani')).toEqual([
      '250/360', '260/370', '270/380', '260/370', '260/370', '280/390', '230/340', '190/290', '210/320', '190/290',
      '210/320', '250/360', '280/390', '220/330', '360/480', '380/510', '205/295', '280/390', '280/380',
    ]);
    expect(prices(seed, 'mashaltet')).toEqual(['150/230/300']);
    expect(prices(seed, 'pizza')).toEqual([
      '210/300', '220/300', '230/340', '230/340', '230/340', '250/390', '210/310', '170/255', '190/290', '160/260',
      '190/300', '230/340', '260/390', '230/330', '290/420', '310/450', '130/200', '140/210', '190/290', '260/370',
      '240/340', '230/350', '400',
    ]);
    expect(prices(seed, 'calzone')).toEqual(['140', '130', '105', '140', '170', '150', '170', '180']);
    expect(prices(seed, 'malfouf')).toEqual([
      '230', '240', '250', '260', '200', '160', '190', '190', '170', '220', '250', '350', '360', '185', '260', '250',
    ]);
    expect(prices(seed, 'savory-crepe')).toEqual([
      '150', '140', '150', '190', '190', '140', '130', '135', '170', '75', '90', '200', '200', '150', '180', '200', '180',
    ]);
    expect(prices(seed, 'sweet-crepe')).toEqual(['90', '100', '150', '100', '110']);
    expect(prices(seed, 'sweet-fiteer')).toEqual([
      '60/100', '70/120', '90/140', '130/220', '140/240', '150/260', '160/270', '210/320', '170/280', '170/280',
      '170/280', '220/320', '250/350',
    ]);
    expect(prices(seed, 'snacks')).toEqual(['40', '55', '110', '65', '15', '50', '15', '25']);
    // extras: fiteer (per size), pizza (per size), crêpe (single)
    expect(prices(seed, 'extras')).toEqual([
      '40/60', '40/60', '50/80', '40/70', '20/30', '50/80', '60/100',
      '40/60', '50/80', '50/80', '40/70', '20/30', '50/80', '60/100',
      '30', '40', '40', '50', '50',
    ]);
  });

  it('never invents offers or discounts, and prices are exact decimal strings', () => {
    const text = readFileSync(join(SEED_DIR, 'menu.json'), 'utf8');
    expect(text).not.toMatch(/discount|"featured": false/i);
    for (const c of seed.categories)
      for (const p of c.products) for (const v of p.variants ?? []) expect(v.price).toMatch(/^\d+$/);
  });

  it('models the printed choices as required single choices at no extra price', () => {
    const grouped = seed.categories.flatMap((c) => c.products.filter((p) => (p.modifierGroups ?? []).length > 0));
    // meshaltet filling, extra sauce, and the multi-item extras (6 fiteer, 6 pizza, 4 crêpe)
    expect(grouped).toHaveLength(2 + 6 + 6 + 4);
    for (const product of grouped) {
      const [choice] = product.modifierGroups ?? [];
      expect(choice.min).toBe(1);
      expect(choice.max).toBe(1);
      expect(choice.options.every((o) => o.price === '0')).toBe(true);
    }
    const mash = category(seed, 'mashaltet').products[0];
    expect(mash.modifierGroups?.[0].options.map((o) => o.names.ar)).toEqual(['جبنة قديمة', 'عسل أبيض', 'قشطة']);
  });

  it('gives every sized product the cheapest size as default; the large-only pizza has one price', () => {
    for (const c of seed.categories)
      for (const p of c.products) {
        if (!p.variants) continue;
        const min = Math.min(...p.variants.map((v) => Number(v.price)));
        expect(Number(p.variants.find((v) => v.default)?.price)).toBe(min);
      }
    const makhbouza = category(seed, 'pizza').products.at(-1);
    expect(makhbouza?.variants).toBeUndefined();
    expect(makhbouza?.price).toBe('400');
  });

  it('ships every photo it names and the contact data of the printed menu', () => {
    const named = new Set<string>(
      [seed.restaurant.logo as string].concat(
        seed.categories.flatMap((c) => [c.image, ...c.products.map((p) => p.image)].filter((x): x is string => !!x)),
      ),
    );
    const design = seed.restaurant.exclusiveDesign;
    if (design?.rendererKey === 'MAKKBOZ_HERITAGE_V1') for (const image of Object.values(design.images ?? {})) if (image) named.add(image);
    for (const name of named) expect(existsSync(join(SEED_DIR, 'images', name))).toBe(true);
    expect(seed.restaurant.contact).toEqual({ phone: '+201044095071', whatsapp: '+201044095072' });
    expect(seed.branch.address).toContain('مول الألسن بلازا');
    expect(seed.restaurant.name).toBe('مخبوز');
    expect(seed.restaurant.currencyCode).toBe('EGP');
  });
});

function buildTx(options: { rendererHolder?: string | null } = {}) {
  const create = () => jest.fn().mockImplementation(() => Promise.resolve({ id: randomUUID() }));
  return {
    menu: { count: jest.fn().mockResolvedValue(0), create: create() },
    restaurant: { update: jest.fn().mockResolvedValue({}) },
    branch: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'branch-1' }), update: jest.fn().mockResolvedValue({}) },
    branchTranslation: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    restaurantLocale: { upsert: jest.fn().mockResolvedValue({}) },
    restaurantAnnouncement: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    deliveryZone: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    category: { create: create() },
    product: { create: create() },
    productVariant: { create: create() },
    modifierGroup: { create: create() },
    modifierOption: { create: create() },
    restaurantExclusiveDesign: {
      findUnique: jest.fn().mockResolvedValue(options.rendererHolder ? { restaurantId: options.rendererHolder } : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
}
const asTx = (tx: ReturnType<typeof buildTx>) => tx as unknown as Prisma.TransactionClient;
const assets = (): SeedAssets & { stored: string[] } => {
  const stored: string[] = [];
  return {
    stored,
    store: (image) => {
      stored.push(image);
      return Promise.resolve(`/media/${randomUUID()}.webp`);
    },
  };
};

describe('seedMenu with the Makkboz seed', () => {
  it('stores the logo and photos, contact, branch address and assigns the design to that Restaurant only', async () => {
    const tx = buildTx();
    const store = assets();
    const result = await seedMenu(asTx(tx), 'restaurant-7', load(), store);
    expect(result).toMatchObject({ outcome: 'seeded', exclusiveDesign: 'assigned' });
    expect(tx.restaurant.update).toHaveBeenCalledWith({
      where: { id: 'restaurant-7' },
      data: expect.objectContaining({ contactPhone: '+201044095071', whatsappNumber: '+201044095072' }) as unknown,
    });
    const products = (tx.product.create.mock.calls as [{ data: { restaurantId: string; featured: boolean } }][]).map((c) => c[0].data);
    expect(products.every((p) => p.restaurantId === 'restaurant-7')).toBe(true);
    expect(products.filter((p) => p.featured)).toHaveLength(4);
    const [[args]] = tx.restaurantExclusiveDesign.upsert.mock.calls as [[{ create: { status: string; rendererKey: string; publishedSettings: Record<string, unknown> } }]];
    expect(args.create).toMatchObject({ status: 'ACTIVE_CUSTOM', rendererKey: 'MAKKBOZ_HERITAGE_V1' });
    expect(args.create.publishedSettings).toMatchObject({ brandAr: 'مخبوز', brandEn: 'MAKXBOZ' });
    expect(args.create.publishedSettings.heroImageAssetPath).toBeNull();
    expect(args.create.publishedSettings.heroSmallImageAssetPath).toBeNull();
    expect(Object.keys(args.create.publishedSettings.categoryExtras as object)).toHaveLength(11);
    expect(store.stored).not.toContain('hero-feteer.webp');
  });

  it('does not take the design from another Restaurant', async () => {
    const tx = buildTx({ rendererHolder: 'someone-else' });
    const result = await seedMenu(asTx(tx), 'restaurant-7', load(), assets());
    expect(result).toMatchObject({ exclusiveDesign: 'rendererTaken' });
    expect(tx.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
  });
});
