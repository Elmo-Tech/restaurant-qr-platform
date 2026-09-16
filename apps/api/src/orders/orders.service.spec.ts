import { OrdersService } from './orders.service';

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
  branchId: BRANCH_ID,
  currencyCode: 'EGP',
  totalAmount: decimal('100.00'),
  restaurant: { id: RESTAURANT_ID, name: 'Elmo Bistro' },
  branch: { id: BRANCH_ID, name: 'Main Branch' },
  table: { id: 'table-1', tableNumber: '7' },
  items: [
    {
      productId: 'product-1',
      productNameSnapshot: 'Burger',
      unitPrice: decimal('100.00'),
      quantity: 1,
      lineTotal: decimal('100.00'),
    },
  ],
};

function buildMocks() {
  const orderFindMany = jest.fn().mockResolvedValue([]);
  const orderFindFirst = jest.fn().mockResolvedValue(SAMPLE_ORDER_ROW);
  const orderUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const restaurantMembershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const resolveBranchManagementAccess = jest
    .fn()
    .mockResolvedValue({ outcome: 'authorized', context: { branchId: BRANCH_ID } });

  const prisma = {
    order: {
      findMany: orderFindMany,
      findFirst: orderFindFirst,
      updateMany: orderUpdateMany,
    },
    restaurantMembershipBranch: { findMany: restaurantMembershipBranchFindMany },
  };
  const branchAccessService = { resolveBranchManagementAccess };

  return {
    prisma,
    branchAccessService,
    orderFindMany,
    orderFindFirst,
    orderUpdateMany,
    restaurantMembershipBranchFindMany,
    resolveBranchManagementAccess,
  };
}

function buildService(mocks: ReturnType<typeof buildMocks>): OrdersService {
  return new OrdersService(mocks.prisma as never, mocks.branchAccessService as never);
}

const ALL_BRANCHES_SCOPE = {
  restaurantId: RESTAURANT_ID,
  membershipId: 'membership-1',
  allBranches: true,
  role: 'OWNER' as const,
};

const SCOPED_SCOPE = {
  restaurantId: RESTAURANT_ID,
  membershipId: 'membership-1',
  allBranches: false,
  role: 'CASHIER' as const,
};

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
        restaurant: { id: RESTAURANT_ID, name: 'Elmo Bistro' },
        branch: { id: BRANCH_ID, name: 'Main Branch' },
        table: { id: 'table-1', tableNumber: '7' },
        currencyCode: 'EGP',
        totalAmount: '100.00',
        items: [
          {
            productId: 'product-1',
            productNameSnapshot: 'Burger',
            unitPrice: '100.00',
            quantity: 1,
            lineTotal: '100.00',
          },
        ],
      },
    });
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
      scope: { ...ALL_BRANCHES_SCOPE, role: 'WAITER' },
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
      scope: { ...ALL_BRANCHES_SCOPE, role: 'KITCHEN' },
      expectedStatus: 'ACCEPTED',
      status: 'PREPARING',
    });

    expect(result.outcome).toBe('updated');
    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID, status: 'ACCEPTED' },
      data: { status: 'PREPARING' },
    });
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
