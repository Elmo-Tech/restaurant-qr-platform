import { Prisma } from '../generated/prisma/client';
import { PublicOrdersService } from './public-orders.service';

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
};

const CREATED_ORDER_ROW = {
  id: 'order-1',
  status: 'PENDING' as const,
  currencyCode: 'EGP',
  totalAmount: decimal('100.00'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  table: { tableNumber: '7' },
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

function buildPrismaMock() {
  const qrCodeFindUnique = jest.fn().mockResolvedValue(TABLE_QR_ROW);
  const orderFindFirst = jest.fn().mockResolvedValue(null);
  const menuFindFirst = jest.fn().mockResolvedValue({ id: 'menu-1' });
  const productFindMany = jest.fn().mockResolvedValue([PRODUCT_ROW]);
  const orderCreate = jest.fn().mockResolvedValue(CREATED_ORDER_ROW);

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
      $transaction: transaction,
    },
    qrCodeFindUnique,
    orderFindFirst,
    menuFindFirst,
    productFindMany,
    orderCreate,
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

  it('rejects a GENERIC QR (Section 3: ordering is TABLE QR only)', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      type: 'GENERIC',
      branchId: null,
      tableId: null,
      table: null,
    });
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
        table: { number: '7' },
        items: [
          {
            productId: 'product-1',
            name: 'Burger',
            quantity: 1,
            unitPrice: '100.00',
            lineTotal: '100.00',
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

    it('scopes the idempotency fast-path lookup by qrCodeId AND clientRequestId, NOT restaurantId alone (FT-5 critical fix)', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.createOrder(VALID_INPUT);

      expect(mock.orderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { qrCodeId: TABLE_QR_ROW.id, clientRequestId: VALID_INPUT.clientRequestId },
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
          where: { qrCodeId: 'qr-2', clientRequestId: VALID_INPUT.clientRequestId },
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
            constraint: { index: 'orders_qr_code_id_client_request_id_key' },
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
          where: { qrCodeId: TABLE_QR_ROW.id, clientRequestId: VALID_INPUT.clientRequestId },
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
