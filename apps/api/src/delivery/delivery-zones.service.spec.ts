import { Prisma } from '../generated/prisma/client';
import { DeliveryZonesService } from './delivery-zones.service';

const RESTAURANT_ID = 'restaurant-1';
const BRANCH_ID = '11111111-1111-4111-8111-000000000001';
const ZONE_ID = '22222222-2222-4222-8222-000000000001';

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

const ZONE_ROW = {
  id: ZONE_ID,
  name: 'University District',
  translations: [{ locale: 'en', name: 'University District' }],
  deliveryFee: decimal('25'),
  minimumOrder: decimal('150'),
  status: 'ACTIVE' as const,
  displayOrder: 0,
  _count: { orders: 0 },
};

function build() {
  const branchFindMany = jest.fn().mockResolvedValue([]);
  const branchFindFirst = jest.fn().mockResolvedValue({
    id: BRANCH_ID,
    restaurant: { defaultLocale: 'en' },
    _count: { deliveryZones: 2 },
  });
  const zoneCreate = jest.fn().mockResolvedValue(ZONE_ROW);
  const zoneFindFirst = jest.fn().mockResolvedValue({
    id: ZONE_ID,
    restaurant: { defaultLocale: 'en' },
    _count: { orders: 0 },
  });
  const zoneTranslationUpsert = jest.fn().mockResolvedValue({});
  const zoneTranslationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const zoneUpdate = jest.fn().mockResolvedValue(ZONE_ROW);
  const zoneDelete = jest.fn().mockResolvedValue(undefined);
  const membershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    branch: { findMany: branchFindMany, findFirst: branchFindFirst },
    deliveryZone: {
      create: zoneCreate,
      findFirst: zoneFindFirst,
      update: zoneUpdate,
      delete: zoneDelete,
    },
    restaurantMembershipBranch: { findMany: membershipBranchFindMany },
    deliveryZoneTranslation: {
      upsert: zoneTranslationUpsert,
      deleteMany: zoneTranslationDeleteMany,
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
    callback(prisma),
  );
  return {
    zoneTranslationUpsert,
    zoneTranslationDeleteMany,
    service: new DeliveryZonesService(prisma as never),
    branchFindMany,
    branchFindFirst,
    zoneCreate,
    zoneFindFirst,
    zoneUpdate,
    zoneDelete,
    membershipBranchFindMany,
  };
}

