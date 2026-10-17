import { OrdersService } from './orders.service';
import { restaurantAccessFor } from '../auth/context/restaurant-access.fixture';

const RESTAURANT_ID = 'restaurant-1';
const BRANCH_ID = 'branch-1';
const FOREIGN_BRANCH_ID = 'branch-foreign';
const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

function decimal(value: string) {
  return { toFixed: () => value } as unknown as { toFixed: (n: number) => string };
}

const SAMPLE_ORDER_ROW = {
  id: WELL_FORMED_UUID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  status: 'PENDING' as const,
  type: 'DINE_IN' as const,
  customerNameSnapshot: null,
  customerPhoneSnapshot: null,
  customerNotesSnapshot: null,
  subtotalAmount: decimal('100.00'),
  deliveryFeeAmount: decimal('0.00'),
  deliveryZoneNameSnapshot: null,
  deliveryAddressSnapshot: null,
  deliveryBuildingSnapshot: null,
  deliveryFloorSnapshot: null,
  deliveryApartmentSnapshot: null,
  deliveryLandmarkSnapshot: null,
  branchId: BRANCH_ID,
  currencyCode: 'EGP',
  totalAmount: decimal('100.00'),
  restaurant: { id: RESTAURANT_ID, name: 'Elmo Bistro' },
  branch: { id: BRANCH_ID, name: 'Main Branch' },
  table: { id: 'table-1', tableNumber: '7' },
  statusEvents: [
    { previousStatus: null, newStatus: 'PENDING' as const, transitionedAt: new Date('2026-01-01T00:00:00Z') },
  ],
  items: [
    {
      productId: 'product-1',
      productNameSnapshot: 'Burger',
      unitPrice: decimal('100.00'),
      quantity: 1,
      lineTotal: decimal('100.00'),
      modifiers: [],
    },
  ],
};

function buildMocks() {
  const orderFindMany = jest.fn().mockResolvedValue([]);
  const orderFindFirst = jest.fn().mockResolvedValue(SAMPLE_ORDER_ROW);
  const orderUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const orderStatusEventCreate = jest.fn().mockResolvedValue({});
  const restaurantMembershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const resolveBranchManagementAccess = jest
    .fn()
    .mockResolvedValue({ outcome: 'authorized', context: { branchId: BRANCH_ID } });

  const prisma: Record<string, unknown> = {
    order: {
      findMany: orderFindMany,
      findFirst: orderFindFirst,
      updateMany: orderUpdateMany,
    },
    orderStatusEvent: { create: orderStatusEventCreate },
    restaurantMembershipBranch: { findMany: restaurantMembershipBranchFindMany },
  };
  // FT-11: `updateOrderStatus` now wraps its conditional update + history
  // insert in an interactive transaction -- this test double just invokes
  // the callback with the same mocked client, exactly like every other
  // Prisma-mock test double in this repo treats `$transaction`.
  const transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(prisma));
  prisma.$transaction = transaction;
  const branchAccessService = { resolveBranchManagementAccess };

  return {
    prisma,
    branchAccessService,
    orderFindMany,
    orderFindFirst,
    orderUpdateMany,
    orderStatusEventCreate,
    restaurantMembershipBranchFindMany,
    resolveBranchManagementAccess,
    transaction,
  };
}

function buildService(mocks: ReturnType<typeof buildMocks>): OrdersService {
  return new OrdersService(mocks.prisma as never, mocks.branchAccessService as never);
}

const ALL_BRANCHES_SCOPE = restaurantAccessFor('OWNER', {
  restaurantId: RESTAURANT_ID,
  membershipId: 'membership-1',
  allBranches: true,
});

const SCOPED_SCOPE = restaurantAccessFor('CASHIER', {
  restaurantId: RESTAURANT_ID,
  membershipId: 'membership-1',
  allBranches: false,
});

