import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { PlatformAuditService } from '../platform/platform-audit.service';
import { MySubscriptionService } from './my-subscription.service';

const Decimal = Prisma.Decimal;
const price = (value: string) => new Decimal(value);
const mkPlan = (id: string, name: string, monthly: string, features: string[], status = 'ACTIVE') => ({
  id,
  name,
  description: null,
  status,
  priceEgpMonthly: price(monthly),
  priceEgpYearly: price(String(Number(monthly) * 10)),
  priceUsdMonthly: null,
  priceUsdYearly: null,
  offerPercent: price('50.00'),
  offerLabel: 'Launch offer',
  offerEndsAt: null,
  allTemplates: false,
  allStandardTemplates: false,
  features: features.map(feature => ({ feature })),
  templates: [],
});

describe('MySubscriptionService.view: full plan comparison', () => {
  it('returns all four active tiers to PLUS subscribers while restricting upgrade targets', async () => {
    const basic = mkPlan('basic-id', 'BASIC', '500.00', ['MENU_TEMPLATES']);
    const plus = mkPlan('plus-id', 'PLUS', '600.00', ['MENU_TEMPLATES', 'WHATSAPP_ORDERING']);
    const pro = mkPlan('pro-id', 'PRO', '800.00', [
      'MENU_TEMPLATES', 'WHATSAPP_ORDERING', 'ORDER_TRACKING', 'DASHBOARD_ORDERING',
    ]);
    const premium = mkPlan('premium-id', 'Premium', '1000.00', [
      'MENU_TEMPLATES', 'WHATSAPP_ORDERING', 'ORDER_TRACKING',
      'DASHBOARD_ORDERING', 'SMART_SUGGESTIONS', 'TABLE_ORDERING', 'KITCHEN',
    ]);
    const archived = mkPlan('archived-id', 'OLD', '100.00', [], 'ARCHIVED');
    const prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          countryCode: 'EG',
          packageId: plus.id,
          package: plus,
          features: [],
          subscriptions: [],
          subscriptionRequests: [],
        }),
      },
      package: { findMany: jest.fn().mockResolvedValue([premium, basic, archived, pro, plus]) },
    };
    const service = new MySubscriptionService(
      prisma as unknown as PrismaService,
      {} as PlatformAuditService,
      { get: () => 7 } as unknown as ConfigService<EnvConfig, true>,
    );
    const data = await service.view('restaurant-one');
    expect(data).not.toBeNull();
    expect(data?.package?.name).toBe('PLUS');
    expect(data?.comparisonPlans.map(plan => plan.name)).toEqual(['BASIC', 'PRO', 'Premium']);
    expect(data?.upgrades.map(plan => plan.name)).toEqual(['PRO', 'Premium']);
    expect(data?.comparisonPlans.find(plan => plan.name === 'BASIC')).toMatchObject({
      priceMonthly: '500.00',
      discountedMonthly: '250.00',
      adds: [],
    });
    expect(data?.currentPricing?.discountedMonthly).toBe('300.00');
    expect(prisma.package.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE' },
    }));
  });
});
