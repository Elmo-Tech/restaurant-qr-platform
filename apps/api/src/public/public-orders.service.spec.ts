import { Prisma } from '../generated/prisma/client';
import {
  resolveDineInSessionSlot,
  TableNotOrderableError,
  TableOrderingUnavailableError,
} from '../table-sessions/table-session-ordering';
import { PublicOrdersService } from './public-orders.service';

// Table Sessions: the session/round logic is covered by its own unit spec and by
// the real-PostgreSQL integration test. Here only the wiring into createOrder is
// asserted, so the helper is mocked (its real error classes are kept).
jest.mock('../table-sessions/table-session-ordering', () => ({
  ...jest.requireActual('../table-sessions/table-session-ordering'),
  resolveDineInSessionSlot: jest.fn(),
}));
const resolveSlotMock = resolveDineInSessionSlot as jest.MockedFunction<
  typeof resolveDineInSessionSlot
>;
beforeEach(() => {
  resolveSlotMock.mockReset();
  resolveSlotMock.mockResolvedValue({
    tableSessionId: 'session-1',
    roundNumber: 1,
  });
});

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

const TABLE_QR_ROW = {
  id: 'qr-1',
  type: 'TABLE' as const,
  status: 'ACTIVE' as const,
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  tableId: 'table-1',
  restaurant: { status: 'ACTIVE' as const, defaultLocale: 'en', currencyCode: 'EGP' },
  table: { tableNumber: '7', status: 'ACTIVE' as const },
};

const PRODUCT_ROW = {
  id: 'product-1',
  basePrice: decimal('100.00'),
  translations: [{ name: 'Burger' }],
  modifierGroups: [] as {
    id: string;
    minimumSelections: number;
    maximumSelections: number;
    displayOrder: number;
    translations: { name: string }[];
    options: {
      id: string;
      priceAdjustment: Prisma.Decimal;
      displayOrder: number;
      translations: { name: string }[];
    }[];
  }[],
};

const CREATED_ORDER_ROW = {
  id: 'order-1',
  status: 'PENDING' as const,
  currencyCode: 'EGP',
  totalAmount: decimal('100.00'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  type: 'DINE_IN' as const,
  subtotalAmount: decimal('100.00'),
  deliveryFeeAmount: decimal('0.00'),
  deliveryZoneNameSnapshot: null as string | null,
  table: { tableNumber: '7' } as { tableNumber: string } | null,
  branch: { name: 'Main Branch' },
  items: [
    {
      productId: 'product-1',
      productNameSnapshot: 'Burger',
      unitPrice: decimal('100.00'),
      quantity: 1,
      lineTotal: decimal('100.00'),
      modifiers: [] as {
        modifierGroupNameSnapshot: string;
        modifierOptionNameSnapshot: string;
        priceAdjustmentSnapshot: Prisma.Decimal;
      }[],
    },
  ],
};

function buildPrismaMock() {
  const qrCodeFindUnique = jest.fn().mockResolvedValue(TABLE_QR_ROW);
  const orderFindFirst = jest.fn().mockResolvedValue(null);
  const menuFindFirst = jest.fn().mockResolvedValue({ id: 'menu-1' });
  const productFindMany = jest.fn().mockResolvedValue([PRODUCT_ROW]);
  const orderCreate = jest.fn().mockResolvedValue(CREATED_ORDER_ROW);
  const branchFindMany = jest.fn().mockResolvedValue([{ id: 'branch-1' }]);

  const txClient = {
    menu: { findFirst: menuFindFirst },
    product: { findMany: productFindMany },
    order: { create: orderCreate },
  };
  const transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      qrCode: { findUnique: qrCodeFindUnique },
      order: { findFirst: orderFindFirst },
      branch: { findMany: branchFindMany },
      $transaction: transaction,
    },
    qrCodeFindUnique,
    orderFindFirst,
    menuFindFirst,
    productFindMany,
    orderCreate,
    branchFindMany,
    transaction,
  };
}

function buildService(mock: ReturnType<typeof buildPrismaMock>): PublicOrdersService {
  return new PublicOrdersService(mock.prisma as never);
}

const VALID_INPUT = {
  publicCode: 'code-1',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  items: [{ productId: 'product-1', quantity: 1 }],
};

