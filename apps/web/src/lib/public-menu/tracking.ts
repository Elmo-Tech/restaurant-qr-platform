import { apiFetch } from '../api/client';
import { ApiError } from '../api/errors';

/** Guest order tracking (DEC-042): the Backend's safe view of one order, and this device's memory of the orders it placed. */

export type TrackStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

export type TrackType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

export interface OrderTracking {
  ref: string;
  type: TrackType;
  status: TrackStatus;
  createdAt: string;
  updatedAt: string;
  flow: TrackStatus[];
  events: { status: TrackStatus; at: string }[];
  itemCount: number;
  total: string;
  currencyCode: string;
  branchName: string | null;
  tableNumber: string | null;
}

/** Nothing more will change for these. */
export const FINAL_STATUSES: readonly TrackStatus[] = ['SERVED', 'REJECTED', 'CANCELLED'];

export const isFinal = (status: TrackStatus): boolean => FINAL_STATUSES.includes(status);

export type TrackResult =
  | { outcome: 'found'; data: OrderTracking }
  | { outcome: 'gone' }
  | { outcome: 'error' };

/** One order by the id this device was given when it was placed. `gone` = the Backend does not know it (any more). */
export async function getOrderTracking(publicCode: string, orderId: string, lang: string): Promise<TrackResult> {
  try {
    const body = await apiFetch<{ data: OrderTracking }>(
      `/public/qr/${encodeURIComponent(publicCode)}/orders/${encodeURIComponent(orderId)}/tracking?lang=${encodeURIComponent(lang)}`,
    );
    return { outcome: 'found', data: body.data };
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? { outcome: 'gone' } : { outcome: 'error' };
  }
}

export type LookupResult =
  | { outcome: 'found'; data: OrderTracking[] }
  | { outcome: 'invalidPhone' }
  | { outcome: 'error' };

/** Recent Pickup / Delivery orders placed with this phone number (for a Guest on another device). */
export async function lookupOrdersByPhone(publicCode: string, phone: string, lang: string): Promise<LookupResult> {
  try {
    const body = await apiFetch<{ data: OrderTracking[] }>(
      `/public/qr/${encodeURIComponent(publicCode)}/orders/lookup`,
      { method: 'POST', body: { phone, locale: lang } },
    );
    return { outcome: 'found', data: body.data };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PHONE_INVALID') return { outcome: 'invalidPhone' };
    return { outcome: 'error' };
  }
}

// ---------------------------------------------------------------- this device

interface StoredOrder {
  id: string;
  placedAt: number;
}

const KEEP_MS = 48 * 60 * 60 * 1000;
const MAX_STORED = 5;
const storageKey = (publicCode: string): string => `qr-orders:${publicCode}`;

/** The orders this device placed from this menu, newest first. Never throws: no storage means no memory. */
export function readTrackedOrders(publicCode: string): StoredOrder[] {
  try {
    const raw = window.localStorage.getItem(storageKey(publicCode));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter(
        (entry): entry is StoredOrder =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as StoredOrder).id === 'string' &&
          typeof (entry as StoredOrder).placedAt === 'number' &&
          now - (entry as StoredOrder).placedAt < KEEP_MS,
      )
      .sort((a, b) => b.placedAt - a.placedAt)
      .slice(0, MAX_STORED);
  } catch {
    return [];
  }
}

export function rememberOrder(publicCode: string, orderId: string): void {
  try {
    const next = [{ id: orderId, placedAt: Date.now() }, ...readTrackedOrders(publicCode).filter((o) => o.id !== orderId)].slice(
      0,
      MAX_STORED,
    );
    window.localStorage.setItem(storageKey(publicCode), JSON.stringify(next));
  } catch {
    // Storage blocked: tracking by phone number still works.
  }
}

export function forgetOrder(publicCode: string, orderId: string): void {
  try {
    const next = readTrackedOrders(publicCode).filter((o) => o.id !== orderId);
    window.localStorage.setItem(storageKey(publicCode), JSON.stringify(next));
  } catch {
    // ignore
  }
}
