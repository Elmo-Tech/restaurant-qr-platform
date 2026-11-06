import { Injectable } from '@nestjs/common';
import { dateOnly, parseDateOnly } from '../announcements/announcements';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { localDateIn } from '../menu/product-discount';
import { itemNamesByLocale, itemOrderable, optionItemSelect } from './offer-items';
import {
  checkSlotShapes,
  cleanOfferText,
  normalizeDays,
  OFFER_LIMITS,
  offerAvailability,
  storedRequiredCount,
  type OfferBadgeName,
  type OfferSlotKindName,
  type OfferSlotsProblem,
  type OfferStatusName,
} from './offer-rules';

/** One menu item the offer editor can pick (OFFERS_SPEC.md #5). */
export interface MenuItemChoice {
  id: string;
  names: Record<string, string>;
  categoryNames: Record<string, string>;
  available: boolean;
  variants: { id: string; names: Record<string, string>; price: string }[];
}

/** What staff see for one Offer (OFFERS_SPEC.md #5). Money is a string. */
export interface StaffOffer {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  badge: OfferBadgeName;
  price: string;
  daysOfWeek: number[];
  startsOn: string | null;
  endsOn: string | null;
  imageAssetPath: string | null;
  displayOrder: number;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  /** Where it stands today in the Restaurant's first Branch timezone. */
  state: 'LIVE' | 'TODAY_OFF' | 'SCHEDULED' | 'EXPIRED' | 'OFF';
  slots: {
    id: string;
    kind: OfferSlotKindName;
    requiredCount: number;
    titles: Record<string, string>;
    options: {
      id: string;
      /** A typed item's own names; for a menu-linked item the product's current names (size appended). */
      names: Record<string, string>;
      priceAdjustment: string;
      /** Set when the item IS a menu item (and, with sizes, which size). */
      productId: string | null;
      variantId: string | null;
      /** Units an included item brings. */
      quantity: number;
      /** False while a linked item is sold out / hidden (the Guest then sees the offer as unavailable). */
      orderable: boolean;
    }[];
  }[];
}

export interface OfferOptionInput {
  id?: string;
  /** Required for a typed item; ignored for a menu-linked one (its name follows the menu). */
  names?: Record<string, string | null>;
  priceAdjustment?: string;
  productId?: string | null;
  variantId?: string | null;
  quantity?: number;
}

export interface OfferSlotInput {
  id?: string;
  kind: OfferSlotKindName;
  requiredCount?: number;
  titles: Record<string, string | null>;
  options: OfferOptionInput[];
}

export interface OfferInput {
  restaurantId: string;
  status?: 'ACTIVE' | 'INACTIVE';
  badge?: OfferBadgeName;
  price?: string;
  daysOfWeek?: number[];
  startsOn?: string | null;
  endsOn?: string | null;
  names?: Record<string, string | null>;
  descriptions?: Record<string, string | null>;
  slots?: OfferSlotInput[];
}

export type OfferFailure =
  | 'OFFER_NOT_FOUND'
  | 'DEFAULT_TRANSLATION_REQUIRED'
  | 'LOCALE_NOT_ACTIVE'
  | 'OFFER_PRICE_REQUIRED'
  | 'OFFER_DATES_INVALID'
  | 'OFFER_DAYS_INVALID'
  | 'OFFER_SLOTS_INVALID'
  | 'OFFER_ITEM_INVALID'
  | 'OFFER_ORDER_INVALID'
  | 'OFFER_LIMIT_REACHED';

export type OfferResult =
  | { outcome: 'ok'; data: StaffOffer }
  | { outcome: 'failed'; code: OfferFailure; reason?: OfferSlotsProblem | OfferItemProblem };

/** Why a menu-linked item is refused (`details.reason` of `OFFER_ITEM_INVALID`). */
export type OfferItemProblem = 'UNKNOWN_PRODUCT' | 'VARIANT_REQUIRED' | 'UNKNOWN_VARIANT' | 'BAD_QUANTITY';

const SELECT = {
  id: true,
  status: true,
  badge: true,
  price: true,
  daysOfWeek: true,
  startsOn: true,
  endsOn: true,
  imageAssetPath: true,
  displayOrder: true,
  translations: { select: { locale: true, name: true, description: true } },
  slots: {
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      requiredCount: true,
      translations: { select: { locale: true, title: true } },
      options: {
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          priceAdjustment: true,
          translations: { select: { locale: true, name: true } },
          ...optionItemSelect(),
        },
      },
    },
  },
} satisfies Prisma.OfferSelect;

