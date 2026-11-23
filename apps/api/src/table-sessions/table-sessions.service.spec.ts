import { restaurantAccessFor } from '../auth/context/restaurant-access.fixture';
import { Prisma } from '../generated/prisma/client';
import { toStaffDetail, toStaffSummary } from './session-v1-view';
import { TableSessionsService } from './table-sessions.service';

const RESTAURANT_ID = 'restaurant-1';
const BRANCH_ID = 'branch-1';
const SESSION_ID = 'session-1';
const PUBLIC_ID = 'session-public-id';
const CREATED_AT = new Date('2026-01-01T00:00:00Z');
const SCOPE = restaurantAccessFor('OWNER', {
  restaurantId: RESTAURANT_ID,
  allBranches: true,
});

function build() {
  const item = {
    productId: 'product-1',
    offerId: null,
    offerChoices: [],
    productNameSnapshot: 'Burger',
    variantNameSnapshot: null,
    unitPrice: new Prisma.Decimal('100.00'),
    quantity: 1,
    lineTotal: new Prisma.Decimal('100.00'),
    modifiers: [],
  };
  const order = {
    id: 'order-1',
    status: 'ACCEPTED',
    type: 'DINE_IN',
    createdAt: CREATED_AT,
    roundNumber: 1,
    currencyCode: 'EGP',
    totalAmount: new Prisma.Decimal('150.00'),
    items: [item, item],
    promotions: [
      {
        scope: 'CART',
        titleSnapshot: 'عرض الطلب',
        internalNameSnapshot: 'Cart saving',
        amount: new Prisma.Decimal('50.00'),
      },
    ],
  };
  const findFirst = jest
    .fn()
    .mockResolvedValue({ id: SESSION_ID, branchId: BRANCH_ID });
  const findFirstOrThrow = jest.fn().mockResolvedValue({
    id: SESSION_ID,
    publicId: PUBLIC_ID,
    status: 'OPEN',
    openedAt: CREATED_AT,
    openedVia: 'FIRST_ORDER',
    closedAt: null,
    closureReason: null,
    branchId: BRANCH_ID,
    restaurantId: RESTAURANT_ID,
    table: { id: 'table-1', tableNumber: '3' },
    orders: [
      order,
      { ...order, id: 'order-2', status: 'PENDING', roundNumber: 2 },
      {
        ...order,
        id: 'order-3',
        roundNumber: 3,
        totalAmount: new Prisma.Decimal('100.00'),
        items: [item],
        promotions: [],
      },
      { ...order, id: 'order-4', status: 'REJECTED', roundNumber: 4 },
    ],
    payments: [],
    events: [],
  });
  const resolveBranchManagementAccess = jest
    .fn()
    .mockResolvedValue({ outcome: 'authorized' });
  const service = new TableSessionsService(
    {
      tableSession: { findFirst, findFirstOrThrow },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Main Branch' }),
      },
      restaurant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Elmo Bistro', currencyCode: 'EGP' }),
      },
    } as never,
    { resolveBranchManagementAccess } as never,
  );
  return {
    service,
    findFirst,
    findFirstOrThrow,
    resolveBranchManagementAccess,
  };
}

const expectedRound = {
  totalAmount: '150.00',
  items: [{ lineTotal: '100.00' }, { lineTotal: '100.00' }],
  promotions: [{ scope: 'CART', title: 'عرض الطلب', amount: '50.00' }],
};

describe('TableSessionsService historical promotions', () => {
  it('preserves the promotion breakdown in the Staff detail and printable summary, with legacy and pending rounds', async () => {
    const { service, findFirstOrThrow } = build();
    const detail = await service.getSession(SCOPE, PUBLIC_ID);
    if (detail.outcome !== 'found')
      throw new Error('expected the Staff session detail');
    expect(toStaffDetail(detail.data)).toMatchObject({
      rounds: [
        { order: { ...expectedRound, billable: true } },
        { order: { ...expectedRound, billable: false } },
        { order: { totalAmount: '100.00', promotions: [] } },
        { order: { status: 'REJECTED', billable: false } },
      ],
      totals: { acceptedTotal: '250.00', pendingTotal: '150.00' },
      excludedOrderCount: 1,
    });

    const bill = await service.getBill(SCOPE, PUBLIC_ID);
    if (bill.outcome !== 'found')
      throw new Error('expected the printable summary');
    expect(toStaffSummary(bill.data)).toMatchObject({
      rounds: [
        { ...expectedRound, roundNumber: 1 },
        { roundNumber: 3, totalAmount: '100.00', promotions: [] },
      ],
      awaitingRounds: [{ ...expectedRound, roundNumber: 2 }],
      totals: { acceptedTotal: '250.00', pendingTotal: '150.00' },
    });
    expect(findFirstOrThrow.mock.calls[0]).toMatchObject([
      {
        select: {
          orders: {
            select: {
              promotions: {
                where: { scope: { not: 'DELIVERY' } },
                select: { titleSnapshot: true, scope: true, amount: true },
              },
            },
          },
        },
      },
    ]);
  });

  it('does not read any snapshot breakdown outside the caller’s Branch scope', async () => {
    const {
      service,
      findFirst,
      findFirstOrThrow,
      resolveBranchManagementAccess,
    } = build();
    resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'accessDenied',
    });

    await expect(
      service.getBill({ ...SCOPE, allBranches: false }, PUBLIC_ID),
    ).resolves.toEqual({ outcome: 'notFound' });
    expect(findFirst.mock.calls[0]).toMatchObject([
      { where: { publicId: PUBLIC_ID, restaurantId: RESTAURANT_ID } },
    ]);
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });
});
