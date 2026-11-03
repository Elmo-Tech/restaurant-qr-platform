import { Prisma } from '../generated/prisma/client';
import { createProductPublicId } from '../menu/product-public-id';
import { normalizeVerdeSettings } from '../restaurants/verde-menu-config';

/**
 * Operations-only seeding of ONE Restaurant's bilingual menu from a reviewed JSON file
 * (`apps/api/seed-data/<name>/menu.json`), for onboarding a real restaurant whose printed
 * menu has already been typed in. It is plain data shipped with the API: Menu, Categories,
 * Products (sizes as Product Variants, add-ons as Modifier Groups), the Branch's names and,
 * optionally, the Restaurant's exclusive VERDE design.
 *
 * It only ever fills a Restaurant that has NO menu yet, so a re-run changes nothing.
 */

export type Localized = { ar: string; en: string };

export interface SeedOption {
  names: Localized;
  price: string;
}
export interface SeedModifierGroup {
  names: Localized;
  helper: Localized;
  min: number;
  max: number;
  options: SeedOption[];
}
export interface SeedVariant {
  names: Localized;
  price: string;
  default: boolean;
}
export interface SeedProduct {
  names: Localized;
  descriptions?: Localized;
  /** The price of a product without sizes; with sizes the cheapest size is the base price. */
  price?: string;
  variants?: SeedVariant[];
  modifierGroups?: SeedModifierGroup[];
}
export interface SeedCategory {
  key: string;
  names: Localized;
  descriptions?: Localized;
  /** Keys of `sharedModifierGroups`: every product of the category gets its own copy. */
  sharedModifierGroups?: string[];
  products: SeedProduct[];
}
export interface MenuSeed {
  version: 1;
  restaurant: {
    name: string;
    defaultLocale: 'ar' | 'en';
    currencyCode: string;
    countryCode: string;
    timezone: string;
    exclusiveDesign?: {
      rendererKey: 'VERDE_NAPOLI_V1';
      brandWord: string;
      /** Category keys the two "discover" cards of the design open. */
      chapter1Category: string;
      chapter2Category: string;
    };
  };
  branch: { names: Localized };
  menu: { nameInternal: string; names: Localized };
  sharedModifierGroups: Record<string, SeedModifierGroup>;
  categories: SeedCategory[];
}

const MONEY = /^\d+(\.\d{1,2})?$/;
const LOCALES = ['ar', 'en'] as const;

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;
const localized = (value: Localized | undefined): boolean =>
  !!value && hasText(value.ar) && hasText(value.en);

/** Every reason the seed file cannot be used; an empty list means it is safe to apply. */
export function menuSeedProblems(seed: MenuSeed): string[] {
  const problems: string[] = [];
  if (seed.version !== 1) problems.push('unknown seed version');
  if (!hasText(seed.restaurant?.name)) problems.push('restaurant has no name');
  if (!localized(seed.branch?.names)) problems.push('branch lacks a name');
  if (!localized(seed.menu?.names)) problems.push('menu lacks a name');
  if (!Array.isArray(seed.categories) || seed.categories.length === 0)
    problems.push('no category');

  const checkGroup = (where: string, group: SeedModifierGroup) => {
    if (!localized(group.names)) problems.push(`${where} lacks a name`);
    if (!localized(group.helper)) problems.push(`${where} lacks helper text`);
    if (group.options.length === 0) problems.push(`${where} has no option`);
    if (group.min < 0 || group.max < Math.max(group.min, 1))
      problems.push(`${where} has bad selection limits`);
    if (group.min > group.options.length || group.max > group.options.length)
      problems.push(`${where} asks for more options than it has`);
    for (const option of group.options) {
      if (!localized(option.names))
        problems.push(`${where} has an unnamed option`);
      if (!MONEY.test(option.price))
        problems.push(`${where} has a bad option price ${option.price}`);
    }
  };
  for (const [key, group] of Object.entries(seed.sharedModifierGroups ?? {}))
    checkGroup(`shared group ${key}`, group);

  const categoryKeys = new Set<string>();
  for (const category of seed.categories ?? []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(category.key))
      problems.push(`bad category key ${category.key}`);
    if (categoryKeys.has(category.key))
      problems.push(`duplicate category key ${category.key}`);
    categoryKeys.add(category.key);
    if (!localized(category.names))
      problems.push(`category ${category.key} lacks a name in a language`);
    if (category.descriptions && !localized(category.descriptions))
      problems.push(
        `category ${category.key} lacks a description in a language`,
      );
    if (category.products.length === 0)
      problems.push(`category ${category.key} has no product`);
    for (const shared of category.sharedModifierGroups ?? [])
      if (!(shared in (seed.sharedModifierGroups ?? {})))
        problems.push(`category ${category.key} uses unknown group ${shared}`);

    for (const product of category.products) {
      const label = `${category.key}/${product.names?.en ?? '?'}`;
      if (!localized(product.names))
        problems.push(`product ${label} lacks a name in a language`);
      if (product.descriptions && !localized(product.descriptions))
        problems.push(`product ${label} lacks a description in a language`);
      if (product.variants?.length) {
        if (product.variants.filter((v) => v.default).length !== 1)
          problems.push(`product ${label} needs exactly one default size`);
        for (const variant of product.variants) {
          if (!localized(variant.names))
            problems.push(`product ${label} has an unnamed size`);
          if (!MONEY.test(variant.price))
            problems.push(
              `product ${label} has a bad size price ${variant.price}`,
            );
        }
      } else if (!product.price || !MONEY.test(product.price)) {
        problems.push(`product ${label} has a bad price`);
      }
      for (const group of product.modifierGroups ?? [])
        checkGroup(`product ${label} group`, group);
    }
  }

  const design = seed.restaurant?.exclusiveDesign;
  if (design) {
    if (design.rendererKey !== 'VERDE_NAPOLI_V1')
      problems.push('unknown exclusive design');
    if (!hasText(design.brandWord) || design.brandWord.length > 24)
      problems.push('design brand word must be 1-24 characters');
    for (const key of [design.chapter1Category, design.chapter2Category])
      if (!categoryKeys.has(key))
        problems.push(`design points at unknown category ${key}`);
  }
  return problems;
}