describe('OrdersService.listOrders', () => {
  it('scopes the query by the authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.listOrders(ALL_BRANCHES_SCOPE, {});

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.restaurantId).toBe(RESTAURANT_ID);
  });

  it('sorts newest first', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.listOrders(ALL_BRANCHES_SCOPE, {});

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('applies no branchId filter for an allBranches Membership with no explicit filter', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.listOrders(ALL_BRANCHES_SCOPE, {});

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.branchId).toBeUndefined();
  });

  it('restricts a scoped (non-allBranches) Membership to its assigned Branches only', async () => {
    const mocks = buildMocks();
    mocks.restaurantMembershipBranchFindMany.mockResolvedValue([
      { branchId: 'branch-a' },
      { branchId: 'branch-b' },
    ]);
    const service = buildService(mocks);

    await service.listOrders(SCOPED_SCOPE, {});

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.branchId).toEqual({ in: ['branch-a', 'branch-b'] });
  });

  it('ignores a branchId filter outside a scoped Membership assigned set (never widens access)', async () => {
    const mocks = buildMocks();
    mocks.restaurantMembershipBranchFindMany.mockResolvedValue([{ branchId: 'branch-a' }]);
    const service = buildService(mocks);

    await service.listOrders(SCOPED_SCOPE, { branchId: 'branch-foreign' });

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.branchId).toEqual({ in: ['branch-a'] });
  });

  it('applies an explicit status filter', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.listOrders(ALL_BRANCHES_SCOPE, { status: 'PENDING' });

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.status).toBe('PENDING');
  });

  it('formats totalAmount as an exact 2-decimal string and reports itemCount', async () => {
    const mocks = buildMocks();
    mocks.orderFindMany.mockResolvedValue([
      {
        id: WELL_FORMED_UUID,
        createdAt: new Date(),
        status: 'PENDING',
        type: 'DINE_IN',
        currencyCode: 'EGP',
        totalAmount: decimal('310.00'),
        branch: { id: BRANCH_ID, name: 'Main Branch' },
        table: { id: 'table-1', tableNumber: '7' },
        _count: { items: 2 },
      },
    ]);
    const service = buildService(mocks);

    const result = await service.listOrders(ALL_BRANCHES_SCOPE, {});

    expect(result).toEqual([
      expect.objectContaining({ totalAmount: '310.00', itemCount: 2 }),
    ]);
  });
});

describe('OrdersService.getOrderDetail', () => {
  it('returns notFound for a malformed orderId', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    const result = await service.getOrderDetail(ALL_BRANCHES_SCOPE, 'not-a-uuid');

    expect(result).toEqual({ outcome: 'notFound' });
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
  });

  it('scopes the lookup by id AND restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.getOrderDetail(ALL_BRANCHES_SCOPE, WELL_FORMED_UUID);

    const args = mocks.orderFindFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID });
  });

  it('converges a foreign-Restaurant Order (query finds nothing) on notFound', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue(null);
    const service = buildService(mocks);

    const result = await service.getOrderDetail(ALL_BRANCHES_SCOPE, WELL_FORMED_UUID);

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('converges an Order outside the Membership Branch scope on notFound (never a distinct error)', async () => {
    const mocks = buildMocks();
    mocks.resolveBranchManagementAccess.mockResolvedValue({ outcome: 'accessDenied' });
    const service = buildService(mocks);

    const result = await service.getOrderDetail(SCOPED_SCOPE, WELL_FORMED_UUID);

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('returns full item snapshots and exact money strings when authorized', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    const result = await service.getOrderDetail(ALL_BRANCHES_SCOPE, WELL_FORMED_UUID);

    expect(result).toEqual({
      outcome: 'found',
      data: {
        id: WELL_FORMED_UUID,
        createdAt: SAMPLE_ORDER_ROW.createdAt,
        status: 'PENDING',
        type: 'DINE_IN',
        restaurant: { id: RESTAURANT_ID, name: 'Elmo Bistro' },
        branch: { id: BRANCH_ID, name: 'Main Branch' },
        table: { id: 'table-1', tableNumber: '7' },
        customer: null,
        delivery: null,
        subtotalAmount: '100.00',
        deliveryFee: '0.00',
        discountTotal: '0.00',
        currencyCode: 'EGP',
        totalAmount: '100.00',
        items: [
          {
            productId: 'product-1',
            productNameSnapshot: 'Burger',
            variantName: null,
            unitPrice: '100.00',
            quantity: 1,
            discountAmount: '0.00',
            lineTotal: '100.00',
            modifiers: [],
          },
        ],
        statusHistory: [
          { previousStatus: null, newStatus: 'PENDING', transitionedAt: SAMPLE_ORDER_ROW.createdAt },
        ],
      },
    });
  });
});

