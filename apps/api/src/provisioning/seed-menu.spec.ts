import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '../generated/prisma/client';
import {
  menuSeedCounts,
  menuSeedProblems,
  seedMenu,
  type MenuSeed,
} from './seed-menu';

const SEED_FILE = join(
  __dirname,
  '..',
  '..',
  'seed-data',
  'verde-napoletana',
  'menu.json',
);
const load = (): MenuSeed =>
  JSON.parse(readFileSync(SEED_FILE, 'utf8')) as MenuSeed;

describe('VERDE Napoletana menu seed file', () => {
  const seed = load();

  it('is valid and bilingual everywhere', () => {
    expect(menuSeedProblems(seed)).toEqual([]);
  });

  it('holds the whole printed menu', () => {
    expect(menuSeedCounts(seed)).toMatchObject({
      categories: 21,
      products: 177,
    });
    const pizza = seed.categories.find((c) => c.key === 'pizza');
    expect(pizza?.products).toHaveLength(18);
    const supreme = pizza?.products[0];
    expect(supreme?.names).toEqual({
      ar: 'سوبريم تشكن',
      en: 'Supreme Chicken',
    });
    expect(supreme?.variants?.map((v) => v.price)).toEqual([
      '110',
      '160',
      '195',
    ]);
  });

  it('gives every product with sizes the cheapest size as its default', () => {
    for (const category of seed.categories)
      for (const product of category.products) {
        if (!product.variants) continue;
        const prices = product.variants.map((v) => Number(v.price));
        const def = product.variants.find((v) => v.default);
        expect(Number(def?.price)).toBe(Math.min(...prices));
      }
  });

  it('keeps the add-ons on pizza, pasta and the burgers only', () => {
    const withAddons = seed.categories
      .filter((c) => (c.sharedModifierGroups ?? []).length > 0)
      .map((c) => c.key);
    expect(withAddons).toEqual([
      'pizza',
      'pasta',
      'beef-burger',
      'giants',
      'chicken-burger',
    ]);
  });
});

describe('menuSeedProblems', () => {
  it('reports a missing language, a bad price and two default sizes', () => {
    const seed = load();
    seed.categories[0].products[0].names.en = '';
    seed.categories[2].products[0].price = '12,5';
    seed.categories[0].products[1].variants?.forEach((v) => {
      v.default = true;
    });
    const problems = menuSeedProblems(seed);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('lacks a name in a language'),
        expect.stringContaining('bad price'),
        expect.stringContaining('exactly one default size'),
      ]),
    );
  });

  it('rejects a design that points at an unknown category', () => {
    const seed = load();
    if (seed.restaurant.exclusiveDesign)
      seed.restaurant.exclusiveDesign.chapter2Category = 'nope';
    expect(menuSeedProblems(seed)).toEqual([
      'design points at unknown category nope',
    ]);
  });
});

function buildTx(
  options: { existingMenus?: number; rendererHolder?: string | null } = {},
) {
  const create = () =>
    jest.fn().mockImplementation(() => Promise.resolve({ id: randomUUID() }));
  const tx = {
    menu: {
      count: jest.fn().mockResolvedValue(options.existingMenus ?? 0),
      create: create(),
    },
    restaurant: { update: jest.fn().mockResolvedValue({}) },
    branch: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'branch-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    branchTranslation: { createMany: jest.fn().mockResolvedValue({}) },
    category: { create: create() },
    product: { create: create() },
    productVariant: { create: create() },
    modifierGroup: { create: create() },
    modifierOption: { create: create() },
    restaurantExclusiveDesign: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.rendererHolder
            ? { restaurantId: options.rendererHolder }
            : null,
        ),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  return tx;
}
const asTx = (tx: ReturnType<typeof buildTx>) =>
  tx as unknown as Prisma.TransactionClient;

describe('seedMenu', () => {
  it('leaves a Restaurant that already has a menu untouched', async () => {
    const tx = buildTx({ existingMenus: 1 });
    await expect(seedMenu(asTx(tx), 'restaurant-1', load())).resolves.toEqual({
      outcome: 'alreadySeeded',
    });
    expect(tx.restaurant.update).not.toHaveBeenCalled();
    expect(tx.category.create).not.toHaveBeenCalled();
  });

  it('creates every category, product, size and add-on for the given Restaurant only', async () => {
    const seed = load();
    const tx = buildTx();
    const result = await seedMenu(asTx(tx), 'restaurant-1', seed);
    const counts = menuSeedCounts(seed);
    expect(result).toMatchObject({
      outcome: 'seeded',
      exclusiveDesign: 'assigned',
    });
    expect(tx.category.create).toHaveBeenCalledTimes(counts.categories);
    expect(tx.product.create).toHaveBeenCalledTimes(counts.products);
    expect(tx.productVariant.create).toHaveBeenCalledTimes(counts.variants);
    expect(tx.modifierGroup.create).toHaveBeenCalledTimes(
      counts.modifierGroups,
    );
    for (const call of tx.product.create.mock.calls as [
      { data: { restaurantId: string } },
    ][])
      expect(call[0].data.restaurantId).toBe('restaurant-1');
    expect(tx.branchTranslation.createMany).toHaveBeenCalledWith({
      data: [
        { branchId: 'branch-1', locale: 'ar', name: 'الفرع الرئيسي' },
        { branchId: 'branch-1', locale: 'en', name: 'Main Branch' },
      ],
    });
  });

  it('stores a size-priced product at its cheapest size and a plain one at its price', async () => {
    const tx = buildTx();
    await seedMenu(asTx(tx), 'restaurant-1', load());
    const bases = (
      tx.product.create.mock.calls as [
        { data: { basePrice: { toString(): string } } },
      ][]
    ).map((call) => call[0].data.basePrice.toString());
    expect(bases[0]).toBe('110'); // Supreme Chicken: 110 / 160 / 195
    expect(bases[18]).toBe('105'); // the first pasta
  });

  it('publishes the VERDE design with the pizza and dessert categories', async () => {
    const tx = buildTx();
    await seedMenu(asTx(tx), 'restaurant-1', load());
    const [[args]] = tx.restaurantExclusiveDesign.upsert.mock.calls as [
      [
        {
          create: {
            status: string;
            rendererKey: string;
            publishedSettings: {
              brandWord: string;
              chapter1CategoryId: string | null;
              chapter2CategoryId: string | null;
            };
          };
        },
      ],
    ];
    expect(args.create).toMatchObject({
      status: 'ACTIVE_CUSTOM',
      rendererKey: 'VERDE_NAPOLI_V1',
    });
    expect(args.create.publishedSettings.brandWord).toBe('VERDE');
    // The ids of the Pizza (1st) and Dessert (16th) categories that were just created.
    const created = (
      tx.category.create.mock.results as { value: Promise<{ id: string }> }[]
    ).map((r) => r.value);
    const ids = await Promise.all(created);
    expect(args.create.publishedSettings.chapter1CategoryId).toBe(ids[0].id);
    expect(args.create.publishedSettings.chapter2CategoryId).toBe(ids[15].id);
  });

  it('does not take the VERDE design from another Restaurant', async () => {
    const tx = buildTx({ rendererHolder: 'someone-else' });
    const result = await seedMenu(asTx(tx), 'restaurant-1', load());
    expect(result).toMatchObject({
      outcome: 'seeded',
      exclusiveDesign: 'rendererTaken',
    });
    expect(tx.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
  });
});
