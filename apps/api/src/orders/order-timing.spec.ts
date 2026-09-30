import { averageOf, calculateOrderTiming, type OrderTimingEvent } from './order-timing';

const CREATED_AT = new Date('2026-09-30T12:00:00.000Z');

function at(minutesAfterCreation: number): Date {
  return new Date(CREATED_AT.getTime() + minutesAfterCreation * 60_000);
}

describe('calculateOrderTiming', () => {
  it('computes ageSeconds from createdAt to now regardless of status history', () => {
    const now = at(5);
    const result = calculateOrderTiming({ type: 'PICKUP', createdAt: CREATED_AT, events: [], now });
    expect(result.ageSeconds).toBe(5 * 60);
  });

  it('returns null for every duration that has no supporting events (pre-FT-11 backfilled Order)', () => {
    const events: OrderTimingEvent[] = [{ newStatus: 'PENDING', transitionedAt: CREATED_AT }];
    const result = calculateOrderTiming({ type: 'DINE_IN', createdAt: CREATED_AT, events, now: at(30) });
    expect(result.acceptanceSeconds).toBeNull();
    expect(result.preparationSeconds).toBeNull();
    expect(result.readyWaitSeconds).toBeNull();
    expect(result.totalFulfillmentSeconds).toBeNull();
  });

  it('calculates the full DINE_IN / PICKUP lifecycle (PENDING -> ACCEPTED -> PREPARING -> READY -> SERVED)', () => {
    const events: OrderTimingEvent[] = [
      { newStatus: 'PENDING', transitionedAt: CREATED_AT },
      { newStatus: 'ACCEPTED', transitionedAt: at(2) },
      { newStatus: 'PREPARING', transitionedAt: at(3) },
      { newStatus: 'READY', transitionedAt: at(15) },
      { newStatus: 'SERVED', transitionedAt: at(20) },
    ];
    const result = calculateOrderTiming({ type: 'PICKUP', createdAt: CREATED_AT, events, now: at(25) });

    expect(result.acceptanceSeconds).toBe(2 * 60);
    expect(result.preparationSeconds).toBe(12 * 60);
    expect(result.readyWaitSeconds).toBe(5 * 60);
    expect(result.pickupFulfillmentSeconds).toBe(20 * 60);
    expect(result.deliveryFulfillmentSeconds).toBeNull();
    expect(result.totalFulfillmentSeconds).toBe(20 * 60);
  });

  it('calculates the DELIVERY lifecycle (READY -> OUT_FOR_DELIVERY -> SERVED), never PICKUP fulfillment', () => {
    const events: OrderTimingEvent[] = [
      { newStatus: 'PENDING', transitionedAt: CREATED_AT },
      { newStatus: 'ACCEPTED', transitionedAt: at(1) },
      { newStatus: 'PREPARING', transitionedAt: at(2) },
      { newStatus: 'READY', transitionedAt: at(10) },
      { newStatus: 'OUT_FOR_DELIVERY', transitionedAt: at(12) },
      { newStatus: 'SERVED', transitionedAt: at(30) },
    ];
    const result = calculateOrderTiming({ type: 'DELIVERY', createdAt: CREATED_AT, events, now: at(35) });

    expect(result.readyWaitSeconds).toBe(2 * 60); // READY -> OUT_FOR_DELIVERY, not READY -> SERVED
    expect(result.deliveryFulfillmentSeconds).toBe(18 * 60); // OUT_FOR_DELIVERY -> SERVED
    expect(result.pickupFulfillmentSeconds).toBeNull();
    expect(result.totalFulfillmentSeconds).toBe(30 * 60);
  });

  it('does not fabricate a duration for a stage the Order has not yet reached', () => {
    const events: OrderTimingEvent[] = [
      { newStatus: 'PENDING', transitionedAt: CREATED_AT },
      { newStatus: 'ACCEPTED', transitionedAt: at(2) },
    ];
    const result = calculateOrderTiming({ type: 'DINE_IN', createdAt: CREATED_AT, events, now: at(5) });

    expect(result.acceptanceSeconds).toBe(2 * 60);
    expect(result.preparationSeconds).toBeNull();
    expect(result.readyWaitSeconds).toBeNull();
    expect(result.totalFulfillmentSeconds).toBeNull();
  });

  it('uses the earliest occurrence of a repeated status (defensive against any future duplicate event)', () => {
    const events: OrderTimingEvent[] = [
      { newStatus: 'PENDING', transitionedAt: CREATED_AT },
      { newStatus: 'ACCEPTED', transitionedAt: at(5) },
      { newStatus: 'ACCEPTED', transitionedAt: at(9) },
    ];
    const result = calculateOrderTiming({ type: 'DINE_IN', createdAt: CREATED_AT, events, now: at(10) });
    expect(result.acceptanceSeconds).toBe(5 * 60);
  });
});

describe('averageOf', () => {
  it('returns null for an empty dataset rather than 0', () => {
    expect(averageOf([])).toBeNull();
  });

  it('returns null when every value is null (no Order in the set reached that stage)', () => {
    expect(averageOf([null, null, null])).toBeNull();
  });

  it('averages only the non-null values, ignoring Orders that never reached the stage', () => {
    expect(averageOf([60, null, 120, null])).toBe(90);
  });
});
