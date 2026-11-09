import { Prisma } from '../../generated/prisma/client';
import { PlatformBillingService } from './platform-billing.service';

describe('subscription contract contact snapshot', () => {
  it.each([[{ fullName: 'Essam Adel', phone: '+201044095071' }], [null]])(
    'captures only the available business contact: %j',
    async (ownerContact) => {
      const restaurantId = '11111111-1111-4111-8111-111111111111';
      const packageId = '22222222-2222-4222-8222-222222222222';
      const stop = new Error('stop after inspecting the create');
      const create = jest.fn((input: unknown): Promise<never> => {
        void input;
        return Promise.reject(stop);
      });
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ n: 1 }]),
        subscription: { findFirst: jest.fn().mockResolvedValue(null), create },
      };
      const prisma = {
        restaurant: {
          findUnique: jest.fn((input: unknown) => {
            void input;
            return Promise.resolve({
              id: restaurantId,
              name: 'Makhboz',
              countryCode: 'EG',
              packageId,
              memberships: [],
              subscriptions: [],
              slugs: [],
              ownerContact,
            });
          }),
        },
        package: {
          findUnique: jest.fn().mockResolvedValue({
            id: packageId,
            name: 'Pro',
            status: 'ACTIVE',
            features: [],
            priceEgpMonthly: new Prisma.Decimal('100'),
            priceEgpYearly: null,
            priceUsdMonthly: null,
            priceUsdYearly: null,
            offerPercent: null,
            offerLabel: null,
            offerEndsAt: null,
          }),
        },
        $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
          callback(tx),
        ),
      };
      const service = new PlatformBillingService(
        prisma as never,
        {} as never,
        {} as never,
        { get: () => 7 } as never,
      );

      await expect(
        service.create(
          {
            adminId: '33333333-3333-4333-8333-333333333333',
            email: 'admin@example.com',
          } as never,
          restaurantId,
          {
            packageId,
            period: 'MONTHLY',
            startsAt: '2026-11-10',
            discount: null,
            notes: null,
          },
        ),
      ).rejects.toBe(stop);
      const createInput = create.mock.calls[0][0] as {
        data: { contract: { create: { terms: { restaurant: unknown } } } };
      };
      expect(createInput.data.contract.create.terms.restaurant).toEqual({
        name: 'Makhboz',
        countryCode: 'EG',
        ownerEmails: [],
        ownerContact,
        menuUrl: null,
      });
      const query = prisma.restaurant.findUnique.mock.calls[0][0] as {
        select: { ownerContact: unknown };
      };
      expect(query.select.ownerContact).toEqual({
        select: { fullName: true, phone: true },
      });
    },
  );
});
