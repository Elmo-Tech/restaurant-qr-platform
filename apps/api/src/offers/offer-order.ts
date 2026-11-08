import { Prisma } from '../generated/prisma/client';
import type { OfferSlotKindName } from './offer-rules';
import { OFFER_LIMITS } from './offer-rules';

/**
 * Offers / Bundles (DEC-069): the ONE pricing and validation authority for an Offer order line. Pure: the order service loads the
 * Offer fresh inside its transaction (default-locale names already picked) and hands it here with the Guest's choices
 * (identities only). Money is `Prisma.Decimal` only.
 *
 * line unit price = offer price + sum(option adjustment x quantity chosen)
 * line total      = line unit price x line quantity
 */

/** An Offer as the order needs it: authoritative price and the names to snapshot. */
export interface OrderableOffer {
  id: string;
  price: Prisma.Decimal;
  /** The Restaurant default-locale name. */
  nameSnapshot: string;
  slots: {
    id: string;
    kind: OfferSlotKindName;
    requiredCount: number;
    displayOrder: number;
    titleSnapshot: string;
    options: {
      id: string;
      displayOrder: number;
      nameSnapshot: string;
      priceAdjustment: Prisma.Decimal;
      /** Units an INCLUDED item brings (2 x taameya); 1 for a choice. */
      quantity?: number;
    }[];
  }[];
}

/** What a Guest sends for one slot choice: identities and a quantity, never a price or a name. */
export interface OfferChoiceInput {
  slotId: string;
  optionId: string;
  quantity: number;
}

/** One stored choice (becomes an `order_item_offer_choices` row). */
export interface ResolvedOfferChoice {
  slotId: string;
  optionId: string;
  slotKind: OfferSlotKindName;
  slotTitleSnapshot: string;
  optionNameSnapshot: string;
  /** The adjustment of ONE unit of the option. */
  priceAdjustment: Prisma.Decimal;
  quantity: number;
  /** True for the items of a FIXED slot (the gift). */
  included: boolean;
  displayOrder: number;
}

/** Why the Guest's choices do not fit the Offer: all of them mean "the offer changed or the request is wrong". */
export type OfferChoiceProblem =
  | 'UNKNOWN_SLOT'
  | 'UNKNOWN_OPTION'
  | 'DUPLICATE_OPTION'
  | 'FIXED_HAS_CHOICE'
  | 'BAD_QUANTITY'
  | 'SLOT_INCOMPLETE'
  | 'SLOT_OVERFILLED';

export type ResolvedOfferLine =
  | {
      ok: true;
      /** The fixed offer price. */
      basePrice: Prisma.Decimal;
      /** Sum of the paid adjustments x quantities for ONE copy of the offer. */
      extrasTotal: Prisma.Decimal;
      /** basePrice + extrasTotal: the price of one copy. */
      unitTotal: Prisma.Decimal;
      choices: ResolvedOfferChoice[];
    }
  | { ok: false; problem: OfferChoiceProblem };

const ZERO = new Prisma.Decimal(0);

/**
 * Checks the Guest's choices against the Offer and prices one copy. Every slot must be satisfied exactly:
 * SINGLE one choice with quantity 1, MULTI quantities adding up to `requiredCount`, FIXED no choice (its items are
 * added as included rows). A slot or option that is not part of THIS Offer fails like a changed Offer.
 */
