import { Prisma } from '../generated/prisma/client';
import { createProductPublicId } from '../menu/product-public-id';
import { offerSeedProblems, seedOffers, type SeedOffer } from './seed-offers';
import { normalizeVerdeSettings } from '../restaurants/verde-menu-config';
import { normalizePhone } from '../restaurants/restaurant-contact';
import {
  SHERBINY_COPY_LIMITS,
  SHERBINY_IMAGE_FIELD,
  SHERBINY_IMAGE_SLOTS,
  SHERBINY_BRAND_MAX,
  normalizeSherbinySettings,
  type SherbinyCopyField,
  type SherbinyImageSlot,
} from '../restaurants/sherbiny-menu-config';
import {
  MAKKBOZ_BRAND_MAX,
  MAKKBOZ_COPY_LIMITS,
  MAKKBOZ_IMAGE_FIELD,
  MAKKBOZ_IMAGE_SLOTS,
  normalizeMakkbozSettings,
  type MakkbozCopyField,
  type MakkbozImageSlot,
} from '../restaurants/makkboz-menu-config';
import {
  MEAT_LOVERS_BRAND_MAX,
  MEAT_LOVERS_COPY_LIMITS,
  MEAT_LOVERS_IMAGE_FIELD,
  MEAT_LOVERS_IMAGE_SLOTS,
  normalizeMeatLoversSettings,
  type MeatLoversCopyField,
  type MeatLoversImageSlot,
} from '../restaurants/meat-lovers-menu-config';

/**
 * Operations-only seeding of ONE Restaurant's bilingual menu from a reviewed JSON file
 * (`apps/api/seed-data/<name>/menu.json`), for onboarding a real restaurant whose printed
 * menu has already been typed in. It is plain data shipped with the API: Menu, Categories,
 * Products (sizes as Product Variants, add-ons and required choices as Modifier Groups), the Branch's
 * names, address and phone, the Restaurant's contact numbers and logo, product / category photos and,
 * optionally, the Restaurant's exclusive design (VERDE or El Sherbiny).
 *
 * It only ever fills a Restaurant that has NO menu yet, so a re-run changes nothing -- unless the caller asks to
 * REPLACE the menu, which never deletes anything: the old Menus are switched off (inactive, not primary) and a
 * new primary Menu is created, so Orders and history keep pointing at what they always pointed at.
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
/** A photo shipped with the seed: a plain file name inside `apps/api/seed-data/<name>/images/`. */
export type SeedImage = string;
const SEED_IMAGE = /^[a-z0-9][a-z0-9._-]*.(?:jpe?g|png|webp)$/i;

/** Stores one seed photo and returns its public `/media/...` path (the CLI validates and writes the file). */
export interface SeedAssets {
  store(image: SeedImage): Promise<string>;
}

export interface SeedProduct {
  names: Localized;
  descriptions?: Localized;
  /** Shown as a favorite in designs that have a favorites section. */
  featured?: boolean;
  image?: SeedImage;
  /** The price of a product without sizes; with sizes the cheapest size is the base price. */
  price?: string;
  variants?: SeedVariant[];
  modifierGroups?: SeedModifierGroup[];
}
export interface SeedCategory {
  key: string;
  names: Localized;
  descriptions?: Localized;
  image?: SeedImage;
  /** Keys of `sharedModifierGroups`: every product of the category gets its own copy, after the product's own groups. */
  sharedModifierGroups?: string[];
  products: SeedProduct[];
}
export interface VerdeSeedDesign {
  rendererKey: 'VERDE_NAPOLI_V1';
  brandWord: string;
  /** Category keys the two "discover" cards of the design open. */
  chapter1Category: string;
  chapter2Category: string;
}
export interface SherbinySeedDesign {
  rendererKey: 'SHERBINY_FIRE_DOUGH_V1';
  brandAr: string;
  brandEn: string;
  /** Overrides of any `<key>Ar` / `<key>En` copy field; everything else keeps the design's defaults. */
  copy?: Partial<Record<SherbinyCopyField, string>>;
  /** Design photo slots (hero, heroPlate, favorite1..3, story). */
  images?: Partial<Record<SherbinyImageSlot, SeedImage>>;
  /** The small label above each category (category key -> label), e.g. "THE PIZZA CHAPTER". */
  categoryTags?: Record<string, Localized>;
}

