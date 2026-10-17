import { Prisma } from '../generated/prisma/client';
import { resolveDineInSessionSlot } from '../table-sessions/table-session-ordering';
import { PublicOrdersService } from './public-orders.service';

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
const ZONE_ID = '22222222-2222-4222-8222-000000000001';

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
  variants: [] as unknown[],
  modifierGroups: [] as unknown[],
};

const PRODUCT_WITH_SIZE_ROW = {
  ...PRODUCT_ROW,
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

const ZONE_ROW = {
  name: 'University District',
  translations: [] as { locale: string; name: string }[],
  restaurant: { defaultLocale: 'en' },
  deliveryFee: decimal('25.00'),
  minimumOrder: decimal('100.00'),
};

const BASE_ORDER_ROW = {
  id: 'order-1',
  status: 'PENDING' as const,
  currencyCode: 'EGP',
  totalAmount: decimal('125.00'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  type: 'DELIVERY' as const,
  subtotalAmount: decimal('100.00'),
  deliveryFeeAmount: decimal('25.00'),
  deliveryZoneNameSnapshot: 'University District' as string | null,
  table: null,
  branch: { name: 'Downtown' },
  items: [],
};

function buildMock(options: { qr: unknown; eligibleBranchIds?: string[]; zone?: unknown }) {
  const orderFindFirst = jest.fn().mockResolvedValue(null);
  const orderCreate = jest.fn().mockResolvedValue(BASE_ORDER_ROW);
  const branchFindMany = jest
    .fn()
    .mockResolvedValue((options.eligibleBranchIds ?? [BRANCH_A]).map((id) => ({ id })));
  const productFindMany = jest.fn().mockResolvedValue([PRODUCT_ROW]);
  const deliveryZoneFindFirst = jest
    .fn()
    .mockResolvedValue(options.zone === undefined ? ZONE_ROW : options.zone);

  const txClient = {
    menu: { findFirst: jest.fn().mockResolvedValue({ id: 'menu-1' }) },
    product: { findMany: productFindMany },
    deliveryZone: { findFirst: deliveryZoneFindFirst },
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
    deliveryZoneFindFirst,
    transaction,
  };
}

function buildService(mock: ReturnType<typeof buildMock>): PublicOrdersService {
  return new PublicOrdersService(mock.prisma as never);
}

const BASE_INPUT = {
  publicCode: 'code-1',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  items: [{ productId: 'product-1', quantity: 1 }],
};

const DELIVERY_INPUT = {
  ...BASE_INPUT,
  fulfillment: 'DELIVERY' as const,
  customerName: 'Sara Ali',
  customerPhone: '+20 100 000 0000',
  customerNotes: 'Ring twice',
  deliveryZoneId: ZONE_ID,
  deliveryAddress: '12 University St',
  deliveryBuilding: 'B4',
  deliveryFloor: '3',
  deliveryApartment: '12',
  deliveryLandmark: 'Near the library',
};

describe('PublicOrdersService.createOrder -- DELIVERY (FT-8)', () => {
  it('GENERIC + DELIVERY creates a DELIVERY Order with no Table', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      type: 'DELIVERY',
      tableId: null,
      qrCodeId: 'qr-generic',
      branchId: BRANCH_A,
      restaurantId: 'restaurant-1',
    });
    expect(result).toEqual({
      outcome: 'created',
      data: expect.objectContaining({
        type: 'DELIVERY',
        table: null,
        delivery: { branchName: 'Downtown', zoneName: 'University District' },
        subtotal: '100.00',
        deliveryFee: '25.00',
        total: '125.00',
      }),
    });
  });

  it.each([
    ['name missing', { customerName: undefined }, 'customerDetailsRequired'],
    ['phone missing', { customerPhone: '  ' }, 'customerDetailsRequired'],
    ['address missing', { deliveryAddress: undefined }, 'deliveryDetailsRequired'],
    ['address blank', { deliveryAddress: '   ' }, 'deliveryDetailsRequired'],
    ['zone missing', { deliveryZoneId: undefined }, 'deliveryZoneInvalid'],
  ])('requires name, phone, address and zone (%s)', async (_label, override, outcome) => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    const result = await service.createOrder({ ...DELIVERY_INPUT, ...override });

    expect(result).toEqual({ outcome });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('building, floor, apartment, landmark and notes are optional', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder({
      ...BASE_INPUT,
      fulfillment: 'DELIVERY',
      customerName: 'Sara',
      customerPhone: '123',
      deliveryZoneId: ZONE_ID,
      deliveryAddress: '12 University St',
    });

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      deliveryBuildingSnapshot: null,
      deliveryFloorSnapshot: null,
      deliveryApartmentSnapshot: null,
      deliveryLandmarkSnapshot: null,
      customerNotesSnapshot: null,
    });
  });

  it('a single eligible Delivery Branch auto-resolves when branchId is omitted', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A] });
    const service = buildService(mock);

    await service.createOrder(DELIVERY_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_A);
  });

  it('eligibility query = ACTIVE Branches of the QR Restaurant with at least one ACTIVE zone', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder(DELIVERY_INPUT);

    expect(mock.branchFindMany.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      status: 'ACTIVE',
      deliveryZones: { some: { status: 'ACTIVE' } },
    });
  });

  it('several eligible Branches require branchId', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT);

    expect(result).toEqual({ outcome: 'branchRequired' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid selected Branch among several eligible Branches', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    await service.createOrder({ ...DELIVERY_INPUT, branchId: BRANCH_B });

    expect(mock.orderCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_B);
  });

  it('rejects a foreign-Restaurant / unknown Branch (absent from the eligible set)', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    const result = await service.createOrder({ ...DELIVERY_INPUT, branchId: FOREIGN_BRANCH });

    expect(result).toEqual({ outcome: 'branchInvalid' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('rejects an INACTIVE Branch or one with no ACTIVE zone (excluded from the eligible set)', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A] });
    const service = buildService(mock);

    const result = await service.createOrder({ ...DELIVERY_INPUT, branchId: BRANCH_B });

    expect(result).toEqual({ outcome: 'branchInvalid' });
  });

  it('reports deliveryUnavailable when no Branch is Delivery-eligible', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [] });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT);

    expect(result).toEqual({ outcome: 'deliveryUnavailable' });
  });

  it('resolves the zone inside the transaction, scoped to Restaurant + selected Branch + ACTIVE', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, eligibleBranchIds: [BRANCH_A, BRANCH_B] });
    const service = buildService(mock);

    await service.createOrder({ ...DELIVERY_INPUT, branchId: BRANCH_B });

    expect(mock.deliveryZoneFindFirst.mock.calls[0][0].where).toEqual({
      id: ZONE_ID,
      restaurantId: 'restaurant-1',
      branchId: BRANCH_B,
      status: 'ACTIVE',
    });
  });

  it('a foreign / inactive / wrong-Branch zone (not found by the scoped lookup) is rejected with one outcome', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW, zone: null });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT);

    expect(result).toEqual({ outcome: 'deliveryZoneInvalid' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('adds the exact server-side Delivery fee to the items subtotal', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder({ ...DELIVERY_INPUT, items: [{ productId: 'product-1', quantity: 3 }] });

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.subtotalAmount.toFixed(2)).toBe('300.00');
    expect(data.deliveryFeeAmount.toFixed(2)).toBe('25.00');
    expect(data.totalAmount).toBeInstanceOf(Prisma.Decimal);
    expect(data.totalAmount.toFixed(2)).toBe('325.00');
  });

  it('a client cannot spoof the fee, minimum or total: those fields are never read', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder({
      ...DELIVERY_INPUT,
      deliveryFee: '0.00',
      minimumOrder: '0.00',
      total: '1.00',
      totalAmount: '1.00',
    } as never);

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.deliveryFeeAmount.toFixed(2)).toBe('25.00');
    expect(data.totalAmount.toFixed(2)).toBe('125.00');
  });

  it('enforces the zone minimum against the ITEMS subtotal, before the fee is added', async () => {
    const mock = buildMock({
      qr: GENERIC_QR_ROW,
      zone: { ...ZONE_ROW, minimumOrder: decimal('150.00') },
    });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT); // subtotal 100 < 150

    expect(result).toEqual({
      outcome: 'minimumOrderNotMet',
      zoneName: 'University District',
      minimumOrder: '150.00',
    });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('a subtotal exactly equal to the minimum is accepted', async () => {
    const mock = buildMock({
      qr: GENERIC_QR_ROW,
      zone: { ...ZONE_ROW, minimumOrder: decimal('100.00') },
    });
    const service = buildService(mock);

    const result = await service.createOrder(DELIVERY_INPUT);

    expect(result.outcome).toBe('created');
  });

  it('Product + Modifier pricing is unchanged: subtotal is exact base + modifiers, fee added after', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_SIZE_ROW]);
    const service = buildService(mock);

    await service.createOrder({
      ...DELIVERY_INPUT,
      items: [{ productId: 'product-1', quantity: 2, modifierOptionIds: ['option-large'] }],
    });

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.subtotalAmount.toFixed(2)).toBe('240.00');
    expect(data.totalAmount.toFixed(2)).toBe('265.00');
    expect(data.items.create[0].modifiers.create[0]).toMatchObject({
      modifierOptionNameSnapshot: 'Large',
    });
  });

  it('persists customer, zone and address snapshots (zone reference for traceability only)', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    const service = buildService(mock);

    await service.createOrder(DELIVERY_INPUT);

    expect(mock.orderCreate.mock.calls[0][0].data).toMatchObject({
      customerNameSnapshot: 'Sara Ali',
      customerPhoneSnapshot: '+20 100 000 0000',
      customerNotesSnapshot: 'Ring twice',
      deliveryZoneId: ZONE_ID,
      deliveryZoneNameSnapshot: 'University District',
      deliveryAddressSnapshot: '12 University St',
      deliveryBuildingSnapshot: 'B4',
      deliveryFloorSnapshot: '3',
      deliveryApartmentSnapshot: '12',
      deliveryLandmarkSnapshot: 'Near the library',
    });
  });

  describe('idempotency', () => {
    it('same GENERIC QR + Branch + clientRequestId returns the existing Order', async () => {
      const mock = buildMock({ qr: GENERIC_QR_ROW });
      mock.orderFindFirst.mockResolvedValue(BASE_ORDER_ROW);
      const service = buildService(mock);

      const result = await service.createOrder(DELIVERY_INPUT);

      expect(result).toEqual({
        outcome: 'created',
        data: expect.objectContaining({ id: 'order-1' }),
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

    it('a concurrent Delivery duplicate recovers the winner', async () => {
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
      mock.orderFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(BASE_ORDER_ROW);
      const service = buildService(mock);

      const result = await service.createOrder(DELIVERY_INPUT);

      expect(result.outcome).toBe('created');
    });
  });
});

describe('PublicOrdersService.createOrder -- other types unchanged by FT-8', () => {
  it('TABLE QR still creates DINE_IN, ignores fulfillment/delivery fields, never touches zones', async () => {
    const mock = buildMock({ qr: TABLE_QR_ROW });
    mock.orderCreate.mockResolvedValue({
      ...BASE_ORDER_ROW,
      type: 'DINE_IN',
      table: { tableNumber: '7' },
      deliveryZoneNameSnapshot: null,
      subtotalAmount: decimal('100.00'),
      deliveryFeeAmount: decimal('0.00'),
      totalAmount: decimal('100.00'),
    });
    const service = buildService(mock);

    await service.createOrder({ ...DELIVERY_INPUT, branchId: BRANCH_B });

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: 'DINE_IN',
      branchId: 'branch-1',
      tableId: 'table-1',
      deliveryZoneId: null,
      deliveryFeeAmount: expect.anything(),
    });
    expect(data.deliveryFeeAmount.toFixed(2)).toBe('0.00');
    expect(data.totalAmount.toFixed(2)).toBe('100.00');
    expect(mock.deliveryZoneFindFirst).not.toHaveBeenCalled();
    expect(mock.branchFindMany).not.toHaveBeenCalled();
  });

  it('GENERIC Pickup (default fulfillment) still works, with zero fee and no zone lookup', async () => {
    const mock = buildMock({ qr: GENERIC_QR_ROW });
    mock.orderCreate.mockResolvedValue({
      ...BASE_ORDER_ROW,
      type: 'PICKUP',
      deliveryZoneNameSnapshot: null,
      deliveryFeeAmount: decimal('0.00'),
      totalAmount: decimal('100.00'),
    });
    const service = buildService(mock);

    await service.createOrder({
      ...BASE_INPUT,
      customerName: 'Sara',
      customerPhone: '123',
    });

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'PICKUP', tableId: null, deliveryZoneId: null });
    expect(data.deliveryFeeAmount.toFixed(2)).toBe('0.00');
    expect(data.totalAmount.toFixed(2)).toBe('100.00');
    // Pickup Branch eligibility must NOT require a Delivery zone.
    expect(mock.branchFindMany.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      status: 'ACTIVE',
    });
    expect(mock.deliveryZoneFindFirst).not.toHaveBeenCalled();
  });
});
