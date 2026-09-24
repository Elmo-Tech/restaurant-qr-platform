import { Prisma } from '../generated/prisma/client';
import { OrdersService } from './orders.service';

const RESTAURANT_ID = 'restaurant-1';
const BRANCH_ID = 'branch-1';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

const DELIVERY_ROW = {
  id: ORDER_ID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  status: 'READY' as const,
  type: 'DELIVERY' as const,
  branchId: BRANCH_ID,
  customerNameSnapshot: 'Sara Ali',
  customerPhoneSnapshot: '+20 100 000 0000',
  customerNotesSnapshot: 'Ring twice',
  subtotalAmount: decimal('240.00'),
  deliveryFeeAmount: decimal('25.00'),
  deliveryZoneNameSnapshot: 'University District',
  deliveryAddressSnapshot: '12 University St',
  deliveryBuildingSnapshot: 'B4',
  deliveryFloorSnapshot: '3',
  deliveryApartmentSnapshot: '12',
  deliveryLandmarkSnapshot: 'Near the library',
  currencyCode: 'EGP',
  totalAmount: decimal('265.00'),
  restaurant: { id: RESTAURANT_ID, name: 'Elmo Bistro' },
  branch: { id: BRANCH_ID, name: 'Main Branch' },
  table: null,
  items: [],
};

function build(row: Record<string, unknown> = DELIVERY_ROW) {
  const orderFindFirst = jest.fn().mockResolvedValue(row);
  const orderUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const resolveBranchManagementAccess = jest
    .fn()
    .mockResolvedValue({ outcome: 'authorized', context: { branchId: BRANCH_ID } });
  const prisma = {
    order: { findFirst: orderFindFirst, findMany: jest.fn(), updateMany: orderUpdateMany },
    restaurantMembershipBranch: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    service: new OrdersService(prisma as never, { resolveBranchManagementAccess } as never),
    orderFindFirst,
    orderUpdateMany,
    resolveBranchManagementAccess,
  };
}

const SCOPE = {
  restaurantId: RESTAURANT_ID,
  membershipId: 'membership-1',
  allBranches: true,
  role: 'OWNER' as const,
};

describe('OrdersService -- DELIVERY Orders (FT-8)', () => {
  it('detail exposes delivery snapshots, customer, and the exact money breakdown', async () => {
    const m = build();

    const result = await m.service.getOrderDetail(SCOPE, ORDER_ID);

    expect(result).toMatchObject({
      outcome: 'found',
      data: {
        type: 'DELIVERY',
        table: null,
        customer: { name: 'Sara Ali', phone: '+20 100 000 0000', notes: 'Ring twice' },
        delivery: {
          zoneName: 'University District',
          address: '12 University St',
          building: 'B4',
          floor: '3',
          apartment: '12',
          landmark: 'Near the library',
        },
        subtotalAmount: '240.00',
        deliveryFee: '25.00',
        totalAmount: '265.00',
      },
    });
  });

  it('a DINE_IN/PICKUP detail has no delivery block and a zero fee', async () => {
    const m = build({
      ...DELIVERY_ROW,
      type: 'PICKUP',
      deliveryZoneNameSnapshot: null,
      deliveryAddressSnapshot: null,
      deliveryFeeAmount: decimal('0.00'),
      subtotalAmount: decimal('265.00'),
    });

    const result = await m.service.getOrderDetail(SCOPE, ORDER_ID);

    expect(result).toMatchObject({ data: { delivery: null, deliveryFee: '0.00' } });
  });

  it('Staff Branch isolation still applies: a DELIVERY Order outside the Membership scope is notFound', async () => {
    const m = build();
    m.resolveBranchManagementAccess.mockResolvedValue({ outcome: 'accessDenied' });

    const result = await m.service.getOrderDetail({ ...SCOPE, allBranches: false }, ORDER_ID);

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('READY -> OUT_FOR_DELIVERY is allowed for a DELIVERY Order', async () => {
    const m = build({ ...DELIVERY_ROW, status: 'READY' });
    // First findFirst = status load; later ones = getOrderDetail re-read.
    m.orderFindFirst
      .mockResolvedValueOnce({ id: ORDER_ID, branchId: BRANCH_ID, status: 'READY', type: 'DELIVERY' })
      .mockResolvedValue({ ...DELIVERY_ROW, status: 'OUT_FOR_DELIVERY' });

    const result = await m.service.updateOrderStatus({
      scope: SCOPE,
      orderId: ORDER_ID,
      expectedStatus: 'READY',
      status: 'OUT_FOR_DELIVERY',
    });

    expect(result).toMatchObject({ outcome: 'updated', data: { status: 'OUT_FOR_DELIVERY' } });
    expect(m.orderUpdateMany.mock.calls[0][0].data).toEqual({ status: 'OUT_FOR_DELIVERY' });
  });

  it('OUT_FOR_DELIVERY -> SERVED is allowed for a DELIVERY Order', async () => {
    const m = build();
    m.orderFindFirst
      .mockResolvedValueOnce({ id: ORDER_ID, branchId: BRANCH_ID, status: 'OUT_FOR_DELIVERY', type: 'DELIVERY' })
      .mockResolvedValue({ ...DELIVERY_ROW, status: 'SERVED' });

    const result = await m.service.updateOrderStatus({
      scope: SCOPE,
      orderId: ORDER_ID,
      expectedStatus: 'OUT_FOR_DELIVERY',
      status: 'SERVED',
    });

    expect(result).toMatchObject({ outcome: 'updated', data: { status: 'SERVED' } });
  });

  it.each(['PICKUP', 'DINE_IN'] as const)(
    'a %s Order can NOT move READY -> OUT_FOR_DELIVERY',
    async (type) => {
      const m = build();
      m.orderFindFirst.mockResolvedValueOnce({
        id: ORDER_ID,
        branchId: BRANCH_ID,
        status: 'READY',
        type,
      });

      const result = await m.service.updateOrderStatus({
        scope: SCOPE,
        orderId: ORDER_ID,
        expectedStatus: 'READY',
        status: 'OUT_FOR_DELIVERY',
      });

      expect(result).toEqual({ outcome: 'invalidTransition' });
      expect(m.orderUpdateMany).not.toHaveBeenCalled();
    },
  );

  it('a DELIVERY Order can NOT skip straight from READY to SERVED', async () => {
    const m = build();
    m.orderFindFirst.mockResolvedValueOnce({
      id: ORDER_ID,
      branchId: BRANCH_ID,
      status: 'READY',
      type: 'DELIVERY',
    });

    const result = await m.service.updateOrderStatus({
      scope: SCOPE,
      orderId: ORDER_ID,
      expectedStatus: 'READY',
      status: 'SERVED',
    });

    expect(result).toEqual({ outcome: 'invalidTransition' });
  });
});