describe('PublicOrdersService.createOrder', () => {
  it('rejects an unknown publicCode', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'qrNotFound' });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it('rejects an INACTIVE QR', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({ ...TABLE_QR_ROW, status: 'INACTIVE' });
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'qrNotFound' });
  });


  it('rejects an INACTIVE Table', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      table: { tableNumber: '7', status: 'INACTIVE' },
    });
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'qrNotFound' });
  });

  it('rejects a suspended Restaurant even with an ACTIVE QR', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      restaurant: { ...TABLE_QR_ROW.restaurant, status: 'SUSPENDED' },
    });
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'qrNotFound' });
  });

  it('resolves the authoritative Tenant/Branch/Table from the QR, never from the request body', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    expect(mock.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          tableId: 'table-1',
          qrCodeId: 'qr-1',
        }),
      }),
    );
  });

  it('rejects duplicate productId entries within one submission', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-1', quantity: 2 },
      ],
    });

    expect(result).toEqual({ outcome: 'duplicateItems' });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it('rejects the whole Order when there is no ACTIVE primary Menu', async () => {
    const mock = buildPrismaMock();
    mock.menuFindFirst.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('rejects the whole Order when a Product is foreign/unknown', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([]);
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('rejects the WHOLE Order when only ONE of several items is unavailable (no partial Orders)', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_ROW]); // only product-1 returned
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-2', quantity: 1 }, // not orderable
      ],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('queries products scoped to ACTIVE status, AVAILABLE availability, ACTIVE Category, and the current primary Menu', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    const args = mock.productFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      restaurantId: 'restaurant-1',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      category: { status: 'ACTIVE', menuId: 'menu-1' },
    });
  });

  it('computes exact unit price, line total, and Order total via Decimal (never Number/parseFloat)', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      items: [{ productId: 'product-1', quantity: 3 }],
    });

    const args = mock.orderCreate.mock.calls[0][0];
    expect(args.data.totalAmount).toBeInstanceOf(Prisma.Decimal);
    expect((args.data.totalAmount as InstanceType<typeof Prisma.Decimal>).toFixed(2)).toBe(
      '300.00',
    );
    expect(args.data.items.create[0].unitPrice.toFixed(2)).toBe('100.00');
    expect(args.data.items.create[0].lineTotal.toFixed(2)).toBe('300.00');
    expect(args.data.items.create[0].quantity).toBe(3);
  });

  it('snapshots the Restaurant default-locale Product name and the Restaurant currencyCode', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    const args = mock.orderCreate.mock.calls[0][0];
    expect(args.data.items.create[0].productNameSnapshot).toBe('Burger');
    expect(args.data.currencyCode).toBe('EGP');
  });

  it('creates the Order and its Items atomically inside one transaction', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: { create: expect.any(Array) },
        }),
      }),
    );
  });

  it('FT-11: establishes the first OrderStatusEvent (null -> PENDING) as a nested create inside the same Order-creation call', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    expect(mock.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusEvents: {
            create: {
              restaurantId: 'restaurant-1',
              branchId: 'branch-1',
              previousStatus: null,
              newStatus: 'PENDING',
            },
          },
        }),
      }),
    );
  });

  it('returns the exact server-computed data on success, including the Table context', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({
      outcome: 'created',
      data: {
        id: 'order-1',
        status: 'PENDING',
        currencyCode: 'EGP',
        total: '100.00',
        createdAt: '2026-01-01T00:00:00.000Z',
        type: 'DINE_IN',
        table: { number: '7' },
        pickupBranch: null,
        delivery: null,
        subtotal: '100.00',
        deliveryFee: '0.00',
        discountTotal: '0.00',
        items: [
          {
            productId: 'product-1',
            name: 'Burger',
            quantity: 1,
            unitPrice: '100.00',
            discountAmount: '0.00',
            lineTotal: '100.00',
            modifiers: [],
          },
        ],
      },
    });
  });

  describe('idempotency', () => {
    it('same QR + same clientRequestId: returns the existing Order without creating a second one', async () => {
      const mock = buildPrismaMock();
      mock.orderFindFirst.mockResolvedValue(CREATED_ORDER_ROW);
      const service = buildService(mock);

      const result = await service.createOrder(VALID_INPUT);

      expect(result).toEqual({ outcome: 'created', data: expect.objectContaining({ id: 'order-1' }) });
      expect(mock.transaction).not.toHaveBeenCalled();
      expect(mock.orderCreate).not.toHaveBeenCalled();
    });

    it('scopes the idempotency fast-path lookup by qrCodeId + branchId + clientRequestId, NOT restaurantId alone (FT-5 critical fix, FT-7 branch scope)', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.createOrder(VALID_INPUT);

      expect(mock.orderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            qrCodeId: TABLE_QR_ROW.id,
            branchId: 'branch-1',
            clientRequestId: VALID_INPUT.clientRequestId,
          },
        }),
      );
      // The broad, incorrect scope must never be used.
      expect(mock.orderFindFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ restaurantId: expect.anything() }),
        }),
      );
    });

    it('DIFFERENT QR/Table in the SAME Restaurant + the SAME clientRequestId: creates a genuinely distinct Order, never reusing another Table’s Order', async () => {
      const mock = buildPrismaMock();
      // No existing row for THIS qrCodeId -- the fast path must actually
      // check qrCodeId, not just "any row with this clientRequestId
      // anywhere in the Restaurant" (which is exactly the bug being fixed).
      mock.orderFindFirst.mockResolvedValue(null);
      mock.orderCreate.mockResolvedValue({
        ...CREATED_ORDER_ROW,
        id: 'order-table-9',
        table: { tableNumber: '9' },
      });
      const otherTableQr = {
        ...TABLE_QR_ROW,
        id: 'qr-2',
        tableId: 'table-9',
        table: { tableNumber: '9', status: 'ACTIVE' as const },
      };
      mock.qrCodeFindUnique.mockResolvedValue(otherTableQr);
      const service = buildService(mock);

      const result = await service.createOrder(VALID_INPUT);

      expect(mock.orderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            qrCodeId: 'qr-2',
            branchId: 'branch-1',
            clientRequestId: VALID_INPUT.clientRequestId,
          },
        }),
      );
      expect(mock.transaction).toHaveBeenCalledTimes(1);
      expect(mock.orderCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ qrCodeId: 'qr-2' }) }),
      );
      expect(result).toEqual({
        outcome: 'created',
        data: expect.objectContaining({ id: 'order-table-9', table: { number: '9' } }),
      });
    });

    it('concurrent same QR + same clientRequestId: recovers by returning the winning Order, scoped by qrCodeId + clientRequestId', async () => {
      const mock = buildPrismaMock();
      const conflict = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & {
        code: string;
        meta: unknown;
      };
      conflict.code = 'P2002';
      conflict.meta = {
        driverAdapterError: {
          cause: {
            // The real Postgres unique-index name for
            // `@@unique([qrCodeId, clientRequestId])` (FT-5 critical fix --
            // was `orders_restaurant_id_client_request_id_key`).
            constraint: { index: 'orders_qr_code_id_branch_id_client_request_id_key' },
          },
        },
      };
      mock.transaction.mockRejectedValue(conflict);
      mock.orderFindFirst
        .mockResolvedValueOnce(null) // fast-path check: not found yet
        .mockResolvedValueOnce(CREATED_ORDER_ROW); // post-conflict winner fetch
      const service = buildService(mock);

      const result = await service.createOrder(VALID_INPUT);

      expect(result.outcome).toBe('created');
      expect(mock.orderFindFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            qrCodeId: TABLE_QR_ROW.id,
            branchId: 'branch-1',
            clientRequestId: VALID_INPUT.clientRequestId,
          },
        }),
      );
    });

    it('does NOT treat a P2002 on an unrelated constraint as an idempotency conflict', async () => {
      const mock = buildPrismaMock();
      const unrelatedConflict = Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      ) as Error & { code: string; meta: unknown };
      unrelatedConflict.code = 'P2002';
      unrelatedConflict.meta = {
        driverAdapterError: {
          cause: { constraint: { index: 'qr_codes_public_code_key' } },
        },
      };
      mock.transaction.mockRejectedValue(unrelatedConflict);
      const service = buildService(mock);

      await expect(service.createOrder(VALID_INPUT)).rejects.toBe(unrelatedConflict);
    });

    it('rethrows an unrelated persistence error unmapped', async () => {
      const mock = buildPrismaMock();
      const unexpected = new Error('connection reset');
      mock.transaction.mockRejectedValue(unexpected);
      const service = buildService(mock);

      await expect(service.createOrder(VALID_INPUT)).rejects.toBe(unexpected);
    });
  });
});