describe('OrdersService -- PICKUP Orders (FT-7)', () => {
  const PICKUP_ROW = {
    ...SAMPLE_ORDER_ROW,
    type: 'PICKUP' as const,
    table: null,
    customerNameSnapshot: 'Sara Ali',
    customerPhoneSnapshot: '+20 100 000 0000',
    customerNotesSnapshot: 'No onions',
  };

  it('list rows expose type and a null table for a PICKUP Order', async () => {
    const mocks = buildMocks();
    mocks.orderFindMany.mockResolvedValue([
      {
        id: WELL_FORMED_UUID,
        createdAt: new Date(),
        status: 'PENDING',
        type: 'PICKUP',
        customerNameSnapshot: 'Sara Ali',
        customerPhoneSnapshot: '+20 100 000 0000',
        currencyCode: 'EGP',
        totalAmount: decimal('100.00'),
        branch: { id: BRANCH_ID, name: 'Main Branch' },
        table: null,
        _count: { items: 1 },
      },
    ]);
    const service = buildService(mocks);

    const result = await service.listOrders(ALL_BRANCHES_SCOPE, {});

    expect(result[0]).toMatchObject({
      type: 'PICKUP',
      table: null,
      customer: { name: 'Sara Ali', phone: '+20 100 000 0000' },
    });
  });

  it('detail exposes the PICKUP customer snapshots, Branch, and a null table', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue(PICKUP_ROW);
    const service = buildService(mocks);

    const result = await service.getOrderDetail(ALL_BRANCHES_SCOPE, WELL_FORMED_UUID);

    expect(result).toMatchObject({
      outcome: 'found',
      data: {
        type: 'PICKUP',
        table: null,
        branch: { id: BRANCH_ID, name: 'Main Branch' },
        customer: { name: 'Sara Ali', phone: '+20 100 000 0000', notes: 'No onions' },
      },
    });
  });

  it('a scoped Staff Membership cannot read a PICKUP Order of a Branch outside its scope (converges on notFound)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue(PICKUP_ROW);
    mocks.resolveBranchManagementAccess.mockResolvedValue({ outcome: 'accessDenied' });
    const service = buildService(mocks);

    const result = await service.getOrderDetail(SCOPED_SCOPE, WELL_FORMED_UUID);

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('list still restricts a scoped Membership to its assigned Branches (PICKUP Orders included)', async () => {
    const mocks = buildMocks();
    mocks.restaurantMembershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_ID }]);
    const service = buildService(mocks);

    await service.listOrders(SCOPED_SCOPE, {});

    const args = mocks.orderFindMany.mock.calls[0][0];
    expect(args.where.branchId).toEqual({ in: [BRANCH_ID] });
  });
});

