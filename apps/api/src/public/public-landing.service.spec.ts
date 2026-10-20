import { Prisma } from '../generated/prisma/client';
import { PublicLandingService } from './public-landing.service';

const D = (value: string) => new Prisma.Decimal(value);

function makeService(overrides: {
  packages?: unknown[];
  openLead?: boolean;
  activePackage?: { id: string; name: string } | null;
}) {
  const create = jest.fn().mockResolvedValue({});
  const prisma = {
    package: {
      findMany: jest.fn().mockResolvedValue(overrides.packages ?? []),
      findFirst: jest.fn().mockResolvedValue(overrides.activePackage ?? null),
    },
    signupLead: {
      findFirst: jest
        .fn()
        .mockResolvedValue(overrides.openLead ? { id: 'lead-1' } : null),
      create,
    },
  };
  return {
    service: new PublicLandingService(prisma as never),
    create,
  };
}

const basePackage = {
  id: 'p1',
  name: 'احترافية',
  nameEn: 'Pro',
  description: 'كل ما يحتاجه المطعم',
  descriptionEn: 'Everything a restaurant needs',
  priceEgpMonthly: D('1000'),
  priceEgpYearly: D('10000'),
  priceUsdMonthly: null,
  priceUsdYearly: null,
  offerPercent: null,
  offerLabel: null,
  offerEndsAt: null,
  allTemplates: false,
  allStandardTemplates: true,
  features: [{ feature: 'MENU_TEMPLATES' }],
  templates: [{ template: 'MENU' }],
};

describe('PublicLandingService.plans (DEC-053)', () => {
  it('applies an active offer to the price and keeps the list price', async () => {
    const { service } = makeService({
      packages: [
        { ...basePackage, offerPercent: D('20'), offerLabel: 'Launch' },
      ],
    });
    const [plan] = await service.plans();
    const monthly = plan.prices.find(
      (p) => p.currencyCode === 'EGP' && p.period === 'MONTHLY',
    );
    expect(monthly).toEqual({
      currencyCode: 'EGP',
      period: 'MONTHLY',
      amount: '800.00',
      listAmount: '1000.00',
    });
    expect(plan.offer?.percent).toBe('20.00');
  });

  it('omits prices the package does not offer and counts designs by tier', async () => {
    const { service } = makeService({ packages: [basePackage] });
    const [plan] = await service.plans();
    expect(plan.prices.every((p) => p.currencyCode === 'EGP')).toBe(true);
    expect(plan.designs).toEqual({ standard: 4, premium: 1 });
    expect(plan.offer).toBeNull();
    expect(plan.name).toEqual({ ar: 'احترافية', en: 'Pro' });
    expect(plan.description).toEqual({
      ar: 'كل ما يحتاجه المطعم',
      en: 'Everything a restaurant needs',
    });
  });

  it('lists the cheapest package first', async () => {
    const { service } = makeService({
      packages: [
        { ...basePackage, id: 'a', name: 'A', priceEgpMonthly: D('2000') },
        { ...basePackage, id: 'b', name: 'B', priceEgpMonthly: D('500') },
      ],
    });
    expect((await service.plans()).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('PublicLandingService.createLead (DEC-053)', () => {
  const input = {
    kind: 'SUBSCRIBE' as const,
    packageId: 'p1',
    name: ' Sara ',
    email: 'Sara@Example.com ',
    phone: '+20 100 000 0000',
    restaurantName: null,
    message: null,
    locale: 'ar' as const,
  };

  it('stores the request with a normalised e-mail and the package name', async () => {
    const { service, create } = makeService({
      activePackage: { id: 'p1', name: 'Pro' },
    });
    await expect(service.createLead(input)).resolves.toBe('created');
    expect(create).toHaveBeenCalledWith({
      data: {
        kind: 'SUBSCRIBE',
        packageId: 'p1',
        packageName: 'Pro',
        email: 'sara@example.com',
        name: 'Sara',
        phone: '+20 100 000 0000',
        restaurantName: null,
        message: null,
        locale: 'ar',
      },
    });
  });

  it('does not store a second request while the first is still open', async () => {
    const { service, create } = makeService({ openLead: true });
    await expect(service.createLead(input)).resolves.toBe('duplicate');
    expect(create).not.toHaveBeenCalled();
  });

  it('still stores a request for an unknown or archived package, without it', async () => {
    const { service, create } = makeService({ activePackage: null });
    await service.createLead(input);
    expect(create).toHaveBeenCalledWith({
      data: {
        kind: 'SUBSCRIBE',
        packageId: null,
        packageName: null,
        email: 'sara@example.com',
        name: 'Sara',
        phone: '+20 100 000 0000',
        restaurantName: null,
        message: null,
        locale: 'ar',
      },
    });
  });
});
