import type { PublicOffer, PublicOfferSlot } from './types';

/**
 * Offers / Bundles (DEC-069): the Guest app's pure logic -- choices, readiness, display price, cart identity and the
 * check that a stored cart line still fits the CURRENT menu. Display only: the Backend re-validates and re-prices every
 * offer line on submit and is the authority on money. No runtime imports on purpose (types only), so this file is
 * testable by plain `node --test` like `checkout-validation.ts`.
 *
 * A "pick" is `{ slotId, optionId, quantity }` -- identities and a quantity, never a price or a name. FIXED slots
 * (the included gift) have no picks.
 */

export interface OfferPick {
  slotId: string;
  optionId: string;
  quantity: number;
}

/** Picks as the sheet holds them while the Guest chooses: slot id -> option id -> quantity. */
export type OfferPicks = Record<string, Record<string, number>>;

/** The id of the "Offers" pseudo-category: the strip's DOM id is `category-offers`, the chip scrolls to it. */
export const OFFERS_SECTION_ID = 'offers';

export const MAX_OFFER_QUANTITY = 99;

const HUNDRED = BigInt(100);

function minor(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? amount.slice(1) : amount).split('.');
  const value = BigInt(whole || '0') * HUNDRED + BigInt((fraction + '00').slice(0, 2) || '0');
  return negative ? -value : value;
}

function fromMinor(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / HUNDRED}.${(absolute % HUNDRED).toString().padStart(2, '0')}`;
}

/** How many a slot needs in total: SINGLE one, MULTI its count, FIXED nothing. */
export function neededInSlot(slot: PublicOfferSlot): number {
  if (slot.kind === 'FIXED') return 0;
  return slot.kind === 'SINGLE' ? 1 : slot.requiredCount;
}

export function pickedInSlot(slot: PublicOfferSlot, picks: OfferPicks): number {
  let total = 0;
  for (const quantity of Object.values(picks[slot.id] ?? {})) total += quantity;
  return total;
}

export function isSlotComplete(slot: PublicOfferSlot, picks: OfferPicks): boolean {
  return slot.kind === 'FIXED' || pickedInSlot(slot, picks) === neededInSlot(slot);
}

/** The first slot (in the offer's order) that still needs choices, or null when the offer is ready to add. */
export function firstMissingSlot(offer: PublicOffer, picks: OfferPicks): PublicOfferSlot | null {
  return offer.slots.find((slot) => !isSlotComplete(slot, picks)) ?? null;
}

/** The price of ONE copy: the fixed offer price plus the paid adjustments of the picks (exact, in cents). */
export function offerUnitPrice(offer: PublicOffer, picks: OfferPicks): string {
  let total = minor(offer.price);
  for (const slot of offer.slots) {
    if (slot.kind === 'FIXED') continue;
    for (const option of slot.options) {
      const quantity = picks[slot.id]?.[option.id] ?? 0;
      if (quantity > 0) total += minor(option.priceAdjustment) * BigInt(quantity);
    }
  }
  return fromMinor(total);
}

/** Picks -> the identity list the cart stores and the API receives (non-FIXED slots, offer order, no zero quantities). */
export function picksToList(offer: PublicOffer, picks: OfferPicks): OfferPick[] {
  const list: OfferPick[] = [];
  for (const slot of offer.slots) {
    if (slot.kind === 'FIXED') continue;
    for (const option of slot.options) {
      const quantity = picks[slot.id]?.[option.id] ?? 0;
      if (quantity > 0) list.push({ slotId: slot.id, optionId: option.id, quantity });
    }
  }
  return list;
}

export function listToPicks(list: readonly OfferPick[]): OfferPicks {
  const picks: OfferPicks = {};
  for (const pick of list) {
    picks[pick.slotId] = { ...(picks[pick.slotId] ?? {}), [pick.optionId]: pick.quantity };
  }
  return picks;
}

/** Same offer + same picks = the same cart line. Sorted, so the order the picks were made in never matters. */
export function offerCartKey(offerId: string, picks: readonly OfferPick[]): string {
  const parts = picks.map((pick) => `${pick.slotId}:${pick.optionId}:${pick.quantity}`).sort();
  return `offer::${offerId}::${parts.join(',')}`;
}

/** Why a stored line cannot be ordered now: the offer is gone / off today, or its slots no longer match the picks. */
export type OfferLineProblem = 'UNAVAILABLE' | 'CHANGED';

export interface ResolvedOfferLine {
  offer: PublicOffer;
  picks: OfferPicks;
  /** One display row per slot: its title, what was chosen (or included) and whether it is the free gift. */
  rows: { slotId: string; title: string; value: string; included: boolean }[];
  /** Price of one copy (offer price + paid adjustments), exact. */
  unitPrice: string;
  problem: OfferLineProblem | null;
}

/** "2× Taameya, Cheese (+5)" -- one slot's picks in words. `extra` formats a paid adjustment ("+5 EGP"). */
function describePicks(
  slot: PublicOfferSlot,
  picks: OfferPicks,
  extra: (adjustment: string) => string,
  separator: string,
): string {
  if (slot.kind === 'FIXED') {
    return slot.options
      .map((option) => `${(option.quantity ?? 1) > 1 ? `${option.quantity}× ` : ''}${option.name}`)
      .join(separator);
  }
  const parts: string[] = [];
  for (const option of slot.options) {
    const quantity = picks[slot.id]?.[option.id] ?? 0;
    if (quantity === 0) continue;
    const paid = minor(option.priceAdjustment) > BigInt(0) ? ` (${extra(option.priceAdjustment)})` : '';
    parts.push(`${quantity > 1 ? `${quantity}× ` : ''}${option.name}${paid}`);
  }
  return parts.join(separator);
}

/**
 * Re-resolves a stored cart line against the CURRENT menu. The line is kept either way; `problem` says why it cannot be
 * ordered (no longer offered / not valid today, or the choices no longer fit the offer). Names and prices always come from
 * the current offer, never from storage.
 */
export function resolveOfferLine(
  offers: readonly PublicOffer[],
  stored: { offerId: string; choices: readonly OfferPick[] },
  extra: (adjustment: string) => string,
  /** Between the items of one slot: ", " in English, "، " in Arabic. */
  separator = ', ',
): ResolvedOfferLine | null {
  const offer = offers.find((candidate) => candidate.id === stored.offerId);
  if (!offer) return null;
  const picks = listToPicks(stored.choices);
  // Every pick must name a slot and an option of THIS offer, and every slot must be complete.
  const fits =
    stored.choices.every((pick) => {
      const slot = offer.slots.find((candidate) => candidate.id === pick.slotId);
      return (
        slot !== undefined &&
        slot.kind !== 'FIXED' &&
        slot.options.some((option) => option.id === pick.optionId)
      );
    }) && offer.slots.every((slot) => isSlotComplete(slot, picks));
  const problem: OfferLineProblem | null =
    !offer.availableToday || offer.soldOut === true ? 'UNAVAILABLE' : fits ? null : 'CHANGED';
  return {
    offer,
    picks,
    rows: offer.slots.map((slot) => ({
      slotId: slot.id,
      title: slot.title,
      value: describePicks(slot, picks, extra, separator),
      included: slot.kind === 'FIXED',
    })),
    unitPrice: offerUnitPrice(offer, picks),
    problem,
  };
}

/** Is `day` (0 = Sunday ... 6 = Saturday) one of the offer's days? An empty list means every day. */
export function offerRunsOnDay(offer: Pick<PublicOffer, 'daysOfWeek'>, day: number): boolean {
  return offer.daysOfWeek.length === 0 || offer.daysOfWeek.includes(day);
}