export function assertValidMenuSeed(seed: MenuSeed): void {
  const problems = menuSeedProblems(seed);
  if (problems.length > 0)
    throw new Error(`Invalid menu seed: ${problems.join('; ')}`);
}

/** What a seed holds, for the dry-run report. */
export function menuSeedCounts(seed: MenuSeed) {
  let products = 0;
  let variants = 0;
  let modifierGroups = 0;
  for (const category of seed.categories) {
    products += category.products.length;
    for (const product of category.products) {
      variants += product.variants?.length ?? 0;
      modifierGroups +=
        (product.modifierGroups?.length ?? 0) +
        (category.sharedModifierGroups?.length ?? 0);
    }
  }
  return {
    categories: seed.categories.length,
    products,
    variants,
    modifierGroups,
  };
}

export type MenuSeedResult =
  | {
      outcome: 'seeded';
      counts: ReturnType<typeof menuSeedCounts>;
      exclusiveDesign: 'assigned' | 'rendererTaken' | 'none';
    }
  | { outcome: 'alreadySeeded' };

/**
 * Fills the Restaurant's menu inside the caller's transaction. A Restaurant that already has a Menu is left alone.
 * The exclusive design is skipped (and reported) when another Restaurant already holds that renderer, because a
 * renderer belongs to exactly one Restaurant.
 */