export function resolveOfferChoices(
  offer: OrderableOffer,
  choices: readonly OfferChoiceInput[],
): ResolvedOfferLine {
  const slotById = new Map(offer.slots.map((slot) => [slot.id, slot]));
  const chosenBySlot = new Map<string, Map<string, number>>();
  for (const choice of choices) {
    const slot = slotById.get(choice.slotId);
    if (!slot) return { ok: false, problem: 'UNKNOWN_SLOT' };
    if (slot.kind === 'FIXED') return { ok: false, problem: 'FIXED_HAS_CHOICE' };
    if (!slot.options.some((option) => option.id === choice.optionId)) {
      return { ok: false, problem: 'UNKNOWN_OPTION' };
    }
    if (
      !Number.isInteger(choice.quantity) ||
      choice.quantity < 1 ||
      choice.quantity > OFFER_LIMITS.maxPickCount
    ) {
      return { ok: false, problem: 'BAD_QUANTITY' };
    }
    const forSlot = chosenBySlot.get(slot.id) ?? new Map<string, number>();
    if (forSlot.has(choice.optionId)) return { ok: false, problem: 'DUPLICATE_OPTION' };
    forSlot.set(choice.optionId, choice.quantity);
    chosenBySlot.set(slot.id, forSlot);
  }

  const resolved: ResolvedOfferChoice[] = [];
  let extrasTotal = ZERO;
  let order = 0;
  const slotsInOrder = [...offer.slots].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
  );
  for (const slot of slotsInOrder) {
    const optionsInOrder = [...slot.options].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
    );
    if (slot.kind === 'FIXED') {
      // The gift: every option is included; nothing to choose and nothing to pay.
      for (const option of optionsInOrder) {
        resolved.push({
          slotId: slot.id,
          optionId: option.id,
          slotKind: slot.kind,
          slotTitleSnapshot: slot.titleSnapshot,
          optionNameSnapshot: option.nameSnapshot,
          priceAdjustment: ZERO,
          quantity: option.quantity ?? 1,
          included: true,
          displayOrder: order++,
        });
      }
      continue;
    }
    const chosen = chosenBySlot.get(slot.id) ?? new Map<string, number>();
    let picked = 0;
    for (const quantity of chosen.values()) picked += quantity;
    const needed = slot.kind === 'SINGLE' ? 1 : slot.requiredCount;
    if (picked < needed) return { ok: false, problem: 'SLOT_INCOMPLETE' };
    if (picked > needed) return { ok: false, problem: 'SLOT_OVERFILLED' };
    for (const option of optionsInOrder) {
      const quantity = chosen.get(option.id);
      if (quantity === undefined) continue;
      extrasTotal = extrasTotal.plus(option.priceAdjustment.times(quantity));
      resolved.push({
        slotId: slot.id,
        optionId: option.id,
        slotKind: slot.kind,
        slotTitleSnapshot: slot.titleSnapshot,
        optionNameSnapshot: option.nameSnapshot,
        priceAdjustment: option.priceAdjustment,
        quantity,
        included: false,
        displayOrder: order++,
      });
    }
  }
  return {
    ok: true,
    basePrice: offer.price,
    extrasTotal,
    unitTotal: offer.price.plus(extrasTotal),
    choices: resolved,
  };
}

/** Identity of an Offer line inside one order: the same Offer with the same choices twice is a duplicate line. */
export function offerLineKey(offerId: string, choices: readonly OfferChoiceInput[]): string {
  const parts = choices
    .map((choice) => `${choice.slotId}:${choice.optionId}:${choice.quantity}`)
    .sort();
  return `offer::${offerId}::${parts.join(',')}`;
}

/** The snapshot columns a reader needs to show one stored choice. */
export interface StoredOfferChoice {
  slotTitleSnapshot: string;
  optionNameSnapshot: string;
  priceAdjustmentSnapshot: Prisma.Decimal;
  quantity: number;
  displayOrder: number;
}

/** One entry of an order line's `modifiers` list, the shape every order reader already renders. */
export interface OfferModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

/**
 * Projects stored Offer choices into the `modifiers` view every order reader (kitchen, Staff orders, Table Session bill,
 * Guest tracking) already renders: the slot title is the group, the choice is the option (`2× Name` when more than one),
 * and the price is the adjustment x quantity ("0.00" for free and included items).
 */
export function offerChoiceModifiers(choices: readonly StoredOfferChoice[]): OfferModifierView[] {
  return [...choices]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((choice) => ({
      groupName: choice.slotTitleSnapshot,
      optionName:
        choice.quantity > 1
          ? `${choice.quantity}× ${choice.optionNameSnapshot}`
          : choice.optionNameSnapshot,
      priceAdjustment: choice.priceAdjustmentSnapshot.times(choice.quantity).toFixed(2),
    }));
}

/** Prisma `select` fragment every order reader adds to its item select to project Offer choices. */
export const OFFER_CHOICES_SELECT = {
  offerChoices: {
    select: {
      slotTitleSnapshot: true,
      optionNameSnapshot: true,
      priceAdjustmentSnapshot: true,
      quantity: true,
      displayOrder: true,
    },
    orderBy: { displayOrder: 'asc' as const },
  },
} as const;
