import { Prisma } from '../generated/prisma/client';
import { resolveDineInSessionSlot } from '../table-sessions/table-session-ordering';
import { PublicOrdersService } from './public-orders.service';
import { ALL_FEATURES } from '../entitlements/features';

// Table Sessions: only the Dine-In wiring touches the session helper; it is
// mocked here (covered by its own unit spec and the real-PostgreSQL test).
jest.mock('../table-sessions/table-session-ordering', () => ({
  ...jest.requireActual('../table-sessions/table-session-ordering'),
  resolveDineInSessionSlot: jest.fn(),
}));
beforeEach(() => {
  (resolveDineInSessionSlot as jest.Mock).mockReset();
  (resolveDineInSessionSlot as jest.Mock).mockResolvedValue({
    tableSessionId: 'session-1',
    roundNumber: 1,
  });
});

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

const BRANCH_A = '11111111-1111-4111-8111-00000000000a';
const BRANCH_B = '11111111-1111-4111-8111-00000000000b';
const FOREIGN_BRANCH = '11111111-1111-4111-8111-0000000000ff';

const TABLE_QR_ROW = {
  id: 'qr-table',
  type: 'TABLE' as const,
  status: 'ACTIVE' as const,
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  tableId: 'table-1',
  restaurant: { status: 'ACTIVE' as const, defaultLocale: 'en', currencyCode: 'EGP' },
  table: { tableNumber: '7', status: 'ACTIVE' as const },
};

const GENERIC_QR_ROW = {
  id: 'qr-generic',
  type: 'GENERIC' as const,
  status: 'ACTIVE' as const,
  restaurantId: 'restaurant-1',
  branchId: null,
  tableId: null,
  restaurant: { status: 'ACTIVE' as const, defaultLocale: 'en', currencyCode: 'EGP' },
  table: null,
};

const PRODUCT_ROW = {
  id: 'product-1',
  basePrice: decimal('100.00'),
  translations: [{ name: 'Burger' }],
  category: { displayOrder: 0, translations: [{ name: 'Mains' }] },
  variants: [] as unknown[],
  modifierGroups: [] as unknown[],
};

const PRODUCT_WITH_SIZE_ROW = {
  ...PRODUCT_ROW,
  category: { displayOrder: 0, translations: [{ name: 'Mains' }] },
  variants: [] as unknown[],
  modifierGroups: [
    {
      id: 'group-size',
      minimumSelections: 1,
      maximumSelections: 1,
      displayOrder: 0,
      translations: [{ name: 'Size' }],
      options: [
        {
          id: 'option-large',
          priceAdjustment: decimal('20.00'),
          displayOrder: 0,
          translations: [{ name: 'Large' }],
        },
      ],
    },
  ],
};

const DINE_IN_ORDER_ROW = {
  id: 'order-dine-in',
  status: 'PENDING' as const,
  currencyCode: 'EGP',
  totalAmount: decimal('100.00'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  type: 'DINE_IN' as const,
  subtotalAmount: decimal('100.00'),
  deliveryFeeAmount: decimal('0.00'),
  deliveryZoneNameSnapshot: null as string | null,
  table: { tableNumber: '7' },
  branch: { name: 'Main Branch' },
  items: [],
};

const PICKUP_ORDER_ROW = {
  ...DINE_IN_ORDER_ROW,
  id: 'order-pickup',
  type: 'PICKUP' as const,
  table: null,
  branch: { name: 'Downtown' },
};

function buildMock(options: { qr: unknown; activeBranchIds?: string[] }) {
  const orderFindFirst = jest.fn().mockResolvedValue(null);
  const orderCreate = jest.fn().mockResolvedValue(PICKUP_ORDER_ROW);
  const branchFindMany = jest
    .fn()
    .mockResolvedValue((options.activeBranchIds ?? [BRANCH_A]).map((id) => ({ id })));
  const productFindMany = jest.fn().mockResolvedValue([PRODUCT_ROW]);

  const txClient = {
    menu: { findFirst: jest.fn().mockResolvedValue({ id: 'menu-1' }) },
    product: { findMany: productFindMany },
    order: { create: orderCreate },
  };
  const transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      qrCode: { findUnique: jest.fn().mockResolvedValue(options.qr) },
      order: { findFirst: orderFindFirst },
      branch: {
        findMany: branchFindMany,
        findFirst: jest.fn().mockResolvedValue({
          hoursMode: 'ALWAYS_OPEN',
          temporarilyClosed: false,
          openingHours: [],
        }),
      },
      $transaction: transaction,
    },
    orderFindFirst,
    orderCreate,
    branchFindMany,
    productFindMany,
    transaction,
  };
}

