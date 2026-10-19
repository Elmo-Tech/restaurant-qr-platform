import { Prisma } from '../../generated/prisma/client';
import {
  calculatePrice,
  currencyForCountry,
  listPriceFor,
  offerIsActive,
  paymentSummary,
  type PackagePrices,
} from './pricing';
import {
  addDays,
  formatDateOnly,
  parseDateOnly,
  periodEnd,
  subscriptionPhase,
  todayInCairo,
} from './subscription-dates';
import { decideSync, type SyncSubscription } from './subscription-sync';

const D = (value: string | number) => new Prisma.Decimal(value);
const date = (value: string) => parseDateOnly(value) as Date;

const pkg = (over: Partial<PackagePrices> = {}): PackagePrices => ({
  priceEgpMonthly: D(500),
  priceEgpYearly: D(5000),
  priceUsdMonthly: D(20),
  priceUsdYearly: null,
  offerPercent: null,
  offerLabel: null,
  offerEndsAt: null,
  ...over,
});

describe('billing currency and list price (DEC-049)', () => {
  it('bills Egypt in EGP and everywhere else in USD', () => {
    expect(currencyForCountry('EG')).toBe('EGP');
    expect(currencyForCountry('eg')).toBe('EGP');
    expect(currencyForCountry('SA')).toBe('USD');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('reads the price for the currency and period, null when not offered', () => {
    expect(listPriceFor(pkg(), 'EGP', 'MONTHLY')?.toFixed(2)).toBe('500.00');
    expect(listPriceFor(pkg(), 'EGP', 'YEARLY')?.toFixed(2)).toBe('5000.00');
    expect(listPriceFor(pkg(), 'USD', 'MONTHLY')?.toFixed(2)).toBe('20.00');
    expect(listPriceFor(pkg(), 'USD', 'YEARLY')).toBeNull();
  });
});

describe('package offer window', () => {
  const day = date('2026-11-10');

  it('is off without a percentage', () => {
    expect(offerIsActive(pkg(), day)).toBe(false);
  });

  it('is on without an end date', () => {
    expect(offerIsActive(pkg({ offerPercent: D(20) }), day)).toBe(true);
  });

  it('includes its last day and stops after it', () => {
    const offer = pkg({ offerPercent: D(20), offerEndsAt: date('2026-11-10') });
    expect(offerIsActive(offer, date('2026-11-10'))).toBe(true);
    expect(offerIsActive(offer, date('2026-11-11'))).toBe(false);
  });
});

describe('calculatePrice: list price, then the offer, then the customer discount', () => {
  const base = { currencyCode: 'EGP' as const, listPrice: D(1000) };

  it('keeps the list price when nothing is discounted', () => {
    const result = calculatePrice({ ...base, offer: null, discount: null });
    expect(result.finalPrice.toFixed(2)).toBe('1000.00');
    expect(result.offer).toBeNull();
    expect(result.discount).toBeNull();
  });

  it('applies the offer percentage', () => {
    const result = calculatePrice({
      ...base,
      offer: { label: 'Launch', percent: D(20) },
      discount: null,
    });
    expect(result.offer?.amount.toFixed(2)).toBe('200.00');
    expect(result.finalPrice.toFixed(2)).toBe('800.00');
  });

  it('stacks the customer percentage on the price AFTER the offer', () => {
    const result = calculatePrice({
      ...base,
      offer: { label: null, percent: D(20) },
      discount: { type: 'PERCENT', value: D(10) },
    });
    // 1000 - 200 = 800; 10% of 800 = 80 -> 720 (not 10% of 1000)
    expect(result.discount?.amount.toFixed(2)).toBe('80.00');
    expect(result.finalPrice.toFixed(2)).toBe('720.00');
  });

  it('takes a fixed customer amount off', () => {
    const result = calculatePrice({
      ...base,
      offer: null,
      discount: { type: 'AMOUNT', value: D(150) },
    });
    expect(result.finalPrice.toFixed(2)).toBe('850.00');
  });

  it('never goes below zero', () => {
    const result = calculatePrice({
      ...base,
      offer: { label: null, percent: D(100) },
      discount: { type: 'AMOUNT', value: D(50) },
    });
    expect(result.discount?.amount.toFixed(2)).toBe('0.00');
    expect(result.finalPrice.toFixed(2)).toBe('0.00');

    const over = calculatePrice({
      ...base,
      offer: null,
      discount: { type: 'AMOUNT', value: D(5000) },
    });
    expect(over.discount?.amount.toFixed(2)).toBe('1000.00');
    expect(over.finalPrice.toFixed(2)).toBe('0.00');
  });

  it('rounds half-up to two decimals without floating point drift', () => {
    const result = calculatePrice({
      currencyCode: 'USD',
      listPrice: D('0.10'),
      offer: null,
      discount: { type: 'PERCENT', value: D('33.33') },
    });
    // 0.10 * 33.33% = 0.03333 -> 0.03
    expect(result.discount?.amount.toFixed(2)).toBe('0.03');
    expect(result.finalPrice.toFixed(2)).toBe('0.07');

    const half = calculatePrice({
      currencyCode: 'EGP',
      listPrice: D('10.05'),
      offer: { label: null, percent: D(50) },
      discount: null,
    });
    // 10.05 * 50% = 5.025 -> 5.03 (half-up)
    expect(half.offer?.amount.toFixed(2)).toBe('5.03');
    expect(half.finalPrice.toFixed(2)).toBe('5.02');
  });

  it('always has final = list - offer - discount, so the stored snapshot adds up', () => {
    const result = calculatePrice({
      ...base,
      listPrice: D('799.99'),
      offer: { label: null, percent: D('12.5') },
      discount: { type: 'PERCENT', value: D('7.5') },
    });
    expect(
      result.listPrice
        .sub(result.offer?.amount ?? 0)
        .sub(result.discount?.amount ?? 0)
        .equals(result.finalPrice),
    ).toBe(true);
  });
});

describe('paymentSummary', () => {
  it('is unpaid with no payments', () => {
    const s = paymentSummary(D(800), []);
    expect(s.status).toBe('UNPAID');
    expect(s.balance.toFixed(2)).toBe('800.00');
  });

  it('is partial, then paid, then overpaid', () => {
    expect(paymentSummary(D(800), [D(300)]).status).toBe('PARTIAL');
    expect(paymentSummary(D(800), [D(300), D(500)]).status).toBe('PAID');
    const over = paymentSummary(D(800), [D(900)]);
    expect(over.status).toBe('OVERPAID');
    expect(over.balance.toFixed(2)).toBe('-100.00');
  });

  it('treats a free subscription as paid', () => {
    expect(paymentSummary(D(0), []).status).toBe('PAID');
  });
});

describe('period dates', () => {
  it('rejects things that are not real calendar dates', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('26-1-1')).toBeNull();
    expect(formatDateOnly(date('2026-10-19'))).toBe('2026-10-19');
  });

  it('adds a month on the same day, clamping to the end of a short month', () => {
    expect(formatDateOnly(periodEnd(date('2026-10-19'), 'MONTHLY'))).toBe(
      '2026-11-19',
    );
    expect(formatDateOnly(periodEnd(date('2026-01-31'), 'MONTHLY'))).toBe(
      '2026-02-28',
    );
    expect(formatDateOnly(periodEnd(date('2028-01-31'), 'MONTHLY'))).toBe(
      '2028-02-29',
    );
    expect(formatDateOnly(periodEnd(date('2026-12-15'), 'MONTHLY'))).toBe(
      '2027-01-15',
    );
  });

  it('adds a year, clamping 29 February', () => {
    expect(formatDateOnly(periodEnd(date('2026-10-19'), 'YEARLY'))).toBe(
      '2027-10-19',
    );
    expect(formatDateOnly(periodEnd(date('2028-02-29'), 'YEARLY'))).toBe(
      '2029-02-28',
    );
  });

  it('uses the date in Cairo, not in UTC', () => {
    // 22:30 UTC on 19 Oct is already 20 Oct in Cairo (UTC+3 in summer time, +2 otherwise)
    expect(formatDateOnly(todayInCairo(new Date('2026-10-19T22:30:00Z')))).toBe(
      '2026-10-20',
    );
    expect(formatDateOnly(todayInCairo(new Date('2026-10-19T10:00:00Z')))).toBe(
      '2026-10-19',
    );
  });
});