describe('PublicOrdersService.createOrder -- Modifiers (FT-6A)', () => {
  const SIZE_GROUP_ID = 'group-size';
  const SIZE_SMALL_ID = 'option-size-small';
  const SIZE_LARGE_ID = 'option-size-large';
  const EXTRAS_GROUP_ID = 'group-extras';
  const EXTRAS_CHEESE_ID = 'option-extras-cheese';
  const EXTRAS_BACON_ID = 'option-extras-bacon';

  /**
   * A Product with a REQUIRED single-select Group ("Size", minimum=1/
   * maximum=1) and an OPTIONAL multi-select Group ("Extras", minimum=0/
   * maximum=2) -- matches the batch's one required smoke-flow shape.
   * `productFindMany` in the real service only ever returns ACTIVE Groups/
   * Options (the query's own `where: { status: 'ACTIVE' }`) -- an option id
   * that is unknown, belongs to a different Product, or has since become
   * inactive are therefore indistinguishable at this mock boundary, exactly
   * as they are in the real implementation (all converge on the same
   * `itemsUnavailable` outcome).
   */
  const PRODUCT_WITH_MODIFIERS_ROW = {
    id: 'product-1',
    basePrice: decimal('100.00'),
    translations: [{ name: 'Burger' }],
    modifierGroups: [
      {
        id: SIZE_GROUP_ID,
        minimumSelections: 1,
        maximumSelections: 1,
        displayOrder: 0,
        translations: [{ name: 'Size' }],
        options: [
          {
            id: SIZE_SMALL_ID,
            priceAdjustment: decimal('0.00'),
            displayOrder: 0,
            translations: [{ name: 'Small' }],
          },
          {
            id: SIZE_LARGE_ID,
            priceAdjustment: decimal('20.00'),
            displayOrder: 1,
            translations: [{ name: 'Large' }],
          },
        ],
      },
      {
        id: EXTRAS_GROUP_ID,
        minimumSelections: 0,
        maximumSelections: 2,
        displayOrder: 1,
        translations: [{ name: 'Extras' }],
        options: [
          {
            id: EXTRAS_CHEESE_ID,
            priceAdjustment: decimal('10.00'),
            displayOrder: 0,
            translations: [{ name: 'Cheese' }],
          },
          {
            id: EXTRAS_BACON_ID,
            priceAdjustment: decimal('15.00'),
            displayOrder: 1,
            translations: [{ name: 'Bacon' }],
          },
        ],
      },
    ],
  };

  it('rejects the whole Order when a modifierOptionId is unknown/foreign (never belonged to any Product)', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: ['11111111-1111-4111-8111-000000000099'],
        },
      ],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('rejects the whole Order when a modifierOptionId belongs to a Group on a DIFFERENT Product', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    // Well-formed, real-looking id, but it is never part of `product-1`'s
    // own resolved modifierGroups -- resolved fresh per-Product, exactly
    // like it would be for an Option that genuinely belongs elsewhere.
    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: ['22222222-2222-4222-8222-000000000001'],
        },
      ],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('rejects the whole Order when a REQUIRED Group (minimumSelections >= 1) has zero selections', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      // Only the optional Extras Group is selected -- the required Size
      // Group is left with zero selections.
      items: [{ productId: 'product-1', quantity: 1, modifierOptionIds: [EXTRAS_CHEESE_ID] }],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('rejects the whole Order when a Group receives MORE selections than its maximumSelections', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      // Size only allows maximumSelections=1 -- selecting both options
      // violates it even though neither id is individually invalid.
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: [SIZE_SMALL_ID, SIZE_LARGE_ID],
        },
      ],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('rejects (duplicateItems) a repeated modifierOptionId within the same line item, before any DB work', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: [SIZE_LARGE_ID, SIZE_LARGE_ID],
        },
      ],
    });

    expect(result).toEqual({ outcome: 'duplicateItems' });
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it('rejects the whole Order when a selected Option is no longer ACTIVE (already excluded by the ACTIVE-only query)', async () => {
    const mock = buildPrismaMock();
    // Simulates Bacon having been deactivated since the Guest loaded the
    // Menu -- the real `where: { status: 'ACTIVE' }` filter would simply
    // omit it from the resolved Product, exactly like this mock.
    mock.productFindMany.mockResolvedValue([
      {
        ...PRODUCT_WITH_MODIFIERS_ROW,
        modifierGroups: [
          PRODUCT_WITH_MODIFIERS_ROW.modifierGroups[0],
          { ...PRODUCT_WITH_MODIFIERS_ROW.modifierGroups[1], options: [] },
        ],
      },
    ]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: [SIZE_SMALL_ID, EXTRAS_BACON_ID],
        },
      ],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
  });

  it('computes the exact line total via Decimal, including every selected modifier priceAdjustment', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 2,
          modifierOptionIds: [SIZE_LARGE_ID, EXTRAS_CHEESE_ID, EXTRAS_BACON_ID],
        },
      ],
    });

    const createArgs = mock.orderCreate.mock.calls[0][0] as {
      data: { totalAmount: { toFixed(digits: number): string }; items: { create: { unitPrice: { toFixed(digits: number): string }; lineTotal: { toFixed(digits: number): string } }[] } };
    };
    const [item] = createArgs.data.items.create;
    // unitPrice keeps its established meaning -- Product.basePrice ALONE,
    // never inflated by modifier adjustments.
    expect(item.unitPrice.toFixed(2)).toBe('100.00');
    // (100.00 base + 20.00 Large + 10.00 Cheese + 15.00 Bacon) * 2 = 290.00
    expect(item.lineTotal.toFixed(2)).toBe('290.00');
    expect(createArgs.data.totalAmount.toFixed(2)).toBe('290.00');
  });

  it('creates OrderItemModifier snapshot rows with resolved names/price, ordered by Group-then-Option displayOrder', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      // Submitted out of display order on purpose -- the persisted
      // snapshot order must reflect the Menu's own Group/Option
      // displayOrder, never Guest submission order.
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: [EXTRAS_BACON_ID, SIZE_LARGE_ID],
        },
      ],
    });

    const createArgs = mock.orderCreate.mock.calls[0][0] as {
      data: {
        items: {
          create: {
            modifiers: {
              create: {
                modifierGroupId: string;
                modifierOptionId: string;
                modifierGroupNameSnapshot: string;
                modifierOptionNameSnapshot: string;
                priceAdjustmentSnapshot: { toFixed(digits: number): string };
                displayOrder: number;
              }[];
            };
          }[];
        };
      };
    };
    const [item] = createArgs.data.items.create;

    expect(item.modifiers.create).toHaveLength(2);
    expect(item.modifiers.create[0]).toMatchObject({
      modifierGroupId: SIZE_GROUP_ID,
      modifierOptionId: SIZE_LARGE_ID,
      modifierGroupNameSnapshot: 'Size',
      modifierOptionNameSnapshot: 'Large',
      displayOrder: 0,
    });
    expect(item.modifiers.create[0].priceAdjustmentSnapshot.toFixed(2)).toBe('20.00');
    expect(item.modifiers.create[1]).toMatchObject({
      modifierGroupId: EXTRAS_GROUP_ID,
      modifierOptionId: EXTRAS_BACON_ID,
      modifierGroupNameSnapshot: 'Extras',
      modifierOptionNameSnapshot: 'Bacon',
      displayOrder: 1,
    });
    expect(item.modifiers.create[1].priceAdjustmentSnapshot.toFixed(2)).toBe('15.00');
  });

  it('creates the Order, its Item, and every modifier snapshot atomically inside one transaction', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      items: [{ productId: 'product-1', quantity: 1, modifierOptionIds: [SIZE_SMALL_ID] }],
    });

    // One `$transaction` call, one nested `order.create` whose `items.create`
    // already embeds `modifiers.create` -- never a separate write for the
    // modifier snapshot rows outside this same atomic call.
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.orderCreate).toHaveBeenCalledTimes(1);
  });

  it('accepts the SAME Product twice with DIFFERENT modifier selections as two distinct lines, never as a duplicate', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([PRODUCT_WITH_MODIFIERS_ROW]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        { productId: 'product-1', quantity: 1, modifierOptionIds: [SIZE_SMALL_ID] },
        { productId: 'product-1', quantity: 1, modifierOptionIds: [SIZE_LARGE_ID] },
      ],
    });

    expect(result.outcome).toBe('created');
    const createArgs = mock.orderCreate.mock.calls[0][0] as {
      data: { items: { create: unknown[] } };
    };
    expect(createArgs.data.items.create).toHaveLength(2);
  });

  it('idempotent retry with modifierOptionIds present still short-circuits on the fast path, never re-validating modifiers', async () => {
    const mock = buildPrismaMock();
    mock.orderFindFirst.mockResolvedValue(CREATED_ORDER_ROW);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [{ productId: 'product-1', quantity: 1, modifierOptionIds: [SIZE_LARGE_ID] }],
    });

    expect(result.outcome).toBe('created');
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  // FT-6A final blocker fix: the DTO no longer imposes an invented
  // total-selection cap -- the Product's own active Modifier configuration
  // (minimumSelections/maximumSelections PER Group) remains the sole
  // authority. A Group that legitimately allows more than 20 selections
  // must succeed, never rejected by a coincidental array-length limit.
  it('accepts more than 20 selected options when the Group configuration actually allows it', async () => {
    const manyOptions = Array.from({ length: 25 }, (_, index) => ({
      id: `option-extra-${index}`,
      priceAdjustment: decimal('1.00'),
      displayOrder: index,
      translations: [{ name: `Extra ${index}` }],
    }));
    const productWithLargeGroup = {
      id: 'product-1',
      basePrice: decimal('100.00'),
      translations: [{ name: 'Burger' }],
      modifierGroups: [
        {
          id: 'group-many-extras',
          minimumSelections: 0,
          maximumSelections: 25,
          displayOrder: 0,
          translations: [{ name: 'Extras' }],
          options: manyOptions,
        },
      ],
    };
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([productWithLargeGroup]);
    const service = buildService(mock);

    const result = await service.createOrder({
      ...VALID_INPUT,
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          modifierOptionIds: manyOptions.map((option) => option.id),
        },
      ],
    });

    expect(result.outcome).toBe('created');
  });
});