/** Every feature allowed (DEC-043): the default for a Restaurant without overrides. */
const ENTITLEMENTS = { forRestaurant: () => Promise.resolve(ALL_FEATURES) };

function buildService(mock: ReturnType<typeof buildMock>): PublicOrdersService {
  return new PublicOrdersService(mock.prisma as never, ENTITLEMENTS as never);
}

const BASE_INPUT = {
  publicCode: 'code-1',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  items: [{ productId: 'product-1', quantity: 1 }],
};

const PICKUP_INPUT = {
  ...BASE_INPUT,
  customerName: 'Sara Ali',
  customerPhone: '+20 100 000 0000',
  customerNotes: 'No onions',
};

describe('PublicOrdersService.createOrder -- TABLE QR stays DINE_IN (FT-7)', () => {
  it('creates a DINE_IN Order with the QR Table/Branch and no customer snapshots', async () => {
    const mock = buildMock({ qr: TABLE_QR_ROW });
    mock.orderCreate.mockResolvedValue(DINE_IN_ORDER_ROW);
    const service = buildService(mock);

    await service.createOrder(BASE_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      type: 'DINE_IN',
      tableId: 'table-1',
      branchId: 'branch-1',
      customerNameSnapshot: null,
      customerPhoneSnapshot: null,
      customerNotesSnapshot: null,
    });
    expect(mock.branchFindMany).not.toHaveBeenCalled();
  });

  it('ignores a spoofed Pickup branchId and customer fields (Branch/Table stay QR-derived)', async () => {
    const mock = buildMock({ qr: TABLE_QR_ROW });
    mock.orderCreate.mockResolvedValue(DINE_IN_ORDER_ROW);
    const service = buildService(mock);

    await service.createOrder({ ...PICKUP_INPUT, branchId: BRANCH_B });

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      type: 'DINE_IN',
      branchId: 'branch-1',
      tableId: 'table-1',
      customerNameSnapshot: null,
      customerPhoneSnapshot: null,
    });
    expect(mock.branchFindMany).not.toHaveBeenCalled();
  });

  it('keeps TABLE idempotency scoped by qr + its fixed Branch + clientRequestId', async () => {
    const mock = buildMock({ qr: TABLE_QR_ROW });
    mock.orderFindFirst.mockResolvedValue(DINE_IN_ORDER_ROW);
    const service = buildService(mock);

    const result = await service.createOrder(BASE_INPUT);

    expect(result.outcome).toBe('created');
    expect(mock.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          qrCodeId: 'qr-table',
          branchId: 'branch-1',
          clientRequestId: BASE_INPUT.clientRequestId,
        },
      }),
    );
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });
});