describe('subscriptionPhase', () => {
  const sub = {
    status: 'ACTIVE' as const,
    startsAt: date('2026-11-01'),
    endsAt: date('2026-12-01'),
  };

  it('is upcoming before the start', () => {
    expect(subscriptionPhase(sub, date('2026-10-30'), 7).phase).toBe(
      'UPCOMING',
    );
  });

  it('is active on the first day and counts the days left', () => {
    const first = subscriptionPhase(sub, date('2026-11-01'), 7);
    expect(first.phase).toBe('ACTIVE');
    expect(first.daysLeft).toBe(30);
    expect(subscriptionPhase(sub, date('2026-11-30'), 7).daysLeft).toBe(1);
  });

  it('is in grace on the end date and for the grace days after it', () => {
    const onEnd = subscriptionPhase(sub, date('2026-12-01'), 7);
    expect(onEnd.phase).toBe('GRACE');
    expect(onEnd.graceDaysLeft).toBe(7);
    expect(subscriptionPhase(sub, date('2026-12-07'), 7).phase).toBe('GRACE');
  });

  it('is expired once the grace days are used', () => {
    expect(subscriptionPhase(sub, date('2026-12-08'), 7).phase).toBe('EXPIRED');
  });

  it('with no grace it expires on the end date', () => {
    expect(subscriptionPhase(sub, date('2026-12-01'), 0).phase).toBe('EXPIRED');
  });

  it('a cancelled subscription is cancelled whatever the date', () => {
    expect(
      subscriptionPhase({ ...sub, status: 'CANCELLED' }, date('2026-11-10'), 7)
        .phase,
    ).toBe('CANCELLED');
  });
});