describe('PublicOrdersService.createOrder -- Table Sessions wiring (Slice 1)', () => {
  it('resolves the session slot INSIDE the transaction, scoped by the QR-derived tenant/branch/table, and stores session + round on the Order', async () => {
    const mock = buildPrismaMock();
    resolveSlotMock.mockResolvedValue({
      tableSessionId: 'session-9',
      roundNumber: 3,
    });
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      // Never authority: ignored for a TABLE QR.
      branchId: 'attacker-branch',
    });

    expect(resolveSlotMock).toHaveBeenCalledTimes(1);
    expect(resolveSlotMock.mock.calls[0][1]).toEqual({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      tableId: 'table-1',
    });
    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.tableSessionId).toBe('session-9');
    expect(data.roundNumber).toBe(3);
    // The slot was resolved with the transaction client, not the root client.
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing pricing/snapshot fields untouched when a session is attached', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    const data = mock.orderCreate.mock.calls[0][0].data;
    expect(data.type).toBe('DINE_IN');
    expect(data.status).toBe('PENDING');
    expect(data.totalAmount.toFixed(2)).toBe('100.00');
    expect(data.subtotalAmount.toFixed(2)).toBe('100.00');
  });

  it('returns tableOrderingUnavailable and creates nothing when the table is locked by staff', async () => {
    const mock = buildPrismaMock();
    resolveSlotMock.mockRejectedValue(new TableOrderingUnavailableError());
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'tableOrderingUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('treats a table that stopped being orderable between the QR lookup and the lock exactly like an unknown QR', async () => {
    const mock = buildPrismaMock();
    resolveSlotMock.mockRejectedValue(new TableNotOrderableError());
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'qrNotFound' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });

  it('maps the closed-session database trigger (SQLSTATE TS001) to tableOrderingUnavailable, never a raw database error', async () => {
    const mock = buildPrismaMock();
    mock.orderCreate.mockRejectedValue(
      Object.assign(new Error('Raw query failed'), { code: 'TS001' }),
    );
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'tableOrderingUnavailable' });
  });

  it('an unrelated persistence error still propagates unmapped', async () => {
    const mock = buildPrismaMock();
    mock.orderCreate.mockRejectedValue(new Error('connection reset'));
    const service = buildService(mock);

    await expect(service.createOrder(VALID_INPUT)).rejects.toThrow(
      'connection reset',
    );
  });

  it('an idempotent retry returns the ORIGINAL order on the fast path without touching sessions, even if the table was locked since', async () => {
    const mock = buildPrismaMock();
    mock.orderFindFirst.mockResolvedValue(CREATED_ORDER_ROW);
    resolveSlotMock.mockRejectedValue(new TableOrderingUnavailableError());
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result.outcome).toBe('created');
    expect(resolveSlotMock).not.toHaveBeenCalled();
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it('does not allocate a session when the whole Order is rejected for unavailable items (rolled back with the transaction)', async () => {
    const mock = buildPrismaMock();
    mock.productFindMany.mockResolvedValue([]);
    const service = buildService(mock);

    const result = await service.createOrder(VALID_INPUT);

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
    expect(mock.orderCreate).not.toHaveBeenCalled();
  });
});

