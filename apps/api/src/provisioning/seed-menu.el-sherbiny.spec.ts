import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '../generated/prisma/client';
import {
  menuSeedCounts,
  menuSeedProblems,
  seedMenu,
  type MenuSeed,
  type SeedAssets,
  type SeedCategory,
} from './seed-menu';

const SEED_DIR = join(__dirname, '..', '..', 'seed-data', 'el-sherbiny');
const load = (): MenuSeed =>
  JSON.parse(readFileSync(join(SEED_DIR, 'menu.json'), 'utf8')) as MenuSeed;
const category = (seed: MenuSeed, key: string): SeedCategory => {
  const found = seed.categories.find((c) => c.key === key);
  if (!found) throw new Error(`no category ${key}`);
  return found;
};
const sizes = (seed: MenuSeed, key: string) =>
  category(seed, key).products.map((p) =>
    (p.variants ?? []).map((v) => `${v.names.en.replace(/.*\((.)\)/, '$1')}${v.price}`).join(' '),
  );
const prices = (seed: MenuSeed, key: string) =>
  category(seed, key).products.map((p) => p.price);

describe('El Sherbiny menu seed file', () => {
  const seed = load();

  it('is valid, bilingual everywhere and complete', () => {
    expect(menuSeedProblems(seed)).toEqual([]);
    expect(menuSeedCounts(seed)).toMatchObject({ categories: 8, products: 64 });
  });

  // The printed menu (photographed flyer): the numbers a guest pays must match it exactly.
  it('holds the printed prices of every section', () => {
    expect(sizes(seed, 'pizza')).toEqual([
      'M105 L165', 'M145 L210', 'M130 L190', 'M145 L210', 'M130 L190', 'M145 L210', 'M170 L255',
      'M160 L240', 'M145 L210', 'M170 L255', 'M145 L210', 'M160 L240', 'M170 L255',
    ]);
    // roll / medium / large printed as L-M-roll; tuna has no roll
    expect(
      category(seed, 'sharqi').products.map((p) =>
        (p.variants ?? []).map((v) => v.price).join('/'),
      ),
    ).toEqual([
      '110/145/216', '95/130/190', '110/145/210', '130/170/255', '110/145/210', '130/170/255',
      '120/160/240', '110/145/210', '145/210', '130/170/255',
    ]);
    expect(prices(seed, 'savory-crepe')).toEqual(['70', '90', '120', '110', '125', '125', '95', '140', '150', '150', '150']);
    expect(prices(seed, 'sweet-crepe')).toEqual(['90', '90', '110', '150']);
    expect(prices(seed, 'syrian')).toEqual(['30', '50', '90', '90', '50']);
    expect(prices(seed, 'pasta')).toEqual(['140', '130', '130', '150', '140']);
    expect(prices(seed, 'sweet-fiteer')).toEqual(['80', '80', '120', '120', '150', '120', '120', '150', '150', '150', '210', '270']);
    expect(prices(seed, 'extras')).toEqual(['60', '50', '20', '30']);
    expect(seed.sharedModifierGroups.savoryExtras.options.map((o) => o.price)).toEqual(['60', '50', '20', '30']);
  });

  it('turns every printed "A or B" into a required single choice at no extra price, not part of the name', () => {
    const grouped = seed.categories.flatMap((c) =>
      c.products.filter((p) => (p.modifierGroups ?? []).length > 0),
    );
    expect(grouped).toHaveLength(14);
    for (const product of grouped) {
      const [choice] = product.modifierGroups ?? [];
      expect(choice.min).toBe(1);
      expect(choice.max).toBe(1);
      expect(choice.options.map((o) => o.price)).toEqual(choice.options.map(() => '0'));
    }
    for (const c of seed.categories)
      for (const p of c.products) {
        expect(p.names.ar).not.toMatch(/\(| أو /);
        expect(p.names.en).not.toMatch(/\(.* or /i);
      }
  });

  it('gives every sized product the cheapest size as its default and tuna no roll', () => {
    for (const c of seed.categories)
      for (const p of c.products) {
        if (!p.variants) continue;
        const min = Math.min(...p.variants.map((v) => Number(v.price)));
        expect(Number(p.variants.find((v) => v.default)?.price)).toBe(min);
      }
    const tuna = category(seed, 'sharqi').products[8];
    expect(tuna.variants?.map((v) => v.names.en)).toEqual(['Medium (M)', 'Large (L)']);
  });

  it('offers the extras on savory dishes only and keeps the choice before the extras', () => {
    expect(
      seed.categories.filter((c) => (c.sharedModifierGroups ?? []).length > 0).map((c) => c.key),
    ).toEqual(['pizza', 'sharqi', 'savory-crepe', 'syrian', 'pasta']);
  });

  it('ships every photo it names, with a recorded licence and author, and the contact data of the printed menu', () => {
    const named = new Set<string>(
      [seed.restaurant.logo as string].concat(
        seed.categories.flatMap((c) => [c.image, ...c.products.map((p) => p.image)].filter((x): x is string => !!x)),
      ),
    );
    const design = seed.restaurant.exclusiveDesign;
    if (design?.rendererKey === 'SHERBINY_FIRE_DOUGH_V1')
      for (const image of Object.values(design.images ?? {})) if (image) named.add(image);
    const credits = JSON.parse(readFileSync(join(SEED_DIR, 'images', 'credits.json'), 'utf8')) as {
      file: string; author: string; license: string; source: string;
    }[];
    for (const name of named) {
      expect(existsSync(join(SEED_DIR, 'images', name))).toBe(true);
      if (name !== 'logo.png') {
        const entry = credits.find((c) => c.file === name);
        expect(entry?.author).toBeTruthy();
        expect(entry?.license).toMatch(/^(CC0|Public domain|CC BY(-SA)? \d\.\d)$/);
        expect(entry?.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      }
    }
    expect(seed.branch.address).toBe('أسوان، بجوار مبنى المحافظة');
    expect(seed.restaurant.contact).toEqual({ phone: '+201278568755', whatsapp: '+201278568755' });
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
    branchTranslation: { createMany: jest.fn().mockResolvedValue({}) },
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

describe('seedMenu with the El Sherbiny seed', () => {
  it('stores photos, contact, branch address, featured dishes and assigns the design to that Restaurant only', async () => {
    const tx = buildTx();
    const store = assets();
    const result = await seedMenu(asTx(tx), 'restaurant-9', load(), store);
    expect(result).toMatchObject({ outcome: 'seeded', exclusiveDesign: 'assigned' });
    expect(tx.restaurant.update).toHaveBeenCalledWith({
      where: { id: 'restaurant-9' },
      data: expect.objectContaining({ contactPhone: '+201278568755', whatsappNumber: '+201278568755' }) as unknown,
    });
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-1' },
      data: { name: 'فرع أسوان', address: 'أسوان، بجوار مبنى المحافظة', phone: '+201278568755' },
    });
    const products = (tx.product.create.mock.calls as [{ data: { restaurantId: string; featured: boolean } }][]).map((c) => c[0].data);
    expect(products.every((p) => p.restaurantId === 'restaurant-9')).toBe(true);
    expect(products.filter((p) => p.featured)).toHaveLength(3);
    const [[args]] = tx.restaurantExclusiveDesign.upsert.mock.calls as [[{ create: { status: string; rendererKey: string; publishedSettings: Record<string, unknown> } }]];
    expect(args.create).toMatchObject({ status: 'ACTIVE_CUSTOM', rendererKey: 'SHERBINY_FIRE_DOUGH_V1' });
    expect(args.create.publishedSettings).toMatchObject({ brandAr: 'الشربيني', brandEn: 'EL SHERBINY', favoriteTag1En: 'THE CLASSIC' });
    expect(String(args.create.publishedSettings.heroImageAssetPath)).toMatch(/^\/media\//);
    expect(Object.keys(args.create.publishedSettings.categoryExtras as object)).toHaveLength(8);
    expect(store.stored).toContain('hero-pizza.webp');
    if (result.outcome === 'seeded') expect(result.photos).toBe(store.stored.length);
  });

  it('refuses photos without a store and never takes the design from another Restaurant', async () => {
    await expect(seedMenu(asTx(buildTx()), 'restaurant-9', load())).rejects.toThrow(/no photo store/);
    const tx = buildTx({ rendererHolder: 'someone-else' });
    const result = await seedMenu(asTx(tx), 'restaurant-9', load(), assets());
    expect(result).toMatchObject({ exclusiveDesign: 'rendererTaken' });
    expect(tx.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unsafe photo name, an unknown copy field and a bad phone', () => {
    const seed = load();
    seed.restaurant.logo = '../../etc/passwd';
    seed.restaurant.contact = { phone: 'abc' };
    if (seed.restaurant.exclusiveDesign?.rendererKey === 'SHERBINY_FIRE_DOUGH_V1')
      Object.assign(seed.restaurant.exclusiveDesign.copy ?? {}, { notAField: 'x' });
    expect(menuSeedProblems(seed)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bad image file name'),
        expect.stringContaining('not a valid phone number'),
        expect.stringContaining('does not exist'),
      ]),
    );
  });
});
