/**
 * Offers / Bundles (DEC-069, OFFERS_SPEC.md): the pure rules. No I/O, no clock: every caller passes "today".
 *
 * An Offer is available on a day when it is ACTIVE, the day is inside its (inclusive) dates and the weekday is one of
 * its weekdays (empty = every day). "Today" is a `YYYY-MM-DD` string read in the order Branch's timezone (the same
 * convention as Product discounts and announcements), so plain string comparison is correct.
 */

export const OFFER_LIMITS = {
  /** Slots in one Offer. */
  maxSlots: 6,
  /** Options in one Offer, over all its slots. */
  maxOptions: 20,
  /** Non-archived Offers in one Restaurant (bounds the public menu payload). */
  maxOffers: 30,
  /** `requiredCount` of a MULTI slot, and the quantity of one option choice. */
  maxPickCount: 20,
  maxName: 120,
  maxDescription: 300,
  maxSlotTitle: 80,
  maxOptionName: 80,
} as const;

export type OfferSlotKindName = 'FIXED' | 'SINGLE' | 'MULTI';
export type OfferStatusName = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type OfferBadgeName = 'OFFER' | 'GIFT' | 'MOST_ORDERED';

/** Why a draft Offer's slots are not acceptable (the `details.reason` of `OFFER_SLOTS_INVALID`). */
export type OfferSlotsProblem =
  | 'NO_SLOTS'
  | 'TOO_MANY_SLOTS'
  | 'TOO_MANY_OPTIONS'
  | 'SLOT_NEEDS_OPTIONS'
  | 'SINGLE_NEEDS_TWO'
  | 'MULTI_COUNT_INVALID'
  | 'FIXED_ADJUSTMENT'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_ID';

/** 0 = Sunday ... 6 = Saturday, the Branch opening hours' convention. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/**
 * The weekdays a request asks for, as a sorted set. `[]` and all seven days both mean "every day" and are stored
 * as `[]`. Returns null when a value is not an integer 0..6.
 */
export function normalizeDays(days: readonly unknown[] | undefined | null): number[] | null {
  if (!days) return [];
  const set = new Set<number>();
  for (const day of days) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return null;
    set.add(day);
  }
  return set.size === 7 ? [] : [...set].sort((a, b) => a - b);
}

export interface OfferAvailabilityInput {
  status: OfferStatusName;
  /** `[]` or null = every day. */
  daysOfWeek: readonly number[] | null | undefined;
  /** `YYYY-MM-DD` or null. */
  startsOn: string | null;
  endsOn: string | null;
}

/**
 * Where an Offer stands on a day: AVAILABLE (can be ordered), TODAY_OFF (right dates, wrong weekday),
 * NOT_STARTED / ENDED (outside the dates), OFF (not ACTIVE).
 */
export type OfferAvailability = 'AVAILABLE' | 'TODAY_OFF' | 'NOT_STARTED' | 'ENDED' | 'OFF';

export function offerAvailability(offer: OfferAvailabilityInput, today: string): OfferAvailability {
  if (offer.status !== 'ACTIVE') return 'OFF';
  if (offer.startsOn !== null && today < offer.startsOn) return 'NOT_STARTED';
  if (offer.endsOn !== null && today > offer.endsOn) return 'ENDED';
  const days = offer.daysOfWeek ?? [];
  if (days.length > 0 && !days.includes(weekdayOf(today))) return 'TODAY_OFF';
  return 'AVAILABLE';
}

/** Collapses whitespace, drops control characters and caps the length. Emoji are kept. */
export function cleanOfferText(value: string, max: number): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/** The shape facts about a slot the rules need (money is checked as a string "0" test by the caller). */
export interface SlotShape {
  kind: OfferSlotKindName;
  requiredCount: number;
  optionCount: number;
  /** True when any option of the slot has a price adjustment above zero. */
  hasAdjustment: boolean;
}

/** The first problem with the slots of a draft Offer, or null when they are acceptable. */
export function checkSlotShapes(slots: readonly SlotShape[]): OfferSlotsProblem | null {
  if (slots.length === 0) return 'NO_SLOTS';
  if (slots.length > OFFER_LIMITS.maxSlots) return 'TOO_MANY_SLOTS';
  let options = 0;
  for (const slot of slots) {
    options += slot.optionCount;
    if (slot.optionCount === 0) return 'SLOT_NEEDS_OPTIONS';
    if (slot.kind === 'SINGLE' && slot.optionCount < 2) return 'SINGLE_NEEDS_TWO';
    if (
      slot.kind === 'MULTI' &&
      (!Number.isInteger(slot.requiredCount) ||
        slot.requiredCount < 1 ||
        slot.requiredCount > OFFER_LIMITS.maxPickCount)
    ) {
      return 'MULTI_COUNT_INVALID';
    }
    if (slot.kind === 'FIXED' && slot.hasAdjustment) return 'FIXED_ADJUSTMENT';
  }
  if (options > OFFER_LIMITS.maxOptions) return 'TOO_MANY_OPTIONS';
  return null;
}

/** The `required_count` stored for a slot kind (the migration's CHECK): FIXED 0, SINGLE 1, MULTI as asked. */
export function storedRequiredCount(kind: OfferSlotKindName, asked: number | undefined): number {
  if (kind === 'FIXED') return 0;
  if (kind === 'SINGLE') return 1;
  return asked ?? 0;
}