describe('PublicOrdersService.createOrder -- product discounts', () => {
  const NOW = new Date('2026-10-11T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function withProduct(overrides: Record<string, unknown>, qrBranchTimezone = 'UTC') {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      branch: { timezone: qrBranchTimezone },
    });
    mock.productFindMany.mockResolvedValue([
      {
        ...PRODUCT_ROW,
        discountType: 'PERCENTAGE',
        discountValue: decimal('20'),
        discountEnabled: true,
        discountStartsOn: null,
        discountEndsOn: null,
        ...overrides,
      },
    ]);
    return mock;
  }

  function createdData(mock: ReturnType<typeof buildPrismaMock>) {
    const calls = mock.orderCreate.mock.calls as unknown[][];
    return (calls[0][0] as { data: Record<string, unknown> }).data as {
      subtotalAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      discountTotalAmount: Prisma.Decimal;
      items: {
        create: {
          unitPrice: Prisma.Decimal;
          lineTotal: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          discountTypeSnapshot: string | null;
          discountValueSnapshot: Prisma.Decimal | null;
        }[];
      };
    };
  }

  it('percentage: snapshots the ORIGINAL unit price, the discount and the net line total', async () => {
    const mock = withProduct({});
    const service = buildService(mock);

    await service.createOrder({ ...VALID_INPUT, items: [{ productId: 'product-1', quantity: 2 }] });

    const data = createdData(mock);
    const item = data.items.create[0];
    expect(item.unitPrice.toFixed(2)).toBe('100.00');
    expect(item.discountAmount.toFixed(2)).toBe('40.00');
    expect(item.lineTotal.toFixed(2)).toBe('160.00');
    expect(item.discountTypeSnapshot).toBe('PERCENTAGE');
    expect(item.discountValueSnapshot?.toFixed(2)).toBe('20.00');
    expect(data.subtotalAmount.toFixed(2)).toBe('160.00');
    expect(data.totalAmount.toFixed(2)).toBe('160.00');
    expect(data.discountTotalAmount.toFixed(2)).toBe('40.00');
  });

  it('fixed amount with a paid extra: the extra is never discounted and quantity multiplies the net unit', async () => {
    const mock = withProduct({
      basePrice: decimal('180.00'),
      discountType: 'FIXED_AMOUNT',
      discountValue: decimal('30'),
      modifierGroups: [
        {
          id: 'group-1',
          minimumSelections: 0,
          maximumSelections: 1,
          displayOrder: 0,
          translations: [{ name: 'Extras' }],
          options: [
            {
              id: 'option-1',
              priceAdjustment: decimal('15.00'),
              displayOrder: 0,
              translations: [{ name: 'Extra cheese' }],
            },
          ],
        },
      ],
    });
    const service = buildService(mock);

    await service.createOrder({
      ...VALID_INPUT,
      items: [{ productId: 'product-1', quantity: 2, modifierOptionIds: ['option-1'] }],
    });

    const item = createdData(mock).items.create[0];
    // (180 - 30 + 15) * 2 = 330 ; discount 30 * 2 = 60 ; unit price stays 180
    expect(item.unitPrice.toFixed(2)).toBe('180.00');
    expect(item.discountAmount.toFixed(2)).toBe('60.00');
    expect(item.lineTotal.toFixed(2)).toBe('330.00');
  });

  it('a fixed discount larger than the price is capped: the line is free, never negative', async () => {
    const mock = withProduct({
      basePrice: decimal('40.00'),
      discountType: 'FIXED_AMOUNT',
      discountValue: decimal('50'),
    });
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    const item = createdData(mock).items.create[0];
    expect(item.discountAmount.toFixed(2)).toBe('40.00');
    expect(item.lineTotal.toFixed(2)).toBe('0.00');
  });

  it.each([
    ['disabled', { discountEnabled: false }],
    ['not yet started', { discountStartsOn: new Date('2026-10-12T00:00:00Z') }],
    ['expired', { discountEndsOn: new Date('2026-10-10T00:00:00Z') }],
  ])('a %s discount charges the normal price and records no discount', async (_label, overrides) => {
    const mock = withProduct(overrides);
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    const data = createdData(mock);
    const item = data.items.create[0];
    expect(item.lineTotal.toFixed(2)).toBe('100.00');
    expect(item.discountAmount.toFixed(2)).toBe('0.00');
    expect(item.discountTypeSnapshot).toBeNull();
    expect(data.discountTotalAmount.toFixed(2)).toBe('0.00');
  });

  it('the end date is inclusive: a discount ending today still applies today', async () => {
    const mock = withProduct({ discountEndsOn: new Date('2026-10-11T00:00:00Z') });
    const service = buildService(mock);

    await service.createOrder(VALID_INPUT);

    expect(createdData(mock).items.create[0].lineTotal.toFixed(2)).toBe('80.00');
  });

  it('evaluates the date in the Branch timezone, not the server timezone', async () => {
    // 2026-10-10T22:30Z is still 10 Oct in UTC but already 11 Oct 01:30 in Cairo.
    jest.setSystemTime(new Date('2026-10-10T22:30:00.000Z'));
    const endsOnTenth = { discountEndsOn: new Date('2026-10-10T00:00:00Z') };

    const utcBranch = withProduct(endsOnTenth, 'UTC');
    await buildService(utcBranch).createOrder(VALID_INPUT);
    const cairoBranch = withProduct(endsOnTenth, 'Africa/Cairo');
    await buildService(cairoBranch).createOrder(VALID_INPUT);

    expect(createdData(utcBranch).items.create[0].lineTotal.toFixed(2)).toBe('80.00');
    expect(createdData(cairoBranch).items.create[0].lineTotal.toFixed(2)).toBe('100.00');
  });

  describe('price staleness (expectedTotal)', () => {
    it('a stale displayed total creates NOTHING and returns the current total', async () => {
      const mock = withProduct({ discountEnabled: false });
      const service = buildService(mock);

      // the Guest still sees the 20% discount (80.00) but it is off now (100.00)
      const result = await service.createOrder({ ...VALID_INPUT, expectedTotal: '80.00' });

      expect(result).toEqual({
        outcome: 'priceChanged',
        pricing: expect.objectContaining({ discountTotal: '0.00', total: '100.00' }),
      });
      expect(mock.orderCreate).not.toHaveBeenCalled();
    });

    it('a matching displayed total proceeds; omitting it (old clients) never blocks', async () => {
      const matching = withProduct({});
      const omitted = withProduct({});

      const ok = await buildService(matching).createOrder({ ...VALID_INPUT, expectedTotal: '80.00' });
      const legacy = await buildService(omitted).createOrder(VALID_INPUT);

      expect(ok.outcome).toBe('created');
      expect(legacy.outcome).toBe('created');
    });

    it('an idempotent retry returns the ORIGINAL order even if prices changed since', async () => {
      const mock = withProduct({ discountEnabled: false });
      mock.orderFindFirst.mockResolvedValue(CREATED_ORDER_ROW);
      const service = buildService(mock);

      const result = await service.createOrder({ ...VALID_INPUT, expectedTotal: '1.00' });

      expect(result.outcome).toBe('created');
      expect(mock.orderCreate).not.toHaveBeenCalled();
    });
  });
});
