import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '../generated/prisma/client';
import { menuSeedCounts, menuSeedProblems, seedMenu, type MenuSeed, type SeedAssets, type SeedCategory } from './seed-menu';
import { seedPhotoNames } from './seed-photos';

const SEED_DIR = join(__dirname, '..', '..', 'seed-data', 'meat-lovers');
const load = (): MenuSeed => JSON.parse(readFileSync(join(SEED_DIR, 'menu.json'), 'utf8')) as MenuSeed;
const category = (seed: MenuSeed, key: string): SeedCategory => {
  const found = seed.categories.find((c) => c.key === key);
  if (!found) throw new Error(`no category ${key}`);
  return found;
};
/** The printed per-kilo price of a product = the price of its 1 kg size. */
const perKilo = (seed: MenuSeed, key: string) =>
  category(seed, key).products.map((p) => p.variants?.find((v) => v.names.en === '1 kg')?.price);

/** Exact cents of a money string ("131.25" -> 13125), no floating point. */
const cents = (value: string): number => {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
};

describe('Meat Lovers menu seed file', () => {
  const seed = load();

  it('is valid, bilingual everywhere and complete', () => {
    expect(menuSeedProblems(seed)).toEqual([]);
    expect(menuSeedCounts(seed)).toMatchObject({ categories: 4, products: 36, variants: 144 });
  });

  // The printed flyer (all prices EGP per kilo): the numbers a guest pays must match it exactly.
  it('holds the printed per-kilo price of every product, in printed order', () => {
    expect(perKilo(seed, 'pure-red')).toEqual(['600', '600', '600', '600', '600', '600', '600', '600', '600', '600', '650']);
    expect(perKilo(seed, 'kandouz')).toEqual(['420', '450', '550', '525', '535', '535', '535', '550', '545', '450', '550']);
    expect(perKilo(seed, 'lamb')).toEqual(['600', '600', '600', '600', '600', '475']);
    expect(perKilo(seed, 'ready')).toEqual(['350', '375', '450', '475', '475', '475', '475', '500']);
    expect(category(seed, 'pure-red').products.map((p) => p.names.ar)).toEqual([
      'بفتيك صافي', 'بيكاتا صافية', 'كباب حلة صافي', 'فيليه كندوز كامل', 'روست بيف كامل', 'شاورما صافية',
      'شريحة كولاتا صافية', 'وش فخدة صافي', 'شين صافي', 'مفروم صافي', 'كبدة بقر صافية',
    ]);
  });

  it('models each cut as four weights priced exactly from the per-kilo price', () => {
    for (const c of seed.categories)
      for (const p of c.products) {
        const variants = p.variants ?? [];
        expect(variants.map((v) => v.names.en)).toEqual(['250 g', '500 g', '1 kg', '2 kg']);
        const kilo = cents(variants[2].price);
        // Exact: quarter x 4 = half x 2 = kilo = double / 2, in integer cents.
        expect(cents(variants[0].price) * 4).toBe(kilo);
        expect(cents(variants[1].price) * 2).toBe(kilo);
        expect(cents(variants[3].price)).toBe(kilo * 2);
        for (const v of variants) expect(v.price).toMatch(/^\d+(\.\d{1,2})?$/);
        // The sheet opens on 1 kg, as in the concept.
        expect(variants.filter((v) => v.default).map((v) => v.names.en)).toEqual(['1 kg']);
        // Arabic names state the weight too (the WhatsApp message and the cart show the name).
        expect(variants.map((v) => v.names.ar)).toEqual(['ربع كيلو (250 جم)', 'نص كيلو (500 جم)', 'كيلو (1000 جم)', '2 كيلو (2000 جم)']);
      }
    const mince = category(seed, 'kandouz').products[3];
    expect(mince.variants?.map((v) => v.price)).toEqual(['131.25', '262.5', '525', '1050']);
  });

  it('never invents prices, offers or discounts: every choice is free', () => {
    const text = readFileSync(join(SEED_DIR, 'menu.json'), 'utf8');
    expect(text).not.toMatch(/discount|"featured"/i);
    const shared = Object.values(seed.sharedModifierGroups);
    const groups = [...shared, ...seed.categories.flatMap((c) => c.products.flatMap((p) => p.modifierGroups ?? []))];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.min).toBe(0);
      expect(group.max).toBe(1);
      expect(group.options.every((o) => o.price === '0')).toBe(true);
    }
    // packaging is offered on every product; ready-to-cook items have no cutting choice
    for (const c of seed.categories) expect(c.sharedModifierGroups).toEqual(['packing']);
    expect(category(seed, 'ready').products.every((p) => !p.modifierGroups)).toBe(true);
    expect(category(seed, 'pure-red').products.every((p) => (p.modifierGroups ?? []).length === 1)).toBe(true);
  });

  it('ships every photo it names with its credit, and the contact data of the flyer', () => {
    const files = new Set(readdirSync(join(SEED_DIR, 'images')));
    for (const name of seedPhotoNames(seed)) expect(existsSync(join(SEED_DIR, 'images', name))).toBe(true);
    const credits = JSON.parse(readFileSync(join(SEED_DIR, 'images', 'credits.json'), 'utf8')) as { file: string; license: string }[];
    for (const file of files) if (file !== 'credits.json') expect(credits.some((c) => c.file === file && c.license)).toBe(true);
    expect(seed.restaurant.contact).toEqual({ phone: '+201153755799', whatsapp: '+201122888566' });
    expect(seed.branch.phone).toBe('+201122888566');
    expect(seed.branch.address).toContain('3 عمارات السعودية');
    expect(seed.branch.address).toContain('قبالة دار الدفاع الجوي');
    expect(seed.restaurant.name).toBe('Meat Lovers');
    expect(seed.restaurant.currencyCode).toBe('EGP');
    expect(seed.restaurant.defaultLocale).toBe('ar');
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

describe('seedMenu with the Meat Lovers seed', () => {
  it('stores the logo and photos, contact, branch address, exact variant prices and assigns the design to that Restaurant only', async () => {
    const tx = buildTx();
    const store = assets();
    const result = await seedMenu(asTx(tx), 'restaurant-9', load(), store);
    expect(result).toMatchObject({ outcome: 'seeded', exclusiveDesign: 'assigned' });
    expect(tx.restaurant.update).toHaveBeenCalledWith({
      where: { id: 'restaurant-9' },
      data: expect.objectContaining({ contactPhone: '+201153755799', whatsappNumber: '+201122888566' }) as unknown,
    });
    const products = (tx.product.create.mock.calls as [{ data: { restaurantId: string; basePrice: { toString(): string } } }][]).map((c) => c[0].data);
    expect(products).toHaveLength(36);
    expect(products.every((p) => p.restaurantId === 'restaurant-9')).toBe(true);
    // base price = the cheapest weight (a quarter kilo), exact decimals
    expect(products.map((p) => p.basePrice.toString())).toContain('87.5');
    const prices = (tx.productVariant.create.mock.calls as [{ data: { price: { toString(): string }; isDefault: boolean } }][]).map((c) => c[0].data);
    expect(prices).toHaveLength(144);
    expect(prices.filter((p) => p.isDefault)).toHaveLength(36);
    expect(prices.map((p) => p.price.toString())).toEqual(expect.arrayContaining(['131.25', '1050', '93.75', '136.25']));
    const [[args]] = tx.restaurantExclusiveDesign.upsert.mock.calls as [[{ create: { status: string; rendererKey: string; publishedSettings: Record<string, unknown> } }]];
    expect(args.create).toMatchObject({ status: 'ACTIVE_CUSTOM', rendererKey: 'MEAT_LOVERS_BUTCHER_V1' });
    expect(args.create.publishedSettings).toMatchObject({ brandAr: 'ميت لافرز', brandEn: 'MEAT LOVERS', theme: 'DARK' });
    expect(String(args.create.publishedSettings.heroImageAssetPath)).toMatch(/^\/media\//);
    expect(String(args.create.publishedSettings.storyImageAssetPath)).toMatch(/^\/media\//);
    expect(Object.keys(args.create.publishedSettings.categoryExtras as object)).toHaveLength(4);
    expect(store.stored).toEqual(expect.arrayContaining(['hero.webp', 'story.webp', 'logo.png']));
  });

  it('does not take the design from another Restaurant', async () => {
    const tx = buildTx({ rendererHolder: 'someone-else' });
    const result = await seedMenu(asTx(tx), 'restaurant-9', load(), assets());
    expect(result).toMatchObject({ exclusiveDesign: 'rendererTaken' });
    expect(tx.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
  });
});