describe('decideSync: what a Restaurant should become today', () => {
  const sub = (over: Partial<SyncSubscription>): SyncSubscription => ({
    status: 'ACTIVE',
    packageId: 'pkg-a',
    startsAt: date('2026-10-01'),
    endsAt: date('2026-11-01'),
    ...over,
  });
  const restaurant = (over = {}) => ({
    status: 'ACTIVE' as const,
    packageId: 'pkg-a',
    subscriptionSuspendedAt: null as Date | null,
    subscriptionOverrideAt: null as Date | null,
    ...over,
  });
  const run = (
    today: string,
    subs: SyncSubscription[],
    r = restaurant(),
    graceDays = 7,
  ) =>
    decideSync({
      today: date(today),
      graceDays,
      restaurant: r,
      subscriptions: subs,
    });

  it('never touches a Restaurant that never had a subscription', () => {
    expect(run('2030-01-01', [])).toEqual({});
    expect(
      run('2030-01-01', [], restaurant({ status: 'ACTIVE', packageId: null })),
    ).toEqual({});
  });

  it('puts the Restaurant on the package of the subscription covering today', () => {
    expect(
      run('2026-10-15', [sub({})], restaurant({ packageId: null })),
    ).toEqual({
      setPackageId: 'pkg-a',
    });
    expect(run('2026-10-15', [sub({})])).toEqual({});
  });

  it('switches package when a renewal on another package starts', () => {
    const subs = [
      sub({}),
      sub({
        packageId: 'pkg-b',
        startsAt: date('2026-11-01'),
        endsAt: date('2026-12-01'),
      }),
    ];
    expect(run('2026-10-31', subs)).toEqual({});
    expect(run('2026-11-01', subs)).toEqual({ setPackageId: 'pkg-b' });
  });

  it('keeps serving the Restaurant during the grace period', () => {
    expect(run('2026-11-01', [sub({})])).toEqual({});
    expect(run('2026-11-07', [sub({})])).toEqual({});
  });

  it('suspends once the grace period is over', () => {
    expect(run('2026-11-08', [sub({})])).toEqual({ suspend: true });
    expect(run('2027-03-01', [sub({})])).toEqual({ suspend: true });
  });

  it('does not suspend a Restaurant that is not active, and never twice', () => {
    expect(
      run('2026-11-20', [sub({})], restaurant({ status: 'SUSPENDED' })),
    ).toEqual({});
    expect(
      run('2026-11-20', [sub({})], restaurant({ status: 'INACTIVE' })),
    ).toEqual({});
  });

  it('ignores cancelled subscriptions', () => {
    expect(run('2026-12-20', [sub({ status: 'CANCELLED' })])).toEqual({});
  });

  it('does not suspend while only a future subscription exists', () => {
    expect(run('2026-09-01', [sub({})])).toEqual({});
  });

  it('reactivates a Restaurant the platform suspended when a subscription covers today', () => {
    const suspended = restaurant({
      status: 'SUSPENDED',
      subscriptionSuspendedAt: new Date('2026-11-08T00:00:00Z'),
    });
    const renewal = sub({
      startsAt: date('2026-11-20'),
      endsAt: date('2026-12-20'),
    });
    expect(run('2026-11-21', [sub({}), renewal], suspended)).toEqual({
      reactivate: true,
    });
  });

  it('never reactivates a Restaurant that an administrator suspended', () => {
    const manual = restaurant({
      status: 'SUSPENDED',
      subscriptionSuspendedAt: null,
    });
    expect(run('2026-10-15', [sub({})], manual)).toEqual({});
  });

  it('leaves a lapse alone that the team reactivated by hand, but not the next one', () => {
    const reactivated = restaurant({
      subscriptionOverrideAt: new Date('2026-11-20T09:00:00Z'),
    });
    // ended 1 Nov, grace to 8 Nov: the hand reactivation on 20 Nov covers that lapse
    expect(run('2026-11-25', [sub({})], reactivated)).toEqual({});
    // a renewal that ends on 1 Jan lapses later than the override: enforced again
    const renewal = sub({
      startsAt: date('2026-11-21'),
      endsAt: date('2027-01-01'),
    });
    expect(run('2027-01-09', [sub({}), renewal], reactivated)).toEqual({
      suspend: true,
    });
  });

  it('works with the day arithmetic around a month end', () => {
    const s = sub({
      startsAt: date('2026-01-31'),
      endsAt: periodEnd(date('2026-01-31'), 'MONTHLY'),
    });
    expect(formatDateOnly(s.endsAt)).toBe('2026-02-28');
    expect(run('2026-02-28', [s])).toEqual({});
    expect(run(formatDateOnly(addDays(s.endsAt, 7)), [s])).toEqual({
      suspend: true,
    });
  });
});