describe('OrdersService.updateOrderStatus', () => {
  const BASE_INPUT = {
    scope: ALL_BRANCHES_SCOPE,
    orderId: WELL_FORMED_UUID,
    expectedStatus: 'PENDING' as const,
    status: 'ACCEPTED' as const,
  };

  it('returns notFound for a malformed orderId', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    const result = await service.updateOrderStatus({ ...BASE_INPUT, orderId: 'bad' });

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('converges a foreign/out-of-scope Order on notFound', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue(null);
    const service = buildService(mocks);

    const result = await service.updateOrderStatus(BASE_INPUT);

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('rejects an invalid transition', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'SERVED' });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus({
      ...BASE_INPUT,
      expectedStatus: 'SERVED',
      status: 'PREPARING',
    });

    expect(result).toEqual({ outcome: 'invalidTransition' });
    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
  });

  it('keeps a terminal status terminal (CANCELLED cannot transition anywhere)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'CANCELLED' });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus({
      ...BASE_INPUT,
      expectedStatus: 'CANCELLED',
      status: 'ACCEPTED',
    });

    expect(result).toEqual({ outcome: 'invalidTransition' });
  });

  it('rejects a caller whose Role lacks the specific transition Permission (WAITER cannot accept)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'PENDING' });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus({
      ...BASE_INPUT,
      scope: restaurantAccessFor('WAITER', { restaurantId: RESTAURANT_ID, membershipId: 'membership-1' }),
      expectedStatus: 'PENDING',
      status: 'ACCEPTED',
    });

    expect(result).toEqual({ outcome: 'permissionDenied' });
    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
  });

  it('allows a caller whose Role does hold the specific transition Permission (KITCHEN can prepare)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'ACCEPTED' })
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'PREPARING' });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus({
      ...BASE_INPUT,
      scope: restaurantAccessFor('KITCHEN', { restaurantId: RESTAURANT_ID, membershipId: 'membership-1' }),
      expectedStatus: 'ACCEPTED',
      status: 'PREPARING',
    });

    expect(result.outcome).toBe('updated');
    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID, status: 'ACCEPTED' },
      data: { status: 'PREPARING' },
    });
  });

  it('FT-11: records an OrderStatusEvent for a successful transition, with the correct previous/new status and Branch', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'ACCEPTED' })
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'PREPARING' });
    const service = buildService(mocks);

    await service.updateOrderStatus({
      ...BASE_INPUT,
      scope: restaurantAccessFor('KITCHEN', { restaurantId: RESTAURANT_ID, membershipId: 'membership-1' }),
      expectedStatus: 'ACCEPTED',
      status: 'PREPARING',
    });

    expect(mocks.orderStatusEventCreate).toHaveBeenCalledWith({
      data: {
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
        orderId: WELL_FORMED_UUID,
        previousStatus: 'ACCEPTED',
        newStatus: 'PREPARING',
      },
    });
  });

  it('FT-11: never records a history event for an invalid transition', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'CANCELLED' });
    const service = buildService(mocks);

    await service.updateOrderStatus({ ...BASE_INPUT, expectedStatus: 'CANCELLED', status: 'ACCEPTED' });

    expect(mocks.orderStatusEventCreate).not.toHaveBeenCalled();
  });

  it('FT-11: never records a history event when a caller lacks the transition Permission', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'PENDING' });
    const service = buildService(mocks);

    await service.updateOrderStatus({
      ...BASE_INPUT,
      scope: restaurantAccessFor('WAITER', { restaurantId: RESTAURANT_ID, membershipId: 'membership-1' }),
      expectedStatus: 'PENDING',
      status: 'ACCEPTED',
    });

    expect(mocks.orderStatusEventCreate).not.toHaveBeenCalled();
  });

  it('FT-11: never records a history event when the conditional update matches zero rows (stale race)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'REJECTED' });
    mocks.orderUpdateMany.mockResolvedValue({ count: 0 });
    const service = buildService(mocks);

    await service.updateOrderStatus(BASE_INPUT);

    expect(mocks.orderStatusEventCreate).not.toHaveBeenCalled();
  });

  it('FT-11: the status update and the history event run inside the same $transaction call (atomicity)', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'PENDING' })
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'ACCEPTED' });
    const service = buildService(mocks);

    await service.updateOrderStatus(BASE_INPUT);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    // Both writes happened strictly after $transaction was invoked and
    // before it resolved -- i.e. neither is a separate, unguarded write.
    const transactionCallOrder = mocks.transaction.mock.invocationCallOrder[0];
    expect(mocks.orderUpdateMany.mock.invocationCallOrder[0]).toBeGreaterThan(transactionCallOrder);
    expect(mocks.orderStatusEventCreate.mock.invocationCallOrder[0]).toBeGreaterThan(transactionCallOrder);
  });

  it('rejects with staleStatus when the loaded Order no longer matches expectedStatus', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst.mockResolvedValue({ ...SAMPLE_ORDER_ROW, status: 'ACCEPTED' });
    const service = buildService(mocks);

    // The row is actually ACCEPTED; the caller still believes it's PENDING,
    // but is requesting a transition (ACCEPTED -> PREPARING) that IS valid
    // from the row's real current status -- this isolates the staleness
    // check from the transition-validity check above it.
    const result = await service.updateOrderStatus({
      ...BASE_INPUT,
      expectedStatus: 'PENDING',
      status: 'PREPARING',
    });

    expect(result).toEqual({ outcome: 'staleStatus', currentStatus: 'ACCEPTED' });
    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
  });

  it('produces staleStatus when the conditional update races and matches zero rows', async () => {
    const mocks = buildMocks();
    mocks.orderFindFirst
      .mockResolvedValueOnce({ ...SAMPLE_ORDER_ROW, status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'REJECTED' });
    mocks.orderUpdateMany.mockResolvedValue({ count: 0 });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus(BASE_INPUT);

    expect(result).toEqual({ outcome: 'staleStatus', currentStatus: 'REJECTED' });
  });

  it('denies the Branch-scope check before ever attempting the transition', async () => {
    const mocks = buildMocks();
    mocks.resolveBranchManagementAccess.mockResolvedValue({ outcome: 'accessDenied' });
    const service = buildService(mocks);

    const result = await service.updateOrderStatus(BASE_INPUT);

    expect(result).toEqual({ outcome: 'notFound' });
    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
  });
});
