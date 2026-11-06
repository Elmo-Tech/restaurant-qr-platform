import { Prisma } from '../generated/prisma/client';
import {
  checkSlotShapes,
  normalizeDays,
  OFFER_LIMITS,
  storedRequiredCount,
  type OfferBadgeName,
  type OfferSlotKindName,
} from '../offers/offer-rules';
import { parseDateOnly } from '../announcements/announcements';

/**
 * Offers / Bundles (DEC-069) in the repeatable menu seed: `seed-data/<name>/menu.json` may carry an optional `offers` array.
 * It is applied with the menu (a new menu) or on its own to a Restaurant that already has one
 * (`apply:restaurant-menu -- --offers-only`). Repeatable and never destructive: an offer whose default-language name already
 * exists (not deleted) on the Restaurant is left exactly as it is, so staff edits are never overwritten. Offers are created
 * switched OFF unless the entry says `"active": true`, so nothing reaches guests by surprise. Nothing runs on deploy.
 */

type Localized = { ar: string; en: string };

export interface SeedOfferSlot {
  kind: OfferSlotKindName;
  /** MULTI only: how many to pick in total. */
  count?: number;
  titles: Localized;
  /** `extra` is the paid adjustment on top of the offer price ("0" or omitted = free; never for an included item). */
  options: { names: Localized; extra?: string }[];
}

export interface SeedOffer {
  names: Localized;
  descriptions?: Localized;
  price: string;
  badge?: OfferBadgeName;
  /** 0 (Sunday) to 6 (Saturday); omitted or all seven = every day. */
  days?: number[];
  startsOn?: string;
  endsOn?: string;
  /** Default false: created switched off. */
  active?: boolean;
  image?: string;
  slots: SeedOfferSlot[];
}

const MONEY = /^\d+(\.\d{1,2})?$/;
const LOCALES = ['ar', 'en'] as const;
const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
const localized = (value: Localized | undefined): boolean => !!value && hasText(value.ar) && hasText(value.en);

/** Every reason the seed's offers cannot be used; empty = safe. */
export function offerSeedProblems(offers: SeedOffer[] | undefined): string[] {
  const problems: string[] = [];
  if (!offers) return problems;
  if (offers.length > OFFER_LIMITS.maxOffers) problems.push(`more than ${OFFER_LIMITS.maxOffers} offers`);
  const seen = new Set<string>();
  for (const [index, offer] of offers.entries()) {
    const where = `offer ${index + 1}`;
    if (!localized(offer.names)) {
      problems.push(`${where} lacks a name in both languages`);
      continue;
    }
    if (seen.has(offer.names.ar) || seen.has(offer.names.en)) problems.push(`${where} repeats a name`);
    seen.add(offer.names.ar);
    seen.add(offer.names.en);
    if (!MONEY.test(offer.price ?? '')) problems.push(`${where} has a bad price`);
    if (offer.descriptions && !localized(offer.descriptions)) problems.push(`${where} description lacks a language`);
    if (offer.days && normalizeDays(offer.days) === null) problems.push(`${where} has bad days`);
    const starts = offer.startsOn ? parseDateOnly(offer.startsOn) : null;
    const ends = offer.endsOn ? parseDateOnly(offer.endsOn) : null;
    if ((offer.startsOn && !starts) || (offer.endsOn && !ends)) problems.push(`${where} has a bad date`);
    else if (starts && ends && ends < starts) problems.push(`${where} ends before it starts`);
    if (!Array.isArray(offer.slots)) {
      problems.push(`${where} has no slots`);
      continue;
    }
    for (const slot of offer.slots) {
      if (!localized(slot.titles)) problems.push(`${where} has a slot without a title`);
      if (!Array.isArray(slot.options)) {
        problems.push(`${where} has a slot without options`);
        continue;
      }
      for (const option of slot.options) {
        if (!localized(option.names)) problems.push(`${where} has an unnamed option`);
        if (option.extra !== undefined && !MONEY.test(option.extra)) problems.push(`${where} has a bad option price`);
      }
    }
    const shape = checkSlotShapes(
      offer.slots.map((slot) => ({
        kind: slot.kind,
        requiredCount: storedRequiredCount(slot.kind, slot.count),
        optionCount: slot.options?.length ?? 0,
        hasAdjustment: (slot.options ?? []).some((option) => new Prisma.Decimal(option.extra ?? '0').gt(0)),
      })),
    );
    if (shape) problems.push(`${where}: slots are not valid (${shape})`);
  }
  return problems;
}

/** The photo files the offers name (so the CLI validates them with the others). */
export function offerSeedPhotoNames(offers: SeedOffer[] | undefined): string[] {
  return (offers ?? []).flatMap((offer) => (offer.image ? [offer.image] : []));
}

export interface SeedOffersResult {
  created: string[];
  /** Offers left alone because the Restaurant already has one with that name. */
  skipped: string[];
}

/** Creates the missing offers of the seed for one Restaurant, inside the caller's transaction. */
export async function seedOffers(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  defaultLocale: 'ar' | 'en',
  offers: SeedOffer[] | undefined,
  photo: (image: string | undefined) => Promise<string | null>,
): Promise<SeedOffersResult> {
  const result: SeedOffersResult = { created: [], skipped: [] };
  if (!offers || offers.length === 0) return result;
  const existing = await tx.offerTranslation.findMany({
    where: { locale: defaultLocale, offer: { restaurantId, status: { not: 'ARCHIVED' } } },
    select: { name: true },
  });
  const taken = new Set(existing.map((row) => row.name));
  const last = await tx.offer.aggregate({ where: { restaurantId }, _max: { displayOrder: true } });
  let order = (last._max.displayOrder ?? -1) + 1;

  for (const offer of offers) {
    if (taken.has(offer.names[defaultLocale])) {
      result.skipped.push(offer.names[defaultLocale]);
      continue;
    }
    await tx.offer.create({
      data: {
        restaurantId,
        status: offer.active === true ? 'ACTIVE' : 'INACTIVE',
        badge: offer.badge ?? 'OFFER',
        price: new Prisma.Decimal(offer.price),
        daysOfWeek: normalizeDays(offer.days) ?? [],
        startsOn: offer.startsOn ? parseDateOnly(offer.startsOn) : null,
        endsOn: offer.endsOn ? parseDateOnly(offer.endsOn) : null,
        imageAssetPath: await photo(offer.image),
        displayOrder: order++,
        translations: {
          create: LOCALES.map((locale) => ({
            locale,
            name: offer.names[locale],
            description: offer.descriptions?.[locale] ?? null,
          })),
        },
        slots: {
          create: offer.slots.map((slot, slotIndex) => ({
            restaurantId,
            kind: slot.kind,
            requiredCount: storedRequiredCount(slot.kind, slot.count),
            displayOrder: slotIndex,
            translations: {
              create: LOCALES.map((locale) => ({ locale, title: slot.titles[locale] })),
            },
            options: {
              create: slot.options.map((option, optionIndex) => ({
                restaurantId,
                priceAdjustment: new Prisma.Decimal(slot.kind === 'FIXED' ? '0' : (option.extra ?? '0')),
                displayOrder: optionIndex,
                translations: {
                  create: LOCALES.map((locale) => ({ locale, name: option.names[locale] })),
                },
              })),
            },
          })),
        },
      },
    });
    result.created.push(offer.names[defaultLocale]);
  }
  return result;
}
