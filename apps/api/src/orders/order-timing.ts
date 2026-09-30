import type { OrderStatus, OrderType } from '../generated/prisma/client';

/**
 * FT-11 Section 3: Order timing, calculated ONLY from authoritative
 * `OrderStatusEvent` rows (never fabricated). Every duration here is
 * `number | null` in whole seconds -- `null` means the underlying event(s)
 * do not exist for this Order (most commonly a pre-FT-11 historical Order,
 * which was backfilled with only its creation event, or an Order that
 * simply has not reached that stage yet), and the caller must render that
 * as "unavailable"/"--", never as `0` or an invented value.
 */
export interface OrderTimingEvent {
  newStatus: OrderStatus;
  transitionedAt: Date;
}

export interface OrderTimingDurations {
  /** now - createdAt. Always available -- every Order has a createdAt. */
  ageSeconds: number;
  /** createdAt -> first ACCEPTED. */
  acceptanceSeconds: number | null;
  /** first PREPARING -> first READY. */
  preparationSeconds: number | null;
  /** first READY -> the next customer-facing step (SERVED for DINE_IN/PICKUP, OUT_FOR_DELIVERY for DELIVERY). */
  readyWaitSeconds: number | null;
  /** PICKUP only: createdAt -> first SERVED. Null for every other type. */
  pickupFulfillmentSeconds: number | null;
  /** DELIVERY only: first OUT_FOR_DELIVERY -> first SERVED. Null for every other type. */
  deliveryFulfillmentSeconds: number | null;
  /** createdAt -> first SERVED, any type. */
  totalFulfillmentSeconds: number | null;
}

function diffSeconds(later: Date, earlier: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 1000));
}

/** Earliest recorded transition INTO `status`, or null if the Order never (yet) reached it. */
function firstReachedAt(events: readonly OrderTimingEvent[], status: OrderStatus): Date | null {
  let earliest: Date | null = null;
  for (const event of events) {
    if (event.newStatus !== status) continue;
    if (earliest === null || event.transitionedAt < earliest) {
      earliest = event.transitionedAt;
    }
  }
  return earliest;
}

export function calculateOrderTiming(params: {
  type: OrderType;
  createdAt: Date;
  events: readonly OrderTimingEvent[];
  now?: Date;
}): OrderTimingDurations {
  const now = params.now ?? new Date();
  const acceptedAt = firstReachedAt(params.events, 'ACCEPTED');
  const preparingAt = firstReachedAt(params.events, 'PREPARING');
  const readyAt = firstReachedAt(params.events, 'READY');
  const outForDeliveryAt = firstReachedAt(params.events, 'OUT_FOR_DELIVERY');
  const servedAt = firstReachedAt(params.events, 'SERVED');

  const readyWaitEndAt = params.type === 'DELIVERY' ? outForDeliveryAt : servedAt;

  return {
    ageSeconds: diffSeconds(now, params.createdAt),
    acceptanceSeconds: acceptedAt ? diffSeconds(acceptedAt, params.createdAt) : null,
    preparationSeconds: preparingAt && readyAt ? diffSeconds(readyAt, preparingAt) : null,
    readyWaitSeconds: readyAt && readyWaitEndAt ? diffSeconds(readyWaitEndAt, readyAt) : null,
    pickupFulfillmentSeconds:
      params.type === 'PICKUP' && servedAt ? diffSeconds(servedAt, params.createdAt) : null,
    deliveryFulfillmentSeconds:
      params.type === 'DELIVERY' && outForDeliveryAt && servedAt
        ? diffSeconds(servedAt, outForDeliveryAt)
        : null,
    totalFulfillmentSeconds: servedAt ? diffSeconds(servedAt, params.createdAt) : null,
  };
}

/** Average of the non-null values only; null (not 0) when there is nothing to average -- never fabricate an average from zero samples. */
export function averageOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const sum = present.reduce((total, value) => total + value, 0);
  return Math.round(sum / present.length);
}