export interface MakkbozSeedDesign {
  rendererKey: 'MAKKBOZ_HERITAGE_V1';
  /** Brand text shown when the Restaurant has no logo (both languages; empty = the Restaurant name). */
  brandAr: string;
  brandEn: string;
  copy?: Partial<Record<MakkbozCopyField, string>>;
  /** Design photo slots (hero, heroSmall). */
  images?: Partial<Record<MakkbozImageSlot, SeedImage>>;
  /** Per category key: the small chapter label and the one-line intro, in both languages. */
  categoryChapters?: Record<string, { tag: Localized; intro: Localized }>;
}

export interface MeatLoversSeedDesign {
  rendererKey: 'MEAT_LOVERS_BUTCHER_V1';
  /** Brand text shown when the Restaurant has no logo (both languages; empty = the Restaurant name). */
  brandAr: string;
  brandEn: string;
  copy?: Partial<Record<MeatLoversCopyField, string>>;
  /** Design photo slots (hero, story). */
  images?: Partial<Record<MeatLoversImageSlot, SeedImage>>;
  /** Per category key: the small section label and the one-line intro, in both languages. */
  categoryChapters?: Record<string, { tag: Localized; intro: Localized }>;
}

/** A short banner at the top of the Guest Menu (DEC-042). Only added when the Restaurant has no announcement yet. */
export interface SeedAnnouncement {
  texts: Localized;
  style?: 'INFO' | 'PROMO' | 'WARNING';
}
/** A delivery area of the first Branch. Only added when that Branch has no delivery zone yet. */
export interface SeedDeliveryZone {
  names: Localized;
  fee: string;
  minimumOrder: string;
}

export interface MenuSeed {
  version: 1;
  restaurant: {
    name: string;
    defaultLocale: 'ar' | 'en';
    currencyCode: string;
    countryCode: string;
    timezone: string;
    logo?: SeedImage;
    /** Restaurant-wide contact numbers shown to guests (international format). */
    contact?: { phone?: string; whatsapp?: string };
    exclusiveDesign?: VerdeSeedDesign | SherbinySeedDesign | MakkbozSeedDesign | MeatLoversSeedDesign;
  };
  branch: { names: Localized; address?: string; phone?: string };
  menu: { nameInternal: string; names: Localized };
  sharedModifierGroups: Record<string, SeedModifierGroup>;
  categories: SeedCategory[];
  announcements?: SeedAnnouncement[];
  deliveryZones?: SeedDeliveryZone[];
  /** Offers / Bundles (DEC-069). Created switched off unless an entry says `active: true`; see `seed-offers.ts`. */
  offers?: SeedOffer[];
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
  problems.push(...offerSeedProblems(seed.offers));

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

  const checkImage = (where: string, image: unknown) => {
    if (image !== undefined && !(typeof image === 'string' && SEED_IMAGE.test(image)))
      problems.push(`${where} has a bad image file name`);
  };
  checkImage('restaurant logo', seed.restaurant?.logo);
  for (const category of seed.categories ?? []) {
    checkImage(`category ${category.key}`, category.image);
    for (const product of category.products)
      checkImage(`product ${category.key}/${product.names?.en ?? '?'}`, product.image);
  }
  for (const [field, value] of Object.entries(seed.restaurant?.contact ?? {})) {
    try {
      if (value) normalizePhone(field === 'whatsapp' ? 'whatsapp' : 'phone', value);
    } catch {
      problems.push(`contact ${field} is not a valid phone number`);
    }
  }

  if ((seed.announcements ?? []).length > 3)
    problems.push('at most 3 announcements');
  for (const announcement of seed.announcements ?? []) {
    if (!localized(announcement.texts) || announcement.texts.ar.length > 200 || announcement.texts.en.length > 200)
      problems.push('an announcement needs Arabic and English text of at most 200 characters');
    if (announcement.style !== undefined && !['INFO', 'PROMO', 'WARNING'].includes(announcement.style))
      problems.push('an announcement has an unknown style');
  }
  for (const zone of seed.deliveryZones ?? []) {
    if (!localized(zone.names)) problems.push('a delivery zone lacks a name');
    if (!MONEY.test(zone.fee ?? '') || !MONEY.test(zone.minimumOrder ?? ''))
      problems.push('a delivery zone has a bad fee or minimum order');
  }

