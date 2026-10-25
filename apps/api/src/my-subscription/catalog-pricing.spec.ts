import { Prisma } from '../generated/prisma/client';
import { cataloguePricing } from './catalog-pricing';

const Decimal = Prisma.Decimal;
const pkg = (discount: string | null, endsAt: Date | null = null) => ({
  priceEgpMonthly: new Decimal('1200.00'),
  priceEgpYearly: new Decimal('12000.00'),
  priceUsdMonthly: new Decimal('30.00'),
  priceUsdYearly: null,
  offerPercent: discount ? new Decimal(discount) : null,
  offerLabel: null,
  offerEndsAt: endsAt,
});

describe('Public catalogue pricing for current and upgrade plans', () => {
  it('shows original prices and exact after-offer prices, separately', () => {
    expect(cataloguePricing(pkg('50'), 'EGP', new Date('2026-10-26T12:00:00Z'))).toEqual({
      priceMonthly: '1200.00',
      priceYearly: '12000.00',
      discountedMonthly: '600.00',
      discountedYearly: '6000.00',
      offer: { percent: '50.00', label: null, endsAt: null },
    });
  });
  it('does not apply an expired offer or invent a missing period price', () => {
    const old = pkg('50', new Date('2026-10-20T00:00:00Z'));
    expect(cataloguePricing(old, 'USD', new Date('2026-10-26T00:00:00Z'))).toEqual({
      priceMonthly: '30.00',
      priceYearly: null,
      discountedMonthly: null,
      discountedYearly: null,
      offer: null,
    });
  });
  it('uses billing half-up rounding, not floating-point price multiplication', () => {
    const tricky = {
      ...pkg('15'),
      priceEgpMonthly: new Decimal('99.99'),
    };
    expect(cataloguePricing(tricky, 'EGP', new Date('2026-10-26T00:00:00Z')).discountedMonthly)
      .toBe('84.99');
  });
  it('retains prices without an offer', () => {
    expect(cataloguePricing(pkg(null), 'EGP', new Date('2026-10-26T00:00:00Z')).offer).toBeNull();
  });
});