export async function seedMenu(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  seed: MenuSeed,
): Promise<MenuSeedResult> {
  assertValidMenuSeed(seed);
  if ((await tx.menu.count({ where: { restaurantId } })) > 0)
    return { outcome: 'alreadySeeded' };

  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { countryCode: seed.restaurant.countryCode },
  });

  // The Branch provisioning created gets its Arabic and English names.
  const branch = await tx.branch.findFirstOrThrow({
    where: { restaurantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  await tx.branch.update({
    where: { id: branch.id },
    data: { name: seed.branch.names.ar },
  });
  await tx.branchTranslation.createMany({
    data: LOCALES.map((locale) => ({
      branchId: branch.id,
      locale,
      name: seed.branch.names[locale],
    })),
  });

  const menu = await tx.menu.create({
    data: {
      restaurantId,
      nameInternal: seed.menu.nameInternal,
      status: 'ACTIVE',
      displayOrder: 0,
      isPrimary: true,
      translations: {
        create: LOCALES.map((locale) => ({
          locale,
          name: seed.menu.names[locale],
        })),
      },
    },
    select: { id: true },
  });

  const categoryIds = new Map<string, string>();
  for (const [categoryOrder, category] of seed.categories.entries()) {
    const createdCategory = await tx.category.create({
      data: {
        restaurantId,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: categoryOrder,
        translations: {
          create: LOCALES.map((locale) => ({
            locale,
            name: category.names[locale],
            description: category.descriptions?.[locale] ?? null,
          })),
        },
      },
      select: { id: true },
    });
    categoryIds.set(category.key, createdCategory.id);

    const sharedGroups = (category.sharedModifierGroups ?? []).map(
      (key) => seed.sharedModifierGroups[key],
    );
    for (const [productOrder, p] of category.products.entries()) {
      const basePrice = p.variants?.length
        ? Prisma.Decimal.min(
            ...p.variants.map((v) => new Prisma.Decimal(v.price)),
          )
        : new Prisma.Decimal(p.price as string);
      const product = await tx.product.create({
        data: {
          publicId: createProductPublicId(),
          restaurantId,
          categoryId: createdCategory.id,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder: productOrder,
          allowCustomerNotes: true,
          featured: false,
          translations: {
            create: LOCALES.map((locale) => ({
              locale,
              name: p.names[locale],
              description: p.descriptions?.[locale] ?? null,
            })),
          },
        },
        select: { id: true },
      });
      for (const [variantOrder, v] of (p.variants ?? []).entries()) {
        await tx.productVariant.create({
          data: {
            restaurantId,
            productId: product.id,
            status: 'ACTIVE',
            price: new Prisma.Decimal(v.price),
            displayOrder: variantOrder,
            isDefault: v.default,
            translations: {
              create: LOCALES.map((locale) => ({
                locale,
                name: v.names[locale],
              })),
            },
          },
        });
      }
      for (const [groupOrder, g] of [
        ...sharedGroups,
        ...(p.modifierGroups ?? []),
      ].entries()) {
        const group = await tx.modifierGroup.create({
          data: {
            restaurantId,
            productId: product.id,
            status: 'ACTIVE',
            minimumSelections: g.min,
            maximumSelections: g.max,
            displayOrder: groupOrder,
            translations: {
              create: LOCALES.map((locale) => ({
                locale,
                name: g.names[locale],
                helperText: g.helper[locale],
              })),
            },
          },
          select: { id: true },
        });
        for (const [optionOrder, o] of g.options.entries()) {
          await tx.modifierOption.create({
            data: {
              restaurantId,
              modifierGroupId: group.id,
              status: 'ACTIVE',
              priceAdjustment: new Prisma.Decimal(o.price),
              displayOrder: optionOrder,
              priceIsOverridden: false,
              translations: {
                create: LOCALES.map((locale) => ({
                  locale,
                  name: o.names[locale],
                })),
              },
            },
          });
        }
      }
    }
  }

  return {
    outcome: 'seeded',
    counts: menuSeedCounts(seed),
    exclusiveDesign: await assignExclusiveDesign(
      tx,
      restaurantId,
      seed,
      categoryIds,
    ),
  };
}

async function assignExclusiveDesign(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  seed: MenuSeed,
  categoryIds: Map<string, string>,
): Promise<'assigned' | 'rendererTaken' | 'none'> {
  const design = seed.restaurant.exclusiveDesign;
  if (!design) return 'none';
  const holder = await tx.restaurantExclusiveDesign.findUnique({
    where: { rendererKey: design.rendererKey },
    select: { restaurantId: true },
  });
  if (holder && holder.restaurantId !== restaurantId) return 'rendererTaken';

  // The same normalizer the dashboard uses, so the settings are exactly what an editor save would store.
  const settings = JSON.parse(
    JSON.stringify(
      normalizeVerdeSettings({
        brandWord: design.brandWord,
        chapter1CategoryId: categoryIds.get(design.chapter1Category),
        chapter2CategoryId: categoryIds.get(design.chapter2Category),
      }),
    ),
  ) as Prisma.InputJsonValue;
  await tx.restaurantExclusiveDesign.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      baseTemplate: 'CLASSIC',
      status: 'ACTIVE_CUSTOM',
      rendererKey: design.rendererKey,
      draftSettings: settings,
      publishedSettings: settings,
      useExclusive: true,
    },
    update: {
      status: 'ACTIVE_CUSTOM',
      rendererKey: design.rendererKey,
      draftSettings: settings,
      publishedSettings: settings,
      useExclusive: true,
    },
  });
  return 'assigned';
}
