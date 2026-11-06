import { Prisma } from '../generated/prisma/client';
import { DashboardService } from './dashboard.service';

const RESTAURANT_ID = 'restaurant-1';
const BRANCH_ID = 'branch-1';
const FOREIGN_RESTAURANT_ID = 'restaurant-2';

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function order(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    status: 'SERVED' as const,
    type: 'DINE_IN' as const,
    totalAmount: decimal('100.00'),
    ...overrides,
  };
}

function buildMocks(
  options: { orders?: ReturnType<typeof order>[]; events?: unknown[]; items?: unknown[] } = {},
) {
  const branchFindMany = jest.fn().mockResolvedValue([{ id: BRANCH_ID, timezone: 'Asia/Dubai' }]);
  const orderCount = jest.fn().mockResolvedValue(0);
  const orderFindMany = jest.fn().mockResolvedValue(options.orders ?? []);
  const orderStatusEventFindMany = jest.fn().mockResolvedValue(options.events ?? []);
  const restaurantMembershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const orderItemFindMany = jest.fn().mockResolvedValue(options.items ?? []);

  const prisma = {
    orderItem: { findMany: orderItemFindMany },
    branch: { findMany: branchFindMany },
    order: { count: orderCount, findMany: orderFindMany },
    orderStatusEvent: { findMany: orderStatusEventFindMany },
    restaurantMembershipBranch: { findMany: restaurantMembershipBranchFindMany },
  };

  return {
    prisma,
    branchFindMany,
    orderCount,
    orderFindMany,
    orderStatusEventFindMany,
    restaurantMembershipBranchFindMany,
    orderItemFindMany,
  };
}

function buildService(mocks: ReturnType<typeof buildMocks>): DashboardService {
  return new DashboardService(mocks.prisma as never);
}

const ALL_BRANCHES_SCOPE = { restaurantId: RESTAURANT_ID, membershipId: 'membership-1', allBranches: true };

