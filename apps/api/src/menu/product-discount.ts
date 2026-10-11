import { Prisma } from '../generated/prisma/client';

/**
 * Product Discounts V1 -- the ONE pricing authority for a product-level
 * discount (PROMOTIONS_SPEC.md #3-5, #34-36, #40-42). Pure and clock-free:
 * every caller passes the current calendar date explicitly, so the menu read
 * path, the Staff views and order creation all use exactly the same rules and
 * the date boundaries are unit-testable.
 *
 * Calculation order (unchanged from the approved pricing design):
 *   unit price      = base price - unit discount           (discount first)
 *   line total      = (unit price + selected modifiers) * quantity
 * Paid modifiers are never discounted (#36-37). Money is `Prisma.Decimal`
 * only; a percentage discount is rounded HALF-UP to 2 decimals, per UNIT, so
 * `unit price * quantity` always equals what the Guest was shown.
 */

export type ProductDiscountKind = 'PERCENTAGE' | 'FIXED_AMOUNT';

/** The stored discount configuration of one product (calendar dates as `YYYY-MM-DD`). */
export interface ProductDiscountConfig {
  type: ProductDiscountKind | null;
  value: Prisma.Decimal | null;
  enabled: boolean;
  startsOn: string | null;
  endsOn: string | null;
}

/**
 * NONE: no discount configured. DISABLED: configured but switched off.
 * SCHEDULED: enabled, starts in the future. ACTIVE: applies today.
 * EXPIRED: enabled, its end date has passed.
 */
export type ProductDiscountState =
  'NONE' | 'DISABLED' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';

export interface AppliedProductDiscount {
  type: ProductDiscountKind;
  value: Prisma.Decimal;
  /** Discount taken off ONE unit of the base price (2 decimals, never above the base price). */
  unitDiscount: Prisma.Decimal;
  /** Base price minus the unit discount (never negative). */
  discountedPrice: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Prisma returns a `@db.Date` column as a UTC-midnight `Date`; the calendar date is its UTC date part. */
export function dateOnlyString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** `YYYY-MM-DD` -> a UTC-midnight `Date` suitable for a `@db.Date` column. */
export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30, month 13, ...). */
export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The calendar date at `now` in an IANA timezone (the Branch timezone, never
 * the server's). An unknown timezone falls back to UTC rather than failing a
 * menu read.
 */
export function localDateIn(timezone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through to UTC
  }
  return now.toISOString().slice(0, 10);
}

export function discountState(
  config: ProductDiscountConfig,
  today: string,
): ProductDiscountState {
  if (!config.type || !config.value) return 'NONE';
  if (!config.enabled) return 'DISABLED';
  if (config.startsOn !== null && today < config.startsOn) return 'SCHEDULED';
  if (config.endsOn !== null && today > config.endsOn) return 'EXPIRED';
  return 'ACTIVE';
}

/** Discount for ONE unit of `basePrice`, rounded half-up to 2 decimals and capped at the price (spec #41). */
export function computeUnitDiscount(
  basePrice: Prisma.Decimal,
  type: ProductDiscountKind,
  value: Prisma.Decimal,
): Prisma.Decimal {
  const raw =
    type === 'PERCENTAGE'
      ? basePrice.times(value).dividedBy(HUNDRED)
      : value;
  const rounded = raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (rounded.lessThan(ZERO)) return ZERO;
  return rounded.greaterThan(basePrice) ? basePrice : rounded;
}

/**
 * The discount that applies at `today`, or `null` (also `null` when it would
 * take nothing off, so a Guest is never shown a fake crossed-out price).
 */
export function resolveActiveDiscount(
  basePrice: Prisma.Decimal,
  config: ProductDiscountConfig,
  today: string,
): AppliedProductDiscount | null {
  if (discountState(config, today) !== 'ACTIVE') return null;
  if (!config.type || !config.value) return null;
  const unitDiscount = computeUnitDiscount(basePrice, config.type, config.value);
  if (!unitDiscount.greaterThan(ZERO)) return null;
  return {
    type: config.type,
    value: config.value,
    unitDiscount,
    discountedPrice: basePrice.minus(unitDiscount),
  };
}