type Row = Prisma.OfferGetPayload<{ select: typeof SELECT }>;

function toView(row: Row, today: string): StaffOffer {
  const status = row.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const availability = offerAvailability(
    {
      status: row.status,
      daysOfWeek: row.daysOfWeek,
      startsOn: dateOnly(row.startsOn),
      endsOn: dateOnly(row.endsOn),
    },
    today,
  );
  const state: StaffOffer['state'] =
    availability === 'AVAILABLE'
      ? 'LIVE'
      : availability === 'TODAY_OFF'
        ? 'TODAY_OFF'
        : availability === 'NOT_STARTED'
          ? 'SCHEDULED'
          : availability === 'ENDED'
            ? 'EXPIRED'
            : 'OFF';
  return {
    id: row.id,
    status,
    badge: row.badge,
    price: row.price.toFixed(2),
    daysOfWeek: [...(row.daysOfWeek ?? [])].sort((a, b) => a - b),
    startsOn: dateOnly(row.startsOn),
    endsOn: dateOnly(row.endsOn),
    imageAssetPath: row.imageAssetPath,
    displayOrder: row.displayOrder,
    names: Object.fromEntries(row.translations.map((t) => [t.locale, t.name])),
    descriptions: Object.fromEntries(
      row.translations
        .filter((t) => t.description)
        .map((t) => [t.locale, t.description as string]),
    ),
    state,
    slots: row.slots.map((slot) => ({
      id: slot.id,
      kind: slot.kind,
      requiredCount: slot.requiredCount,
      titles: Object.fromEntries(
        slot.translations.map((t) => [t.locale, t.title]),
      ),
      options: slot.options.map((option) => ({
        id: option.id,
        names:
          option.productId === null
            ? Object.fromEntries(option.translations.map((t) => [t.locale, t.name]))
            : itemNamesByLocale(option),
        priceAdjustment: option.priceAdjustment.toFixed(2),
        productId: option.productId,
        variantId: option.variantId,
        quantity: option.quantity,
        orderable: itemOrderable(option),
      })),
    })),
  };
}

/** A cleaned `{ locale: text }` map: unknown locales fail, blank values are dropped. */
function cleanMap(
  sent: Record<string, string | null> | undefined,
  base: Record<string, string>,
  activeLocales: ReadonlySet<string>,
  max: number,
): Record<string, string> | 'LOCALE_NOT_ACTIVE' {
  const result = { ...base };
  for (const [locale, raw] of Object.entries(sent ?? {})) {
    if (!activeLocales.has(locale)) return 'LOCALE_NOT_ACTIVE';
    const text = typeof raw === 'string' ? cleanOfferText(raw, max) : '';
    if (text === '') delete result[locale];
    else result[locale] = text;
  }
  return result;
}

interface CleanSlot {
  id?: string;
  kind: OfferSlotKindName;
  requiredCount: number;
  titles: Record<string, string>;
  options: {
    id?: string;
    names: Record<string, string>;
    priceAdjustment: Prisma.Decimal;
    productId: string | null;
    variantId: string | null;
    quantity: number;
  }[];
}

interface Draft {
  status: 'ACTIVE' | 'INACTIVE';
  badge: OfferBadgeName;
  price: Prisma.Decimal;
  daysOfWeek: number[];
  startsOn: Date | null;
  endsOn: Date | null;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  slots: CleanSlot[] | null;
}

type DraftResult =
  | { outcome: 'ok'; draft: Draft }
  | { outcome: 'failed'; code: OfferFailure; reason?: OfferSlotsProblem | OfferItemProblem };

