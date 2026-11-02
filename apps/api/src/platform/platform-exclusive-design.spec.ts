import { PlatformRestaurantsService } from './platform-restaurants.service';

const RESTAURANT_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN = { adminId: 'platform-admin-1', email: 'admin@example.org', displayName: 'Platform Admin' };

function setup() {
  const prisma = {
    restaurant: {
      findUnique: jest.fn().mockResolvedValue({
        id: RESTAURANT_ID,
        name: 'Restaurant A',
      }),
    },
    restaurantExclusiveDesign: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn() };
  const service = new PlatformRestaurantsService(
    prisma as never,
    audit as never,
    config as never,
  );
  return { service, prisma, audit };
}

describe('Platform Admin: tenant-owned exclusive design assignment', () => {
  const reservation = { baseTemplate: 'BLOOM' as const, status: 'RESERVED' as const };

  it('returns notFound without any write for invalid or unregistered Restaurant IDs', async () => {
    const t = setup();
    expect(
      await t.service.setExclusiveDesign(ADMIN, 'invalid', reservation),
    ).toEqual({ outcome: 'notFound' });
    expect(t.prisma.restaurant.findUnique).not.toHaveBeenCalled();

    t.prisma.restaurant.findUnique.mockResolvedValueOnce(null);
    expect(
      await t.service.setExclusiveDesign(ADMIN, RESTAURANT_ID, reservation),
    ).toEqual({ outcome: 'notFound' });
    expect(t.prisma.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('creates an assignment for exactly the resolved Restaurant and audits it', async () => {
    const t = setup();
    expect(
      await t.service.setExclusiveDesign(ADMIN, RESTAURANT_ID, reservation),
    ).toEqual({ outcome: 'ok', data: reservation });
    expect(t.prisma.restaurantExclusiveDesign.upsert).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID },
      create: {
        restaurantId: RESTAURANT_ID,
        baseTemplate: 'BLOOM',
        status: 'RESERVED',
      },
      update: { baseTemplate: 'BLOOM', status: 'RESERVED' },
    });
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        action: 'restaurant.exclusive_design_updated',
        restaurant: { id: RESTAURANT_ID, name: 'Restaurant A' },
      }),
    );
  });

  it('does not rewrite or generate audit events on idempotent update', async () => {
    const t = setup();
    t.prisma.restaurantExclusiveDesign.findUnique.mockResolvedValueOnce(reservation);
    await t.service.setExclusiveDesign(ADMIN, RESTAURANT_ID, reservation);
    expect(t.prisma.restaurantExclusiveDesign.upsert).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('updates a reserved assignment into an active base renderer with audit', async () => {
    const t = setup();
    const activated = { baseTemplate: 'BLOOM' as const, status: 'ACTIVE_BASE' as const };
    t.prisma.restaurantExclusiveDesign.findUnique.mockResolvedValueOnce(reservation);
    await t.service.setExclusiveDesign(ADMIN, RESTAURANT_ID, activated);
    expect(t.prisma.restaurantExclusiveDesign.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: activated,
      }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          from: { template: 'BLOOM', status: 'RESERVED' },
          to: { template: 'BLOOM', status: 'ACTIVE_BASE' },
        },
      }),
    );
  });
});