describe('PublicOrdersService.createOrder -- GENERIC QR creates PICKUP (FT-7)', () => {
  it('creates a PICKUP Order: no Table, the QR, the resolved Branch, customer snapshots', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    const result = await service.createOrder(PICKUP_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      type: 'PICKUP',
      tableId: null,
      qrCodeId: 'qr-generic',
      branchId: BRANCH_A,
      restaurantId: 'restaurant-1',
      customerNameSnapshot: 'Sara Ali',
      customerPhoneSnapshot: '+20 100 000 0000',
      customerNotesSnapshot: 'No onions',
    });
    expect(result).toEqual({
      outcome: 'created',
      data: expect.objectContaining({
        type: 'PICKUP',
        table: null,
        pickupBranch: { name: 'Downtown' },
      }),
    });
  });

  it('Table Sessions: a PICKUP Order never resolves a session and never carries session/round fields', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder(PICKUP_INPUT);

    expect(resolveDineInSessionSlot).not.toHaveBeenCalled();
    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('tableSessionId');
    expect(data).not.toHaveProperty('roundNumber');
  });

  it('stores blank customerNotes as null', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder({ ...PICKUP_INPUT, customerNotes: '   ' });

    expect(mock.orderCreate.mock.calls[0][0].data.customerNotesSnapshot).toBeNull();
  });

  it.each([
    ['name missing', { customerName: undefined }],
    ['name blank', { customerName: '   ' }],
    ['phone missing', { customerPhone: undefined }],
    ['phone blank', { customerPhone: '' }],
  ])('requires customer name and phone (%s)', async (_label, override) => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    const result = await service.createOrder({ ...PICKUP_INPUT, ...override });

    expect(result).toEqual({ outcome: 'customerDetailsRequired' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('a client payload cannot turn a GENERIC QR into DINE_IN', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder({ ...PICKUP_INPUT, type: 'DINE_IN', tableId: 'table-1' } as never);

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.type).toBe('PICKUP');
    expect(data.tableId).toBeNull();
  });

  it('prices Pickup exactly like Dine-In: Decimal base + modifiers, with modifier snapshots', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_SIZE_ROW]);
    const service = buildService(mock);

    await service.createOrder({
      ...PICKUP_INPUT,
      items: [{ productId: 'product-1', quantity: 2, modifierOptionIds: ['option-large'] }],
    });

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.totalAmount.toFixed(2)).toBe('240.00');
    expect(data.items.create[0].modifiers.create[0]).toMatchObject({
      modifierOptionNameSnapshot: 'Large',
    });
  });
});

describe('PublicOrdersService.createOrder -- Pickup Branch resolution (FT-7)', () => {
  it('queries only ACTIVE Branches of the QR-resolved Restaurant', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder(PICKUP_INPUT);

    expect(mock.branchFindMany.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      status: 'ACTIVE',
    });
  });

  it('auto-resolves the single ACTIVE Branch when branchId is omitted', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A] });
    const service = buildService(mock);

    await service.createOrder(PICKUP_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_A);
  });

  it('requires branchId when several ACTIVE Branches exist', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    const result = await service.createOrder(PICKUP_INPUT);

    expect(result).toEqual({ outcome: 'branchRequired' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid selected Branch among several ACTIVE Branches', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    await service.createOrder({ ...PICKUP_INPUT, branchId: BRANCH_B });

    expect(mock.orderCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_B);
  });

  it('rejects a foreign Restaurant Branch id (absent from the ACTIVE set)', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    const result = await service.createOrder({ ...PICKUP_INPUT, branchId: FOREIGN_BRANCH });

    expect(result).toEqual({ outcome: 'branchInvalid' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('rejects an INACTIVE Branch id (excluded from the ACTIVE set) even when only one Branch is ACTIVE', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A] });
    const service = buildService(mock);

    const result = await service.createOrder({ ...PICKUP_INPUT, branchId: BRANCH_B });

    expect(result).toEqual({ outcome: 'branchInvalid' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('reports pickupUnavailable when the Restaurant has no ACTIVE Branch', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [] });
    const service = buildService(mock);

    const result = await service.createOrder(PICKUP_INPUT);

    expect(result).toEqual({ outcome: 'pickupUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });
});

describe('PublicOrdersService.createOrder -- Pickup idempotency (FT-7)', () => {
  it('same GENERIC QR + same Branch + same clientRequestId returns the existing Order', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    mock.orderFindFirst.mockResolvedValue(PICKUP_ORDER_ROW);
    const service = buildService(mock);

    const result = await service.createOrder(PICKUP_INPUT);

    expect(result).toEqual({
      outcome: 'created',
      data: expect.objectContaining({ id: 'order-pickup' }),
    });
    expect(mock.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          qrCodeId: 'qr-generic',
          branchId: BRANCH_A,
          clientRequestId: BASE_INPUT.clientRequestId,
        },
      }),
    );
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('same GENERIC QR + same clientRequestId + DIFFERENT Branch looks up and creates distinct Orders', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, activeBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    await service.createOrder({ ...PICKUP_INPUT, branchId: BRANCH_A });
    await service.createOrder({ ...PICKUP_INPUT, branchId: BRANCH_B });

    const lookedUpBranches = mock.orderFindFirst.mock.calls.map((call) => call[0].where.branchId);
    expect(lookedUpBranches).toEqual([BRANCH_A, BRANCH_B]);
    expect(mock.orderCreate).toHaveBeenCalledTimes(2);
  });

  it('a concurrent Pickup duplicate recovers the winner scoped by qr + branch + clientRequestId', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const conflict = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & {
      code: string;
      meta: unknown;
    };
    conflict.code = 'P2002';
    conflict.meta = {
      driverAdapterError: {
        cause: { constraint: { index: 'orders_qr_code_id_branch_id_client_request_id_key' } },
      },
    };
    mock.transaction.mockRejectedValue(conflict);
    mock.orderFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(PICKUP_ORDER_ROW);
    const service = buildService(mock);

    const result = await service.createOrder(PICKUP_INPUT);

    expect(result.outcome).toBe('created');
    expect(mock.orderFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          qrCodeId: 'qr-generic',
          branchId: BRANCH_A,
          clientRequestId: BASE_INPUT.clientRequestId,
        },
      }),
    );
  });
});