/** Staff management of Offers (DEC-069). Every query is scoped by the authorized Restaurant. */
@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  /** "Today" as the menu sees it: the date in the Restaurant's first Branch timezone. */
  private async menuToday(restaurantId: string): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });
    return localDateIn(branch?.timezone ?? 'UTC', new Date());
  }

  async list(restaurantId: string): Promise<StaffOffer[]> {
    const [rows, today] = await Promise.all([
      this.prisma.offer.findMany({
        where: { restaurantId, status: { not: 'ARCHIVED' } },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: SELECT,
      }),
      this.menuToday(restaurantId),
    ]);
    return rows.map((row) => toView(row, today));
  }

  async get(restaurantId: string, id: string): Promise<StaffOffer | null> {
    const row = await this.find(restaurantId, id);
    return row ? toView(row, await this.menuToday(restaurantId)) : null;
  }

  async create(input: OfferInput): Promise<OfferResult> {
    const count = await this.prisma.offer.count({
      where: { restaurantId: input.restaurantId, status: { not: 'ARCHIVED' } },
    });
    if (count >= OFFER_LIMITS.maxOffers) {
      return { outcome: 'failed', code: 'OFFER_LIMIT_REACHED' };
    }
    const checked = await this.buildDraft(input, null);
    if (checked.outcome === 'failed') return checked;
    const { draft } = checked;
    if (draft.slots === null) {
      return { outcome: 'failed', code: 'OFFER_SLOTS_INVALID', reason: 'NO_SLOTS' };
    }

    const last = await this.prisma.offer.aggregate({
      where: { restaurantId: input.restaurantId },
      _max: { displayOrder: true },
    });
    const created = await this.prisma.offer.create({
      data: {
        restaurantId: input.restaurantId,
        status: draft.status,
        badge: draft.badge,
        price: draft.price,
        daysOfWeek: draft.daysOfWeek,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        displayOrder: (last._max.displayOrder ?? -1) + 1,
        translations: {
          create: Object.entries(draft.names).map(([locale, name]) => ({
            locale,
            name,
            description: draft.descriptions[locale] ?? null,
          })),
        },
        slots: {
          create: draft.slots.map((slot, slotIndex) => ({
            restaurantId: input.restaurantId,
            kind: slot.kind,
            requiredCount: slot.requiredCount,
            displayOrder: slotIndex,
            translations: {
              create: Object.entries(slot.titles).map(([locale, title]) => ({
                locale,
                title,
              })),
            },
            options: {
              create: slot.options.map((option, optionIndex) => ({
                restaurantId: input.restaurantId,
                priceAdjustment: option.priceAdjustment,
                productId: option.productId,
                variantId: option.variantId,
                quantity: option.quantity,
                displayOrder: optionIndex,
                translations: {
                  create: Object.entries(option.names).map(([locale, name]) => ({
                    locale,
                    name,
                  })),
                },
              })),
            },
          })),
        },
      },
      select: SELECT,
    });
    return {
      outcome: 'ok',
      data: toView(created, await this.menuToday(input.restaurantId)),
    };
  }

  async update(id: string, input: OfferInput): Promise<OfferResult> {
    const existing = await this.find(input.restaurantId, id);
    if (!existing) return { outcome: 'failed', code: 'OFFER_NOT_FOUND' };

    const checked = await this.buildDraft(input, existing);
    if (checked.outcome === 'failed') return checked;
    const { draft } = checked;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id },
        data: {
          status: draft.status,
          badge: draft.badge,
          price: draft.price,
          daysOfWeek: draft.daysOfWeek,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
        },
      });
      await tx.offerTranslation.deleteMany({ where: { offerId: id } });
      await tx.offerTranslation.createMany({
        data: Object.entries(draft.names).map(([locale, name]) => ({
          offerId: id,
          locale,
          name,
          description: draft.descriptions[locale] ?? null,
        })),
      });

      if (draft.slots !== null) {
        const keepSlotIds = draft.slots.flatMap((slot) => (slot.id ? [slot.id] : []));
        await tx.offerSlot.deleteMany({
          where: {
            offerId: id,
            restaurantId: input.restaurantId,
            id: { notIn: keepSlotIds },
          },
        });
        for (const [slotIndex, slot] of draft.slots.entries()) {
          let slotId = slot.id;
          const titles = Object.entries(slot.titles).map(([locale, title]) => ({
            locale,
            title,
          }));
          if (slotId) {
            await tx.offerSlot.update({
              where: { id: slotId },
              data: {
                kind: slot.kind,
                requiredCount: slot.requiredCount,
                displayOrder: slotIndex,
              },
            });
            await tx.offerSlotTranslation.deleteMany({ where: { slotId } });
            await tx.offerSlotTranslation.createMany({
              data: titles.map((title) => ({ slotId: slotId as string, ...title })),
            });
          } else {
            const createdSlot = await tx.offerSlot.create({
              data: {
                restaurantId: input.restaurantId,
                offerId: id,
                kind: slot.kind,
                requiredCount: slot.requiredCount,
                displayOrder: slotIndex,
                translations: { create: titles },
              },
              select: { id: true },
            });
            slotId = createdSlot.id;
          }
          const keepOptionIds = slot.options.flatMap((option) =>
            option.id ? [option.id] : [],
          );
          await tx.offerSlotOption.deleteMany({
            where: {
              slotId,
              restaurantId: input.restaurantId,
              id: { notIn: keepOptionIds },
            },
          });
          for (const [optionIndex, option] of slot.options.entries()) {
            const names = Object.entries(option.names).map(([locale, name]) => ({
              locale,
              name,
            }));
            if (option.id) {
              await tx.offerSlotOption.update({
                where: { id: option.id },
                data: {
                  priceAdjustment: option.priceAdjustment,
                  productId: option.productId,
                  variantId: option.variantId,
                  quantity: option.quantity,
                  displayOrder: optionIndex,
                },
              });
              await tx.offerSlotOptionTranslation.deleteMany({
                where: { optionId: option.id },
              });
              await tx.offerSlotOptionTranslation.createMany({
                data: names.map((name) => ({
                  optionId: option.id as string,
                  ...name,
                })),
              });
            } else {
              await tx.offerSlotOption.create({
                data: {
                  restaurantId: input.restaurantId,
                  slotId,
                  priceAdjustment: option.priceAdjustment,
                  productId: option.productId,
                  variantId: option.variantId,
                  quantity: option.quantity,
                  displayOrder: optionIndex,
                  translations: { create: names },
                },
              });
            }
          }
        }
      }
      return tx.offer.findFirstOrThrow({
        where: { id, restaurantId: input.restaurantId },
        select: SELECT,
      });
    });
    return {
      outcome: 'ok',
      data: toView(updated, await this.menuToday(input.restaurantId)),
    };
  }

  /** "Delete": hides the Offer from Guests and from the list; the rows stay for historical orders. */
  async archive(restaurantId: string, id: string): Promise<boolean> {
    const result = await this.prisma.offer.updateMany({
      where: { id, restaurantId, status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED' satisfies OfferStatusName, archivedAt: new Date() },
    });
    return result.count > 0;
  }

  /** The full non-archived list in its new order. */
  async reorder(
    restaurantId: string,
    offerIds: string[],
  ): Promise<{ outcome: 'ok' } | { outcome: 'failed'; code: 'OFFER_ORDER_INVALID' }> {
    const current = await this.prisma.offer.findMany({
      where: { restaurantId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    const wanted = new Set(offerIds);
    if (
      wanted.size !== offerIds.length ||
      wanted.size !== current.length ||
      current.some((row) => !wanted.has(row.id))
    ) {
      return { outcome: 'failed', code: 'OFFER_ORDER_INVALID' };
    }
    await this.prisma.$transaction(
      offerIds.map((offerId, index) =>
        this.prisma.offer.updateMany({
          where: { id: offerId, restaurantId },
          data: { displayOrder: index },
        }),
      ),
    );
    return { outcome: 'ok' };
  }

  /**
   * What the offer editor can pick from: the products of the Restaurant's ACTIVE primary menu (with their sizes), in menu
   * order, in every language they have. Tenant-scoped; `available` is false for a sold-out product.
   */
  async menuItems(restaurantId: string): Promise<MenuItemChoice[]> {
    const categories = await this.prisma.category.findMany({
      where: { restaurantId, status: 'ACTIVE', menu: { status: 'ACTIVE', isPrimary: true } },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        translations: { select: { locale: true, name: true } },
        products: {
          where: { status: 'ACTIVE' },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            availability: true,
            translations: { select: { locale: true, name: true } },
            variants: {
              where: { status: 'ACTIVE' },
              orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
              select: { id: true, price: true, translations: { select: { locale: true, name: true } } },
            },
          },
        },
      },
    });
    const names = (rows: { locale: string; name: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.locale, row.name]));
    return categories.flatMap((category) =>
      category.products.map((product) => ({
        id: product.id,
        names: names(product.translations),
        categoryNames: names(category.translations),
        available: product.availability === 'AVAILABLE',
        variants: product.variants.map((variant) => ({
          id: variant.id,
          names: names(variant.translations),
          price: variant.price.toFixed(2),
        })),
      })),
    );
  }

  /** Cheap existence check used before an upload touches the disk. */
  async exists(restaurantId: string, id: string): Promise<boolean> {
    const row = await this.prisma.offer.findFirst({
      where: { id, restaurantId, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    return row !== null;
  }

  /** Stores the new photo path; returns the previous path so the controller can delete the old file after the commit. */
  async setImage(
    restaurantId: string,
    id: string,
    imageAssetPath: string | null,
  ): Promise<{ found: false } | { found: true; previous: string | null }> {
    const existing = await this.prisma.offer.findFirst({
      where: { id, restaurantId, status: { not: 'ARCHIVED' } },
      select: { id: true, imageAssetPath: true },
    });
    if (!existing) return { found: false };
    await this.prisma.offer.update({
      where: { id: existing.id },
      data: { imageAssetPath },
    });
    return { found: true, previous: existing.imageAssetPath };
  }

  // ------------------------------------------------------------------ helpers

  private find(restaurantId: string, id: string): Promise<Row | null> {
    return this.prisma.offer.findFirst({
      where: { id, restaurantId, status: { not: 'ARCHIVED' } },
      select: SELECT,
    });
  }

  /** The merged, cleaned result of a create / update. Fails before anything is written. */
  private async buildDraft(
    input: OfferInput,
    existing: Row | null,
  ): Promise<DraftResult> {
    const [restaurant, localeRows] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: input.restaurantId },
        select: { defaultLocale: true },
      }),
      this.prisma.restaurantLocale.findMany({
        where: { restaurantId: input.restaurantId, isActive: true },
        select: { locale: true },
      }),
    ]);
    const active = new Set(localeRows.map((row) => row.locale));
    const defaultLocale = restaurant.defaultLocale;
    const fail = (
      code: OfferFailure,
      reason?: OfferSlotsProblem | OfferItemProblem,
    ): DraftResult => ({ outcome: 'failed', code, reason });

    const names = cleanMap(
      input.names,
      Object.fromEntries(
        (existing?.translations ?? []).map((row) => [row.locale, row.name]),
      ),
      active,
      OFFER_LIMITS.maxName,
    );
    if (names === 'LOCALE_NOT_ACTIVE') return fail('LOCALE_NOT_ACTIVE');
    const descriptions = cleanMap(
      input.descriptions,
      Object.fromEntries(
        (existing?.translations ?? [])
          .filter((row) => row.description)
          .map((row) => [row.locale, row.description as string]),
      ),
      active,
      OFFER_LIMITS.maxDescription,
    );
    if (descriptions === 'LOCALE_NOT_ACTIVE') return fail('LOCALE_NOT_ACTIVE');
    if (!names[defaultLocale]) return fail('DEFAULT_TRANSLATION_REQUIRED');
    // A description without a name in that language would never be shown.
    for (const locale of Object.keys(descriptions)) {
      if (!names[locale]) delete descriptions[locale];
    }

    const priceText = input.price ?? existing?.price.toFixed(2);
    if (priceText === undefined) return fail('OFFER_PRICE_REQUIRED');

    let daysOfWeek: number[];
    if (input.daysOfWeek === undefined) {
      daysOfWeek = [...(existing?.daysOfWeek ?? [])];
    } else {
      const days = normalizeDays(input.daysOfWeek);
      if (days === null) return fail('OFFER_DAYS_INVALID');
      daysOfWeek = days;
    }

    const pickDate = (
      sent: string | null | undefined,
      stored: Date | null,
    ): Date | null | 'invalid' => {
      if (sent === undefined) return stored;
      if (sent === null) return null;
      return parseDateOnly(sent) ?? 'invalid';
    };
    const startsOn = pickDate(input.startsOn, existing?.startsOn ?? null);
    const endsOn = pickDate(input.endsOn, existing?.endsOn ?? null);
    if (startsOn === 'invalid' || endsOn === 'invalid') {
      return fail('OFFER_DATES_INVALID');
    }
    if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
      return fail('OFFER_DATES_INVALID');
    }

    let slots: CleanSlot[] | null = null;
    if (input.slots !== undefined || existing === null) {
      const knownSlotIds = new Set(existing?.slots.map((slot) => slot.id) ?? []);
      const knownOptionsBySlot = new Map(
        (existing?.slots ?? []).map((slot) => [
          slot.id,
          new Set(slot.options.map((option) => option.id)),
        ]),
      );
      const seenIds = new Set<string>();
      const cleaned: CleanSlot[] = [];
      for (const slot of input.slots ?? []) {
        if (slot.id !== undefined) {
          if (!knownSlotIds.has(slot.id)) return fail('OFFER_SLOTS_INVALID', 'UNKNOWN_ID');
          if (seenIds.has(slot.id)) return fail('OFFER_SLOTS_INVALID', 'DUPLICATE_ID');
          seenIds.add(slot.id);
        }
        const titles = cleanMap(slot.titles, {}, active, OFFER_LIMITS.maxSlotTitle);
        if (titles === 'LOCALE_NOT_ACTIVE') return fail('LOCALE_NOT_ACTIVE');
        if (!titles[defaultLocale]) return fail('DEFAULT_TRANSLATION_REQUIRED');
        const cleanOptions: CleanSlot['options'] = [];
        for (const option of slot.options) {
          if (option.id !== undefined) {
            if (!knownOptionsBySlot.get(slot.id ?? '')?.has(option.id)) {
              return fail('OFFER_SLOTS_INVALID', 'UNKNOWN_ID');
            }
            if (seenIds.has(option.id)) return fail('OFFER_SLOTS_INVALID', 'DUPLICATE_ID');
            seenIds.add(option.id);
          }
          const linked = option.productId ? option.productId : null;
          // A menu-linked item takes its name from the menu; a typed item needs its own.
          let optionNames: Record<string, string> = {};
          if (!linked) {
            const cleaned = cleanMap(option.names, {}, active, OFFER_LIMITS.maxOptionName);
            if (cleaned === 'LOCALE_NOT_ACTIVE') return fail('LOCALE_NOT_ACTIVE');
            if (!cleaned[defaultLocale]) return fail('DEFAULT_TRANSLATION_REQUIRED');
            optionNames = cleaned;
          }
          const quantity = slot.kind === 'FIXED' ? (option.quantity ?? 1) : 1;
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            return fail('OFFER_ITEM_INVALID', 'BAD_QUANTITY');
          }
          cleanOptions.push({
            id: option.id,
            names: optionNames,
            priceAdjustment: new Prisma.Decimal(option.priceAdjustment ?? '0'),
            productId: linked,
            variantId: linked && option.variantId ? option.variantId : null,
            quantity,
          });
        }
        cleaned.push({
          id: slot.id,
          kind: slot.kind,
          requiredCount: storedRequiredCount(slot.kind, slot.requiredCount),
          titles,
          options: cleanOptions,
        });
      }
      const problem = checkSlotShapes(
        cleaned.map((slot) => ({
          kind: slot.kind,
          requiredCount: slot.requiredCount,
          optionCount: slot.options.length,
          hasAdjustment: slot.options.some((option) => option.priceAdjustment.gt(0)),
        })),
      );
      if (problem !== null) return fail('OFFER_SLOTS_INVALID', problem);

      // Menu-linked items: every product must belong to THIS Restaurant, and a size must belong to its product
      // (and is required when the product has active sizes). Tenant-scoped, read fresh.
      const productIds = [
        ...new Set(cleaned.flatMap((slot) => slot.options.flatMap((o) => (o.productId ? [o.productId] : [])))),
      ];
      if (productIds.length > 0) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds }, restaurantId: input.restaurantId },
          select: { id: true, variants: { select: { id: true, status: true } } },
        });
        const byId = new Map(products.map((product) => [product.id, product]));
        for (const slot of cleaned) {
          for (const option of slot.options) {
            if (!option.productId) continue;
            const product = byId.get(option.productId);
            if (!product) return fail('OFFER_ITEM_INVALID', 'UNKNOWN_PRODUCT');
            const activeSizes = product.variants.filter((v) => v.status === 'ACTIVE');
            if (option.variantId) {
              if (!product.variants.some((v) => v.id === option.variantId)) {
                return fail('OFFER_ITEM_INVALID', 'UNKNOWN_VARIANT');
              }
            } else if (activeSizes.length > 0) {
              return fail('OFFER_ITEM_INVALID', 'VARIANT_REQUIRED');
            }
          }
        }
      }
      slots = cleaned;
    }

    return {
      outcome: 'ok',
      draft: {
        status: input.status ?? (existing ? (existing.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE') : 'ACTIVE'),
        badge: input.badge ?? existing?.badge ?? 'OFFER',
        price: new Prisma.Decimal(priceText),
        daysOfWeek,
        startsOn,
        endsOn,
        names,
        descriptions,
        slots,
      },
    };
  }
}
