/**
 * Guest order tracking (DEC-042, slice 5): the pure rules. No I/O.
 */

import { toWesternDigits } from './guest-order-fields';

export type TrackableStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

export type TrackableType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

/**
 * The steps an order of this type walks through, in order, for the Guest's progress line
 * (REJECTED and CANCELLED are endings of their own, not steps). Delivery has the extra
 * "on the way" step; the other types never use it (see `order-transitions.ts`).
 */
export function flowFor(type: TrackableType): TrackableStatus[] {
  return type === 'DELIVERY'
    ? [
        'PENDING',
        'ACCEPTED',
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'SERVED',
      ]
    : ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];
}

/** A short code a Guest can read out ("A1B2C3D4"); display only, never an authority. */
export function trackingRef(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

const PHONE_KEY_DIGITS = 10;
const MIN_PHONE_DIGITS = 7;

/** Digits only; Arabic-Indic / Eastern Arabic digits count as the digits they are. */
export function phoneDigits(value: string): string {
  return toWesternDigits(value).replace(/\D/g, '');
}

export function isPlausiblePhone(value: string): boolean {
  return phoneDigits(value).length >= MIN_PHONE_DIGITS;
}

/**
 * Do two phone numbers belong to the same line? "01012345678", "+20 10 1234 5678" and
 * "201012345678" all match: the comparison uses the last ten digits, so a country code or a
 * leading zero never matters. Anything shorter than seven digits never matches.
 */
export function samePhone(a: string | null, b: string): boolean {
  if (a === null) return false;
  const left = phoneDigits(a);
  const right = phoneDigits(b);
  if (left.length < MIN_PHONE_DIGITS || right.length < MIN_PHONE_DIGITS)
    return false;
  return left.slice(-PHONE_KEY_DIGITS) === right.slice(-PHONE_KEY_DIGITS);
}