  const design = seed.restaurant?.exclusiveDesign;
  if (design?.rendererKey === 'VERDE_NAPOLI_V1') {
    if (!hasText(design.brandWord) || design.brandWord.length > 24)
      problems.push('design brand word must be 1-24 characters');
    for (const key of [design.chapter1Category, design.chapter2Category])
      if (!categoryKeys.has(key))
        problems.push(`design points at unknown category ${key}`);
  } else if (design?.rendererKey === 'SHERBINY_FIRE_DOUGH_V1') {
    for (const brand of [design.brandAr, design.brandEn])
      if (!hasText(brand) || brand.length > SHERBINY_BRAND_MAX)
        problems.push(`design brand names must be 1-${SHERBINY_BRAND_MAX} characters`);
    for (const [field, value] of Object.entries(design.copy ?? {})) {
      const max = (SHERBINY_COPY_LIMITS as Record<string, number>)[field];
      if (max === undefined) problems.push(`design copy field ${field} does not exist`);
      else if (typeof value !== 'string' || value.length > max)
        problems.push(`design copy field ${field} is longer than ${max} characters`);
    }
    for (const [slot, image] of Object.entries(design.images ?? {})) {
      if (!(SHERBINY_IMAGE_SLOTS as readonly string[]).includes(slot))
        problems.push(`design photo slot ${slot} does not exist`);
      checkImage(`design photo ${slot}`, image);
    }
    for (const [key, tag] of Object.entries(design.categoryTags ?? {})) {
      if (!categoryKeys.has(key)) problems.push(`design tag points at unknown category ${key}`);
      if (!localized(tag)) problems.push(`design tag of ${key} lacks a language`);
    }
  } else if (design?.rendererKey === 'MAKKBOZ_HERITAGE_V1') {
    for (const brand of [design.brandAr, design.brandEn])
      if (!hasText(brand) || brand.length > MAKKBOZ_BRAND_MAX)
        problems.push(`design brand names must be 1-${MAKKBOZ_BRAND_MAX} characters`);
    for (const [field, value] of Object.entries(design.copy ?? {})) {
      const max = (MAKKBOZ_COPY_LIMITS as Record<string, number>)[field];
      if (max === undefined) problems.push(`design copy field ${field} does not exist`);
      else if (typeof value !== 'string' || value.length > max)
        problems.push(`design copy field ${field} is longer than ${max} characters`);
    }
    for (const [slot, image] of Object.entries(design.images ?? {})) {
      if (!(MAKKBOZ_IMAGE_SLOTS as readonly string[]).includes(slot))
        problems.push(`design photo slot ${slot} does not exist`);
      checkImage(`design photo ${slot}`, image);
    }
    for (const [key, chapter] of Object.entries(design.categoryChapters ?? {})) {
      if (!categoryKeys.has(key)) problems.push(`design chapter points at unknown category ${key}`);
      if (!localized(chapter.tag) || !localized(chapter.intro))
        problems.push(`design chapter of ${key} lacks a language`);
    }
  } else if (design?.rendererKey === 'MEAT_LOVERS_BUTCHER_V1') {
    for (const brand of [design.brandAr, design.brandEn])
      if (!hasText(brand) || brand.length > MEAT_LOVERS_BRAND_MAX)
        problems.push(`design brand names must be 1-${MEAT_LOVERS_BRAND_MAX} characters`);
    for (const [field, value] of Object.entries(design.copy ?? {})) {
      const max = (MEAT_LOVERS_COPY_LIMITS as Record<string, number>)[field];
      if (max === undefined) problems.push(`design copy field ${field} does not exist`);
      else if (typeof value !== 'string' || value.length > max)
        problems.push(`design copy field ${field} is longer than ${max} characters`);
    }
    for (const [slot, image] of Object.entries(design.images ?? {})) {
      if (!(MEAT_LOVERS_IMAGE_SLOTS as readonly string[]).includes(slot))
        problems.push(`design photo slot ${slot} does not exist`);
      checkImage(`design photo ${slot}`, image);
    }
    for (const [key, chapter] of Object.entries(design.categoryChapters ?? {})) {
      if (!categoryKeys.has(key)) problems.push(`design chapter points at unknown category ${key}`);
      if (!localized(chapter.tag) || !localized(chapter.intro))
        problems.push(`design chapter of ${key} lacks a language`);
    }
  } else if (design) {
    problems.push('unknown exclusive design');
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
      photos: number;
      exclusiveDesign: 'assigned' | 'rendererTaken' | 'none';
      /** Menus switched off because the caller asked to replace the menu. */
      archivedMenus: number;
      announcements: number;
      deliveryZones: number;
      /** Offers created from the seed (DEC-069); the names of ones left alone are not counted. */
      offers: number;
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
  assets?: SeedAssets,
  options: { replaceMenu?: boolean } = {},
): Promise<MenuSeedResult> {
  assertValidMenuSeed(seed);
  let archivedMenus = 0;
  if ((await tx.menu.count({ where: { restaurantId } })) > 0) {
    if (!options.replaceMenu) return { outcome: 'alreadySeeded' };
    // Never deleted: Orders, Carts and history keep pointing at the old Menu. It simply stops being shown.
    archivedMenus = (
      await tx.menu.updateMany({
        where: { restaurantId },
        data: { status: 'INACTIVE', isPrimary: false },
      })
    ).count;
  }

  let photos = 0;
  const photo = async (image: SeedImage | undefined): Promise<string | null> => {
    if (!image) return null;
    if (!assets) throw new Error('The seed has photos but no photo store was provided.');
    photos += 1;
    return assets.store(image);
  };

  const contact = seed.restaurant.contact;
  await tx.restaurant.update({
    where: { id: restaurantId },
    data: {
      countryCode: seed.restaurant.countryCode,
      ...(contact?.phone ? { contactPhone: normalizePhone('phone', contact.phone) } : {}),
      ...(contact?.whatsapp ? { whatsappNumber: normalizePhone('whatsapp', contact.whatsapp) } : {}),
      ...(seed.restaurant.logo ? { logoAssetPath: await photo(seed.restaurant.logo) } : {}),
    },
  });

  // The Branch provisioning created gets its Arabic and English names.
  const branch = await tx.branch.findFirstOrThrow({
    where: { restaurantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  await tx.branch.update({
    where: { id: branch.id },
    data: {
      name: seed.branch.names.ar,
      ...(seed.branch.address ? { address: seed.branch.address } : {}),
      ...(seed.branch.phone ? { phone: seed.branch.phone } : {}),
    },
  });
  await tx.branchTranslation.deleteMany({ where: { branchId: branch.id } });
  await tx.branchTranslation.createMany({
    data: LOCALES.map((locale) => ({
      branchId: branch.id,
      locale,
      name: seed.branch.names[locale],
    })),
  });

  // The two V1 languages must be active, or the translations written below would never be shown.
  for (const locale of LOCALES) {
    await tx.restaurantLocale.upsert({
      where: { restaurantId_locale: { restaurantId, locale } },
      create: { restaurantId, locale, isActive: true },
      update: { isActive: true },
    });
  }

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
        imageAssetPath: await photo(category.image),
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
          featured: p.featured === true,
          primaryImageAssetPath: await photo(p.image),
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
      // The product's own choices come first (a required size / flavor), then the category-wide add-ons.
      for (const [groupOrder, g] of [
        ...(p.modifierGroups ?? []),
        ...sharedGroups,
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

  // Banners and delivery areas are extras: added only where the Restaurant has none, never duplicated on a re-run.
  let announcements = 0;
  if (
    (seed.announcements ?? []).length > 0 &&
    (await tx.restaurantAnnouncement.count({ where: { restaurantId } })) === 0
  ) {
    for (const announcement of seed.announcements ?? []) {
      await tx.restaurantAnnouncement.create({
        data: {
          restaurantId,
          status: 'ACTIVE',
          style: announcement.style ?? 'INFO',
          translations: {
            create: LOCALES.map((locale) => ({ locale, text: announcement.texts[locale] })),
          },
        },
      });
      announcements += 1;
    }
  }
  let deliveryZones = 0;
  if (
    (seed.deliveryZones ?? []).length > 0 &&
    (await tx.deliveryZone.count({ where: { restaurantId, branchId: branch.id } })) === 0
  ) {
    for (const [order, zone] of (seed.deliveryZones ?? []).entries()) {
      await tx.deliveryZone.create({
        data: {
          restaurantId,
          branchId: branch.id,
          name: zone.names[seed.restaurant.defaultLocale],
          deliveryFee: zone.fee,
          minimumOrder: zone.minimumOrder,
          status: 'ACTIVE',
          displayOrder: order,
          translations: {
            create: LOCALES.map((locale) => ({ locale, name: zone.names[locale] })),
          },
        },
      });
      deliveryZones += 1;
    }
  }

  const offersResult = await seedOffers(
    tx,
    restaurantId,
    seed.restaurant.defaultLocale,
    seed.offers,
    photo,
  );

  return {
    outcome: 'seeded',
    offers: offersResult.created.length,
    counts: menuSeedCounts(seed),
    exclusiveDesign: await assignExclusiveDesign(
      tx,
      restaurantId,
      seed,
      categoryIds,
      photo,
    ),
    photos,
    archivedMenus,
    announcements,
    deliveryZones,
  };
}

async function assignExclusiveDesign(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  seed: MenuSeed,
  categoryIds: Map<string, string>,
  photo: (image: SeedImage | undefined) => Promise<string | null>,
): Promise<'assigned' | 'rendererTaken' | 'none'> {
  const design = seed.restaurant.exclusiveDesign;
  if (!design) return 'none';
  const holder = await tx.restaurantExclusiveDesign.findUnique({
    where: { rendererKey: design.rendererKey },
    select: { restaurantId: true },
  });
  if (holder && holder.restaurantId !== restaurantId) return 'rendererTaken';

  // The same normalizers the dashboard uses, so the settings are exactly what an editor save would store.
  let raw: unknown;
  if (design.rendererKey === 'VERDE_NAPOLI_V1') {
    raw = normalizeVerdeSettings({
      brandWord: design.brandWord,
      chapter1CategoryId: categoryIds.get(design.chapter1Category),
      chapter2CategoryId: categoryIds.get(design.chapter2Category),
    });
  } else if (design.rendererKey === 'MAKKBOZ_HERITAGE_V1') {
    const images: Record<string, string | null> = {};
    for (const slot of MAKKBOZ_IMAGE_SLOTS)
      images[MAKKBOZ_IMAGE_FIELD[slot]] = await photo(design.images?.[slot]);
    const categoryExtras: Record<string, unknown> = {};
    for (const [key, chapter] of Object.entries(design.categoryChapters ?? {})) {
      const id = categoryIds.get(key);
      if (id)
        categoryExtras[id] = {
          tagAr: chapter.tag.ar,
          tagEn: chapter.tag.en,
          introAr: chapter.intro.ar,
          introEn: chapter.intro.en,
        };
    }
    raw = normalizeMakkbozSettings({
      ...design.copy,
      brandAr: design.brandAr,
      brandEn: design.brandEn,
      ...images,
      categoryExtras,
    });
  } else if (design.rendererKey === 'MEAT_LOVERS_BUTCHER_V1') {
    const images: Record<string, string | null> = {};
    for (const slot of MEAT_LOVERS_IMAGE_SLOTS)
      images[MEAT_LOVERS_IMAGE_FIELD[slot]] = await photo(design.images?.[slot]);
    const categoryExtras: Record<string, unknown> = {};
    for (const [key, chapter] of Object.entries(design.categoryChapters ?? {})) {
      const id = categoryIds.get(key);
      if (id)
        categoryExtras[id] = {
          tagAr: chapter.tag.ar,
          tagEn: chapter.tag.en,
          introAr: chapter.intro.ar,
          introEn: chapter.intro.en,
        };
    }
    raw = normalizeMeatLoversSettings({
      ...design.copy,
      brandAr: design.brandAr,
      brandEn: design.brandEn,
      ...images,
      categoryExtras,
    });
  } else {
    const images: Record<string, string | null> = {};
    for (const slot of SHERBINY_IMAGE_SLOTS)
      images[SHERBINY_IMAGE_FIELD[slot]] = await photo(design.images?.[slot]);
    const categoryExtras: Record<string, unknown> = {};
    for (const [key, tag] of Object.entries(design.categoryTags ?? {})) {
      const id = categoryIds.get(key);
      if (id) categoryExtras[id] = { tagAr: tag.ar, tagEn: tag.en };
    }
    raw = normalizeSherbinySettings({
      ...design.copy,
      brandAr: design.brandAr,
      brandEn: design.brandEn,
      ...images,
      categoryExtras,
    });
  }
  const settings = JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue;
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
