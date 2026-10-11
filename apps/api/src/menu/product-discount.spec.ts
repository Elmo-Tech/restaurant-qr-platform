import { Prisma } from '../generated/prisma/client';
import {
  computeUnitDiscount,
  dateOnlyString,
  discountState,
  isValidCalendarDate,
  localDateIn,
  resolveActiveDiscount,
  type ProductDiscountConfig,
} from './product-discount';

const d = (value: string) => new Prisma.Decimal(value);

function config(overrides: Partial<ProductDiscountConfig> = {}): ProductDiscountConfig {
  return {
    type: 'PERCENTAGE',
    value: d('20'),
    enabled: true,
    startsOn: null,
    endsOn: null,
    ...overrides,
  };
}

describe('computeUnitDiscount', () => {
  it('percentage: 20% of 250.00 is 50.00 (spec acceptance example)', () => {
    expect(computeUnitDiscount(d('250.00'), 'PERCENTAGE', d('20')).toFixed(2)).toBe('50.00');
  });

  it('fixed: 30.00 off 180.00 (spec acceptance example)', () => {
    expect(computeUnitDiscount(d('180.00'), 'FIXED_AMOUNT', d('30')).toFixed(2)).toBe('30.00');
  });

  it('rounds half-up to 2 decimals, never with floating point', () => {
    // 15% of 10.05 = 1.5075 -> 1.51
    expect(computeUnitDiscount(d('10.05'), 'PERCENTAGE', d('15')).toFixed(2)).toBe('1.51');
    // 12.5% of 0.04 = 0.005 -> 0.01 (half-up), where binary floats would give 0.00 or 0.01 unpredictably
    expect(computeUnitDiscount(d('0.04'), 'PERCENTAGE', d('12.5')).toFixed(2)).toBe('0.01');
    // classic float trap: 0.1 + 0.2 style value
    expect(computeUnitDiscount(d('0.30'), 'PERCENTAGE', d('10')).toFixed(2)).toBe('0.03');
  });

  it('never exceeds the price (a fixed discount above the price is capped, never negative)', () => {
    expect(computeUnitDiscount(d('40.00'), 'FIXED_AMOUNT', d('50')).toFixed(2)).toBe('40.00');
    expect(computeUnitDiscount(d('40.00'), 'PERCENTAGE', d('100')).toFixed(2)).toBe('40.00');
  });
});

describe('discountState', () => {
  const today = '2026-10-11';

  it('NONE without a type/value, DISABLED when switched off', () => {
    expect(discountState(config({ type: null, value: null }), today)).toBe('NONE');
    expect(discountState(config({ enabled: false }), today)).toBe('DISABLED');
  });

  it('open-ended discounts are ACTIVE', () => {
    expect(discountState(config(), today)).toBe('ACTIVE');
  });

  it('date boundaries are inclusive on both ends', () => {
    expect(discountState(config({ startsOn: '2026-10-11' }), today)).toBe('ACTIVE');
    expect(discountState(config({ endsOn: '2026-10-11' }), today)).toBe('ACTIVE');
    expect(discountState(config({ startsOn: '2026-10-12' }), today)).toBe('SCHEDULED');
    expect(discountState(config({ endsOn: '2026-10-10' }), today)).toBe('EXPIRED');
  });

  it('a start-and-end window applies only inside it', () => {
    const window = config({ startsOn: '2026-10-05', endsOn: '2026-10-20' });
    expect(discountState(window, '2026-10-04')).toBe('SCHEDULED');
    expect(discountState(window, '2026-10-05')).toBe('ACTIVE');
    expect(discountState(window, '2026-10-20')).toBe('ACTIVE');
    expect(discountState(window, '2026-10-21')).toBe('EXPIRED');
  });
});

describe('resolveActiveDiscount', () => {
  it('returns the unit discount and discounted price when active', () => {
    const applied = resolveActiveDiscount(d('250.00'), config(), '2026-10-11');
    expect(applied?.unitDiscount.toFixed(2)).toBe('50.00');
    expect(applied?.discountedPrice.toFixed(2)).toBe('200.00');
  });

  it('returns null when disabled, scheduled or expired', () => {
    expect(resolveActiveDiscount(d('250.00'), config({ enabled: false }), '2026-10-11')).toBeNull();
    expect(
      resolveActiveDiscount(d('250.00'), config({ startsOn: '2027-01-01' }), '2026-10-11'),
    ).toBeNull();
    expect(
      resolveActiveDiscount(d('250.00'), config({ endsOn: '2026-01-01' }), '2026-10-11'),
    ).toBeNull();
  });

  it('returns null when the discount would take nothing off (never a fake markdown)', () => {
    expect(resolveActiveDiscount(d('0.00'), config(), '2026-10-11')).toBeNull();
  });
});

describe('localDateIn (Branch timezone, never the server timezone)', () => {
  const instant = new Date('2026-10-10T22:30:00.000Z');

  it('the same instant is a different calendar date in different zones', () => {
    expect(localDateIn('UTC', instant)).toBe('2026-10-10');
    // Egypt is UTC+3 in October 2026 (summer time): 01:30 the next day.
    expect(localDateIn('Africa/Cairo', instant)).toBe('2026-10-11');
    expect(localDateIn('America/Los_Angeles', instant)).toBe('2026-10-10');
    expect(localDateIn('Pacific/Kiritimati', instant)).toBe('2026-10-11');
  });

  it('falls back to UTC for an unknown timezone instead of failing a menu read', () => {
    expect(localDateIn('Not/AZone', instant)).toBe('2026-10-10');
  });
});

describe('calendar date helpers', () => {
  it('validates real calendar dates only', () => {
    expect(isValidCalendarDate('2026-10-11')).toBe(true);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('11/10/2026')).toBe(false);
    expect(isValidCalendarDate('2026-10-11T00:00:00Z')).toBe(false);
  });

  it('reads a @db.Date value as its calendar date', () => {
    expect(dateOnlyString(new Date('2026-10-11T00:00:00.000Z'))).toBe('2026-10-11');
    expect(dateOnlyString(null)).toBeNull();
  });
});
