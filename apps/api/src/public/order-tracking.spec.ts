import {
  flowFor,
  isPlausiblePhone,
  samePhone,
  trackingRef,
} from './order-tracking';

describe('guest order tracking rules', () => {
  it('delivery has the "on the way" step and the others do not', () => {
    expect(flowFor('DELIVERY')).toContain('OUT_FOR_DELIVERY');
    expect(flowFor('PICKUP')).not.toContain('OUT_FOR_DELIVERY');
    expect(flowFor('DINE_IN')).toEqual([
      'PENDING',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'SERVED',
    ]);
    expect(flowFor('DELIVERY')[0]).toBe('PENDING');
    expect(flowFor('DELIVERY').at(-1)).toBe('SERVED');
  });

  it('builds a short upper-case reference from the order id', () => {
    expect(trackingRef('3f2a9c10-7b5d-4e2a-9d1c-0123456789ab')).toBe(
      '3F2A9C10',
    );
  });

  it('matches the same phone line whatever the format', () => {
    expect(samePhone('01012345678', '+20 10 1234 5678')).toBe(true);
    expect(samePhone('+201012345678', '01012345678')).toBe(true);
    expect(samePhone('201012345678', '(010) 1234-5678')).toBe(true);
    expect(samePhone('01012345678', '01012345679')).toBe(false);
    expect(samePhone(null, '01012345678')).toBe(false);
  });

  it('never matches short or empty numbers', () => {
    expect(samePhone('12345', '12345')).toBe(false);
    expect(samePhone('', '')).toBe(false);
    expect(isPlausiblePhone('12345')).toBe(false);
    expect(isPlausiblePhone('0101234')).toBe(true);
    expect(isPlausiblePhone('abc')).toBe(false);
  });
});