describe('PublicOrdersService.createOrder -- restaurant ordering options', () => {
  const pickupInput = {
    ...BASE_INPUT,
    fulfillment: 'PICKUP' as const,
    customerName: 'Mona',
    customerPhone: '01000000000',
  };

  function genericQr(flags: { pickupEnabled?: boolean; deliveryEnabled?: boolean }) {
    return {
      ...GENERIC_QR_ROW,
      restaurant: { ...GENERIC_QR_ROW.restaurant, ...flags },
    };
  }

  it('refuses a Pickup order while Pickup is switched off, creating nothing', async () => {
    const mock = buildMock({ qr: genericQr({ pickupEnabled: false }) });

    const result = await buildService(mock).createOrder(pickupInput);

    expect(result).toEqual({ outcome: 'pickupUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
    // refused before any Branch lookup
    expect(mock.branchFindMany).not.toHaveBeenCalled();
  });

  it('refuses a Delivery order while Delivery is switched off, creating nothing', async () => {
    const mock = buildMock({ qr: genericQr({ deliveryEnabled: false }) });

    const result = await buildService(mock).createOrder({
      ...pickupInput,
      fulfillment: 'DELIVERY' as const,
      deliveryAddress: '1 Nile St',
      deliveryZoneId: '11111111-1111-4111-8111-0000000000aa',
    });

    expect(result).toEqual({ outcome: 'deliveryUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('Pickup keeps working when only Delivery is switched off', async () => {
    const mock = buildMock({ qr: genericQr({ deliveryEnabled: false }) });

    const result = await buildService(mock).createOrder(pickupInput);

    expect(result.outcome).toBe('created');
  });

  it('refuses a Dine-in order while Table ordering is switched off, creating nothing (DEC-038)', async () => {
    const mock = buildMock({
      qr: {
        ...TABLE_QR_ROW,
        restaurant: { ...TABLE_QR_ROW.restaurant, tableOrderingEnabled: false },
      },
    });

    const result = await buildService(mock).createOrder(BASE_INPUT);

    expect(result).toEqual({ outcome: 'tableOrderingDisabled' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('Table ordering off does not stop Pickup from the Restaurant QR', async () => {
    const mock = buildMock({
      qr: {
        ...GENERIC_QR_ROW,
        restaurant: { ...GENERIC_QR_ROW.restaurant, tableOrderingEnabled: false },
      },
    });

    const result = await buildService(mock).createOrder(pickupInput);

    expect(result.outcome).toBe('created');
  });

  it('a Table QR (Dine-in) is not affected by either switch', async () => {
    const mock = buildMock({
      qr: {
        ...TABLE_QR_ROW,
        restaurant: { ...TABLE_QR_ROW.restaurant, pickupEnabled: false, deliveryEnabled: false },
      },
    });

    const result = await buildService(mock).createOrder(BASE_INPUT);

    expect(result.outcome).toBe('created');
  });
});