describe('DeliveryZonesService', () => {
  it('lists Branches scoped to the authorized Restaurant and formats money as exact 2-decimal strings', async () => {
    const m = build();
    m.branchFindMany.mockResolvedValue([
      { id: BRANCH_ID, name: 'Main', translations: [], status: 'ACTIVE', deliveryZones: [ZONE_ROW] },
    ]);

    const result = await m.service.listDeliveryBranches({
      restaurantId: RESTAURANT_ID,
      membershipId: 'membership-1',
      allBranches: true,
    });

    expect(m.branchFindMany.mock.calls[0][0].where).toEqual({ restaurantId: RESTAURANT_ID });
    expect(result[0].zones[0]).toMatchObject({
      deliveryFee: '25.00',
      minimumOrder: '150.00',
      canDelete: true,
    });
  });

  it('a Branch-scoped Membership only sees its assigned Branches', async () => {
    const m = build();
    m.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_ID }]);

    await m.service.listDeliveryBranches({
      restaurantId: RESTAURANT_ID,
      membershipId: 'membership-1',
      allBranches: false,
    });

    expect(m.branchFindMany.mock.calls[0][0].where).toEqual({
      restaurantId: RESTAURANT_ID,
      id: { in: [BRANCH_ID] },
    });
  });

  it('a zone with Orders reports canDelete=false', async () => {
    const m = build();
    m.branchFindMany.mockResolvedValue([
      {
        id: BRANCH_ID,
        name: 'Main',
        translations: [],
        status: 'ACTIVE',
        deliveryZones: [{ ...ZONE_ROW, _count: { orders: 3 } }],
      },
    ]);

    const result = await m.service.listDeliveryBranches({
      restaurantId: RESTAURANT_ID,
      membershipId: 'm',
      allBranches: true,
    });

    expect(result[0].zones[0].canDelete).toBe(false);
  });

  it('create verifies the Branch belongs to the authorized Restaurant', async () => {
    const m = build();
    m.branchFindFirst.mockResolvedValue(null);

    const result = await m.service.createZone({
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      name: 'X',
      deliveryFee: '10.00',
      minimumOrder: '0',
      status: 'ACTIVE',
    });

    expect(result).toEqual({ outcome: 'branchNotFound' });
    expect(m.branchFindFirst.mock.calls[0][0].where).toEqual({
      id: BRANCH_ID,
      restaurantId: RESTAURANT_ID,
    });
    expect(m.zoneCreate).not.toHaveBeenCalled();
  });

  it('create stores exact Decimal money, the authorized restaurantId, and the verified branchId', async () => {
    const m = build();

    await m.service.createZone({
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      name: 'University District',
      deliveryFee: '25.00',
      minimumOrder: '150',
      status: 'ACTIVE',
    });

    const data = m.zoneCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ restaurantId: RESTAURANT_ID, branchId: BRANCH_ID, displayOrder: 2 });
    expect(data.deliveryFee).toBeInstanceOf(Prisma.Decimal);
    expect(data.deliveryFee.toFixed(2)).toBe('25.00');
    expect(data.minimumOrder.toFixed(2)).toBe('150.00');
  });

  it('create writes the default-locale row from name plus the supplied translations; the legacy name is the default-locale value', async () => {
    const m = build();

    await m.service.createZone({
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      name: 'University District',
      translations: [{ locale: 'ar', name: 'حي الجامعة' }],
      deliveryFee: '25.00',
      minimumOrder: '150',
      status: 'ACTIVE',
    });

    const data = m.zoneCreate.mock.calls[0][0].data;
    expect(data.name).toBe('University District');
    expect(data.translations).toEqual({
      create: [
        { locale: 'ar', name: 'حي الجامعة' },
        { locale: 'en', name: 'University District' },
      ],
    });
  });

  it('create refuses a blank default-locale translation and writes nothing', async () => {
    const m = build();

    const result = await m.service.createZone({
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      name: 'X',
      translations: [{ locale: 'en', name: '' }],
      deliveryFee: '1',
      minimumOrder: '0',
      status: 'ACTIVE',
    });

    expect(result).toEqual({ outcome: 'defaultNameRequired' });
    expect(m.zoneCreate).not.toHaveBeenCalled();
  });

  it('update upserts supplied locales and removes an emptied non-default locale, scoped to the verified zone', async () => {
    const m = build();

    await m.service.updateZone({
      restaurantId: RESTAURANT_ID,
      zoneId: ZONE_ID,
      translations: [
        { locale: 'ar', name: 'حي الجامعة' },
        { locale: 'en', name: 'University' },
      ],
    });
    const creates = m.zoneTranslationUpsert.mock.calls.map(
      (call: [{ create: unknown }]) => call[0].create,
    );
    expect(creates).toEqual([
      { deliveryZoneId: ZONE_ID, locale: 'ar', name: 'حي الجامعة' },
      { deliveryZoneId: ZONE_ID, locale: 'en', name: 'University' },
    ]);
    // the default-locale translation is authoritative for the legacy name
    expect(m.zoneUpdate.mock.calls[0][0].data.name).toBe('University');

    const removal = build();
    await removal.service.updateZone({
      restaurantId: RESTAURANT_ID,
      zoneId: ZONE_ID,
      translations: [{ locale: 'ar', name: '' }],
    });
    expect(removal.zoneTranslationDeleteMany).toHaveBeenCalledWith({
      where: { deliveryZoneId: ZONE_ID, locale: { in: ['ar'] } },
    });
  });

  it('a malformed Branch id is not found without touching the database', async () => {
    const m = build();

    const result = await m.service.createZone({
      restaurantId: RESTAURANT_ID,
      branchId: 'nope',
      name: 'X',
      deliveryFee: '1',
      minimumOrder: '0',
      status: 'ACTIVE',
    });

    expect(result).toEqual({ outcome: 'branchNotFound' });
    expect(m.branchFindFirst).not.toHaveBeenCalled();
  });

  it('update of a foreign-Restaurant zone converges on zoneNotFound', async () => {
    const m = build();
    m.zoneFindFirst.mockResolvedValue(null);

    const result = await m.service.updateZone({ restaurantId: RESTAURANT_ID, zoneId: ZONE_ID, status: 'INACTIVE' });

    expect(result).toEqual({ outcome: 'zoneNotFound' });
    expect(m.zoneFindFirst.mock.calls[0][0].where).toEqual({ id: ZONE_ID, restaurantId: RESTAURANT_ID });
    expect(m.zoneUpdate).not.toHaveBeenCalled();
  });

  it('update writes only the provided fields, with Decimal money', async () => {
    const m = build();

    await m.service.updateZone({ restaurantId: RESTAURANT_ID, zoneId: ZONE_ID, deliveryFee: '30.50' });

    const data = m.zoneUpdate.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['deliveryFee']);
    expect(data.deliveryFee.toFixed(2)).toBe('30.50');
  });

  it('delete is refused when the zone has Orders (deactivate instead)', async () => {
    const m = build();
    m.zoneFindFirst.mockResolvedValue({ id: ZONE_ID, _count: { orders: 2 } });

    const result = await m.service.deleteZone({ restaurantId: RESTAURANT_ID, zoneId: ZONE_ID });

    expect(result).toEqual({ outcome: 'hasOrders' });
    expect(m.zoneDelete).not.toHaveBeenCalled();
  });

  it('delete removes an unreferenced zone', async () => {
    const m = build();

    const result = await m.service.deleteZone({ restaurantId: RESTAURANT_ID, zoneId: ZONE_ID });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(m.zoneDelete).toHaveBeenCalledWith({ where: { id: ZONE_ID } });
  });

  it('a race where an Order references the zone mid-delete (FK violation) is reported as hasOrders', async () => {
    const m = build();
    const fk = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & { code: string };
    fk.code = 'P2003';
    m.zoneDelete.mockRejectedValue(fk);

    const result = await m.service.deleteZone({ restaurantId: RESTAURANT_ID, zoneId: ZONE_ID });

    expect(result).toEqual({ outcome: 'hasOrders' });
  });
});