describe('DashboardService.getMetrics', () => {
  it('scopes every query by the authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

    expect(mocks.branchFindMany.mock.calls[0][0].where.restaurantId).toBe(RESTAURANT_ID);
    expect(mocks.orderFindMany.mock.calls[0][0].where.restaurantId).toBe(RESTAURANT_ID);
    expect(mocks.orderCount.mock.calls[0][0].where.restaurantId).toBe(RESTAURANT_ID);
    // Never the foreign id, under any circumstance.
    expect(mocks.orderFindMany.mock.calls[0][0].where.restaurantId).not.toBe(FOREIGN_RESTAURANT_ID);
  });

  it('narrows to the Membership’s assigned Branches when allBranches is false (Branch scope)', async () => {
    const mocks = buildMocks();
    mocks.restaurantMembershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_ID }]);
    const service = buildService(mocks);

    await service.getMetrics(
      { restaurantId: RESTAURANT_ID, membershipId: 'membership-2', allBranches: false },
      { range: 'today' },
    );

    expect(mocks.orderFindMany.mock.calls[0][0].where.branchId).toEqual({ in: [BRANCH_ID] });
  });

  it('returns zeroed KPIs and null timing for an empty dataset, never NaN or a fabricated average', async () => {
    const mocks = buildMocks({ orders: [] });
    const service = buildService(mocks);

    const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

    expect(result.kpis).toEqual({
      revenue: '0.00',
      totalOrders: 0,
      averageOrderValue: '0.00',
      activeOrders: 0,
    });
    expect(result.timing).toEqual({
      acceptanceSeconds: null,
      preparationSeconds: null,
      readyWaitSeconds: null,
      pickupFulfillmentSeconds: null,
      deliveryFulfillmentSeconds: null,
      totalFulfillmentSeconds: null,
    });
  });

  it('computes exact revenue and average order value via Decimal, excluding REJECTED/CANCELLED (ORDER_LIFECYCLE_SPEC.md #72/73)', async () => {
    const mocks = buildMocks({
      orders: [
        order({ id: 'o1', status: 'SERVED', totalAmount: decimal('100.00') }),
        order({ id: 'o2', status: 'SERVED', totalAmount: decimal('50.50') }),
        order({ id: 'o3', status: 'REJECTED', totalAmount: decimal('999.00') }),
        order({ id: 'o4', status: 'CANCELLED', totalAmount: decimal('999.00') }),
      ],
    });
    const service = buildService(mocks);

    const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

    // Volume counts every submitted Order, including rejected/cancelled.
    expect(result.kpis.totalOrders).toBe(4);
    // Revenue and AOV count only the two SERVED Orders.
    expect(result.kpis.revenue).toBe('150.50');
    expect(result.kpis.averageOrderValue).toBe('75.25');
  });

  it('breaks orders down by type (count + revenue) and by status (count)', async () => {
    const mocks = buildMocks({
      orders: [
        order({ id: 'o1', type: 'DINE_IN', status: 'SERVED', totalAmount: decimal('100.00') }),
        order({ id: 'o2', type: 'PICKUP', status: 'PENDING', totalAmount: decimal('40.00') }),
        order({ id: 'o3', type: 'PICKUP', status: 'REJECTED', totalAmount: decimal('40.00') }),
      ],
    });
    const service = buildService(mocks);

    const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

    expect(result.byType.DINE_IN).toEqual({ count: 1, revenue: '100.00' });
    // PICKUP count is 1 for revenue purposes (REJECTED excluded), revenue only the PENDING one.
    expect(result.byType.PICKUP).toEqual({ count: 1, revenue: '40.00' });
    expect(result.byType.DELIVERY).toEqual({ count: 0, revenue: '0.00' });

    expect(result.byStatus.SERVED).toBe(1);
    expect(result.byStatus.PENDING).toBe(1);
    expect(result.byStatus.REJECTED).toBe(1);
    expect(result.byStatus.CANCELLED).toBe(0);
  });

  it('averages timing across Orders using only the events that actually exist (no fabricated timings)', async () => {
    const created = new Date('2026-09-30T10:00:00.000Z');
    const mocks = buildMocks({
      orders: [
        order({ id: 'o1', type: 'DINE_IN', status: 'SERVED', createdAt: created }),
        // o2 has no status events at all in this test (pre-FT-11 style) -- its acceptance duration must not count.
        order({ id: 'o2', type: 'DINE_IN', status: 'SERVED', createdAt: created }),
      ],
      events: [
        { orderId: 'o1', newStatus: 'PENDING', transitionedAt: created },
        { orderId: 'o1', newStatus: 'ACCEPTED', transitionedAt: new Date(created.getTime() + 5 * 60_000) },
      ],
    });
    const service = buildService(mocks);

    const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

    // Only o1 has an acceptance event -- the average is exactly its 5 minutes, not diluted by o2's null.
    expect(result.timing.acceptanceSeconds).toBe(5 * 60);
  });

  it('activeOrders is a live count independent of the selected date range', async () => {
    const mocks = buildMocks({ orders: [] });
    mocks.orderCount.mockResolvedValue(3);
    const service = buildService(mocks);

    const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'last30' });

    expect(result.kpis.activeOrders).toBe(3);
    expect(mocks.orderCount.mock.calls[0][0].where.createdAt).toBeUndefined();
  });

  describe('top products', () => {
    const item = (productId: string, name: string, quantity: number, lineTotal: string) => ({
      productId,
      productNameSnapshot: name,
      quantity,
      lineTotal: decimal(lineTotal),
    });

    it('ranks best sellers by quantity from the revenue orders only, with exact net amounts', async () => {
      const mocks = buildMocks({
        orders: [
          order({ id: 'o1', status: 'SERVED' }),
          order({ id: 'o2', status: 'REJECTED' }),
        ],
        items: [
          item('p-burger', 'Burger', 2, '90.00'),
          item('p-burger', 'Burger', 1, '45.00'),
          item('p-fries', 'Fries', 5, '75.00'),
          item('p-cola', 'Cola', 1, '10.00'),
        ],
      });
      const service = buildService(mocks);

      const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

      // only the non-rejected order's items are read
      expect(mocks.orderItemFindMany.mock.calls[0][0].where).toEqual({ orderId: { in: ['o1'] } });
      expect(result.topProducts).toEqual([
        { productId: 'p-fries', isOffer: false, name: 'Fries', quantity: 5, amount: '75.00' },
        { productId: 'p-burger', isOffer: false, name: 'Burger', quantity: 3, amount: '135.00' },
        { productId: 'p-cola', isOffer: false, name: 'Cola', quantity: 1, amount: '10.00' },
      ]);
    });

    it('returns an empty list (and reads no items) when there are no revenue orders', async () => {
      const mocks = buildMocks({ orders: [order({ id: 'o1', status: 'REJECTED' })] });
      const service = buildService(mocks);

      const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

      expect(result.topProducts).toEqual([]);
      expect(mocks.orderItemFindMany).not.toHaveBeenCalled();
    });

    it('keeps only the five best', async () => {
      const mocks = buildMocks({
        orders: [order({ id: 'o1' })],
        items: Array.from({ length: 8 }, (_, i) =>
          item(`p${i}`, `P${i}`, 10 - i, '10.00'),
        ),
      });
      const service = buildService(mocks);

      const result = await service.getMetrics(ALL_BRANCHES_SCOPE, { range: 'today' });

      expect(result.topProducts.map((p) => p.productId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    });
  });
});
