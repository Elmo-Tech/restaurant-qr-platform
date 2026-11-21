/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Public Order idempotency (API_CONVENTIONS.md #76-#81, AGENTS.md #24) against REAL PostgreSQL
 * through the real Nest app:
 *
 * - same `clientRequestId` + same request      -> the ORIGINAL Order, never a second one (#79);
 * - same `clientRequestId` + different request -> `409 IDEMPOTENCY_KEY_REUSED`, no new Order,
 *   the original untouched (#80);
 * - the key stays scoped to the resolved QR + Branch (FT-5 / FT-7): another QR using the same
 *   client-chosen value is NOT a reuse;
 * - two identical concurrent submits still yield exactly one Order.
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the whole
 * suite is skipped.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

interface World {
  restaurantId: string;
  branchId: string;
  genericQr: string;
  tableQrs: string[];
  burgerId: string;
  saladId: string;
}

describeSandbox('Public Order idempotency key reuse (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    try {
      await assertSandboxIdentity(prisma);
    } catch (error) {
      await app.close();
      throw error;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedWorld(label: string, tableCount = 2): Promise<World> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-rest-${randomUUID()}`,
        name: `IT ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        locales: { create: [{ locale: 'en', isActive: true }] },
      },
    });
    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: `IT Branch ${label}`,
        status: 'ACTIVE',
        timezone: 'Etc/GMT-2',
      },
    });
    const tableQrs: string[] = [];
    for (let i = 0; i < tableCount; i += 1) {
      const table = await prisma.table.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableNumber: `T-${randomUUID().slice(0, 6)}`,
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `it-tqr-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      tableQrs.push(qr.publicCode);
    }
    const generic = await prisma.qrCode.create({
      data: {
        publicCode: `it-gqr-${randomUUID()}`,
        restaurantId: restaurant.id,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'IT menu',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translations: { create: { locale: 'en', name: 'IT Menu' } },
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: { locale: 'en', name: 'IT Mains' } },
      },
    });
    const product = (name: string, basePrice: string, displayOrder: number) =>
      prisma.product.create({
        data: {
          publicId: `product-${randomUUID()}`,
          restaurantId: restaurant.id,
          categoryId: category.id,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice,
          displayOrder,
          allowCustomerNotes: false,
          featured: false,
          translations: { create: { locale: 'en', name } },
        },
      });
    const burger = await product('IT Burger', '50.00', 0);
    const salad = await product('IT Salad', '30.00', 1);
    return {
      restaurantId: restaurant.id,
      branchId: branch.id,
      genericQr: generic.publicCode,
      tableQrs,
      burgerId: burger.id,
      saladId: salad.id,
    };
  }

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send(body);

  const ordersWithKey = (restaurantId: string, clientRequestId: string) =>
    prisma.order.findMany({
      where: { restaurantId, clientRequestId },
      select: {
        id: true,
        qrCodeId: true,
        totalAmount: true,
        items: { select: { productId: true, quantity: true } },
      },
    });

  /** Prints exactly what the API answered, so the run log documents the observed behavior. */
  const report = (label: string, res: request.Response) =>
    console.log(
      `[idempotency-reuse] ${label}: HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );

  // ================================================================== tests

  it('(1) same clientRequestId + identical payload retried returns the same Order, exactly one row', async () => {
    const world = await seedWorld('idem-same');
    const clientRequestId = randomUUID();
    const body = {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    };

    const first = await placeOrder(world.tableQrs[0], body);
    expect(first.status).toBe(201);
    const retry = await placeOrder(world.tableQrs[0], body);
    report('case 1 retry', retry);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.total).toBe(first.body.data.total);

    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });

  it('(2a) same clientRequestId + different quantity is refused with 409 IDEMPOTENCY_KEY_REUSED; no new Order, original unchanged', async () => {
    const world = await seedWorld('idem-qty');
    const clientRequestId = randomUUID();

    const first = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe('50.00');

    const reused = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 3 }],
    });
    report('case 2a (quantity 1 -> 3)', reused);
    const rows = await ordersWithKey(world.restaurantId, clientRequestId);
    console.log(
      `[idempotency-reuse] case 2a order rows with key: ${rows.length}; ` +
        `restaurant order count: ${await prisma.order.count({ where: { restaurantId: world.restaurantId } })}`,
    );

    // The original Order and its items are untouched, and no second Order exists.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.body.data.id);
    expect(rows[0].totalAmount.toFixed(2)).toBe('50.00');
    expect(rows[0].items).toEqual([{ productId: world.burgerId, quantity: 1 }]);

    // API_CONVENTIONS.md #80: never silently return the unrelated original Order.
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('(2b) same clientRequestId + different product is refused with 409 IDEMPOTENCY_KEY_REUSED; no new Order, original unchanged', async () => {
    const world = await seedWorld('idem-product');
    const clientRequestId = randomUUID();

    const first = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(first.status).toBe(201);

    const reused = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.saladId, quantity: 1 }],
    });
    report('case 2b (burger -> salad)', reused);
    const rows = await ordersWithKey(world.restaurantId, clientRequestId);
    console.log(
      `[idempotency-reuse] case 2b order rows with key: ${rows.length}`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.body.data.id);
    expect(rows[0].items).toEqual([{ productId: world.burgerId, quantity: 1 }]);

    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('(3) the same clientRequestId on a different QR code / Branch scope is NOT a reuse: each scope gets its own Order', async () => {
    const world = await seedWorld('idem-scope');
    const clientRequestId = randomUUID();

    const tableA = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(tableA.status).toBe(201);

    // Another Table QR of the same Restaurant/Branch, same client-chosen key, different cart.
    const tableB = await placeOrder(world.tableQrs[1], {
      clientRequestId,
      items: [{ productId: world.saladId, quantity: 2 }],
    });
    report('case 3 table B (same key, other Table QR)', tableB);
    expect(tableB.status).toBe(201);
    expect(tableB.body.data.id).not.toBe(tableA.body.data.id);

    // The Restaurant's GENERIC QR (Pickup) with the same key is its own scope too.
    const pickup = await placeOrder(world.genericQr, {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
      fulfillment: 'PICKUP',
      branchId: world.branchId,
      customerName: 'Test Guest',
      customerPhone: '+201000000001',
    });
    report('case 3 generic QR pickup (same key)', pickup);
    expect(pickup.status).toBe(201);
    expect(pickup.body.data.id).not.toBe(tableA.body.data.id);
    expect(pickup.body.data.id).not.toBe(tableB.body.data.id);

    const rows = await ordersWithKey(world.restaurantId, clientRequestId);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.qrCodeId)).size).toBe(3);
  });

  it('(4) two identical concurrent submits produce exactly one Order', async () => {
    const world = await seedWorld('idem-concurrent');
    const clientRequestId = randomUUID();
    const body = {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 2 }],
    };

    const [a, b] = await Promise.all([
      placeOrder(world.tableQrs[0], body),
      placeOrder(world.tableQrs[0], body),
    ]);
    report('case 4 concurrent a', a);
    report('case 4 concurrent b', b);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);

    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });

  // ------------------------------------------------- fix-specific coverage

  const storedFingerprint = async (orderId: string) =>
    (
      await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { clientRequestFingerprint: true },
      })
    ).clientRequestFingerprint;

  it('(5) stores only a 64-char SHA-256 hex fingerprint on a new Order', async () => {
    const world = await seedWorld('idem-stored');
    const created = await placeOrder(world.tableQrs[0], {
      clientRequestId: randomUUID(),
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const orderId = created.body.data.id as string;
    expect(await storedFingerprint(orderId)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(6) same payload retried after the Product price changed (and with a new expectedTotal / locale) replays the original: no PRICE_CHANGED, no 409', async () => {
    const world = await seedWorld('idem-price');
    const clientRequestId = randomUUID();
    const items = [{ productId: world.burgerId, quantity: 2 }];

    const first = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items,
      expectedTotal: '100.00',
      locale: 'en',
    });
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe('100.00');

    await prisma.product.update({
      where: { id: world.burgerId },
      data: { basePrice: '60.00' },
    });

    // A lost-response retry carrying the OLD expected total.
    const retryOld = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items,
      expectedTotal: '100.00',
      locale: 'en',
    });
    report('case 6 retry with old expectedTotal after price change', retryOld);
    expect(retryOld.status).toBe(201);
    expect(retryOld.body.data.id).toBe(first.body.data.id);
    expect(retryOld.body.data.total).toBe('100.00');

    // A retry after a PRICE_CHANGED reconfirmation (new expectedTotal), in another language.
    const retryNew = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items,
      expectedTotal: '120.00',
      locale: 'ar',
    });
    report('case 6 retry with new expectedTotal + locale', retryNew);
    expect(retryNew.status).toBe(201);
    expect(retryNew.body.data.id).toBe(first.body.data.id);

    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });

  it('(7) same key + different payload submitted concurrently: exactly one 201 and one 409, one row', async () => {
    const world = await seedWorld('idem-race-diff');
    const clientRequestId = randomUUID();

    const [a, b] = await Promise.all([
      placeOrder(world.tableQrs[0], {
        clientRequestId,
        items: [{ productId: world.burgerId, quantity: 1 }],
      }),
      placeOrder(world.tableQrs[0], {
        clientRequestId,
        items: [{ productId: world.saladId, quantity: 1 }],
      }),
    ]);
    report('case 7 concurrent a', a);
    report('case 7 concurrent b', b);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    const winner = a.status === 201 ? a : b;
    expect(loser.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const rows = await ordersWithKey(world.restaurantId, clientRequestId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(winner.body.data.id);
  });

  it('(8) same key + different payload on another Pickup Branch of the same GENERIC QR is its own scope (allowed)', async () => {
    const world = await seedWorld('idem-branch-scope');
    const branchB = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: world.restaurantId,
        name: 'IT Branch B',
        status: 'ACTIVE',
        timezone: 'Etc/GMT-2',
      },
    });
    const clientRequestId = randomUUID();
    const pickupBody = {
      clientRequestId,
      fulfillment: 'PICKUP',
      customerName: 'Test Guest',
      customerPhone: '+201000000001',
    };

    const atA = await placeOrder(world.genericQr, {
      ...pickupBody,
      branchId: world.branchId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(atA.status).toBe(201);
    const atB = await placeOrder(world.genericQr, {
      ...pickupBody,
      branchId: branchB.id,
      items: [{ productId: world.saladId, quantity: 3 }],
    });
    report('case 8 other branch same key different cart', atB);
    expect(atB.status).toBe(201);
    expect(atB.body.data.id).not.toBe(atA.body.data.id);

    // ... but at Branch A it IS a reuse with a different customer.
    const reusedA = await placeOrder(world.genericQr, {
      ...pickupBody,
      customerName: 'Another Guest',
      branchId: world.branchId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(reusedA.status).toBe(409);
    expect(reusedA.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    // A retry whose phone is written differently but normalizes to the same E.164 value is
    // the SAME request (identity uses post-normalization values).
    const retryA = await placeOrder(world.genericQr, {
      ...pickupBody,
      customerPhone: '01000000001',
      customerName: '  Test Guest ',
      branchId: world.branchId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    report('case 8 normalized retry at branch A', retryA);
    expect(retryA.status).toBe(201);
    expect(retryA.body.data.id).toBe(atA.body.data.id);

    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(2);
  });

  it('(9) a legacy Order with a NULL fingerprint keeps the old lenient replay', async () => {
    const world = await seedWorld('idem-legacy');
    const clientRequestId = randomUUID();
    const first = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(first.status).toBe(201);
    const legacyOrderId = first.body.data.id as string;
    // Simulate an Order created before the column existed.
    await prisma.order.update({
      where: { id: legacyOrderId },
      data: { clientRequestFingerprint: null },
    });

    const different = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.saladId, quantity: 2 }],
    });
    report('case 9 legacy row, different payload', different);
    expect(different.status).toBe(201);
    expect(different.body.data.id).toBe(first.body.data.id);
    expect(await storedFingerprint(legacyOrderId)).toBeNull();
    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });

  it('(10) the WhatsApp dry run is unaffected: the same key with different carts never 409s and stores nothing', async () => {
    const world = await seedWorld('idem-whatsapp');
    await prisma.restaurant.update({
      where: { id: world.restaurantId },
      data: { whatsappOrderingEnabled: true, whatsappNumber: '+201012345678' },
    });
    const clientRequestId = randomUUID();
    const body = {
      clientRequestId,
      fulfillment: 'PICKUP',
      customerName: 'Test Guest',
      customerPhone: '+201000000001',
    };
    const whatsappOrder = (extra: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/whatsapp-order`)
        .send({ ...body, ...extra });

    const one = await whatsappOrder({
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    const two = await whatsappOrder({
      items: [{ productId: world.saladId, quantity: 2 }],
    });
    report('case 10 whatsapp dry run #2', two);
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(one.body.data.total).toBe('50.00');
    expect(two.body.data.total).toBe('60.00');
    expect(
      await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
    ).toBe(0);
  });

  // ------------------------------------------------- unique-conflict (P2002) path
  //
  // Case 7 proves the race OUTCOME, but timing decides whether the loser is caught by the fast-path
  // lookup or by the unique index. These cases make the unique-conflict path deterministic: the
  // winning Order is already committed, and the loser's fast-path lookup (the first `order.findFirst`
  // for this key on the service's client) is made to miss once -- exactly what a request that read
  // just before the winner committed sees. Everything after that is real: the INSERT inside the
  // real transaction hits the real PostgreSQL unique index, the real driver-adapter P2002 error must
  // be recognised by its constraint name, and the winner lookup + fingerprint comparison run on the
  // real row. Only `findFirst` calls for this one key are intercepted, and only the first.

  /** Makes the next fast-path lookup for `clientRequestId` miss; returns the per-key call log. */
  function forceFastPathMissOnce(clientRequestId: string) {
    const original = prisma.order.findFirst.bind(prisma.order);
    const calls: ('forced-miss' | 'real')[] = [];
    const spy = jest
      .spyOn(prisma.order, 'findFirst')
      .mockImplementation(((args: {
        where?: { clientRequestId?: unknown };
      }) => {
        if (args?.where?.clientRequestId !== clientRequestId) {
          return original(args as never);
        }
        if (calls.length === 0) {
          calls.push('forced-miss');
          return Promise.resolve(null);
        }
        calls.push('real');
        return original(args as never);
      }) as never);
    return { calls, restore: () => spy.mockRestore() };
  }

  it('(11a) unique-conflict path, same payload: the real P2002 is recognised and the committed winner is replayed (201), one row', async () => {
    const world = await seedWorld('idem-p2002-same');
    const clientRequestId = randomUUID();
    const body = {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 2 }],
    };
    const winner = await placeOrder(world.tableQrs[0], body);
    expect(winner.status).toBe(201);

    const intercept = forceFastPathMissOnce(clientRequestId);
    let loser: request.Response;
    try {
      loser = await placeOrder(world.tableQrs[0], body);
    } finally {
      intercept.restore();
    }
    report('case 11a unique-conflict path, same payload', loser);
    // The forced miss, then the winner lookup of the P2002 branch: proves the loser went through
    // the INSERT -> unique violation -> catch path, not the fast path.
    expect(intercept.calls).toEqual(['forced-miss', 'real']);
    expect(loser.status).toBe(201);
    expect(loser.body.data.id).toBe(winner.body.data.id);
    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });

  it('(11b) unique-conflict path, different payload: 409 IDEMPOTENCY_KEY_REUSED, winner untouched, one row', async () => {
    const world = await seedWorld('idem-p2002-diff');
    const clientRequestId = randomUUID();
    const winner = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(winner.status).toBe(201);
    const winnerFingerprint = await storedFingerprint(
      winner.body.data.id as string,
    );

    const intercept = forceFastPathMissOnce(clientRequestId);
    let loser: request.Response;
    try {
      loser = await placeOrder(world.tableQrs[0], {
        clientRequestId,
        items: [{ productId: world.saladId, quantity: 3 }],
      });
    } finally {
      intercept.restore();
    }
    report('case 11b unique-conflict path, different payload', loser);
    expect(intercept.calls).toEqual(['forced-miss', 'real']);
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const rows = await ordersWithKey(world.restaurantId, clientRequestId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(winner.body.data.id);
    expect(rows[0].items).toEqual([{ productId: world.burgerId, quantity: 1 }]);
    expect(await storedFingerprint(winner.body.data.id as string)).toBe(
      winnerFingerprint,
    );
  });

  it('(11c) unique-conflict path against a legacy winner (NULL fingerprint): lenient replay (201), one row', async () => {
    const world = await seedWorld('idem-p2002-legacy');
    const clientRequestId = randomUUID();
    const winner = await placeOrder(world.tableQrs[0], {
      clientRequestId,
      items: [{ productId: world.burgerId, quantity: 1 }],
    });
    expect(winner.status).toBe(201);
    await prisma.order.update({
      where: { id: winner.body.data.id as string },
      data: { clientRequestFingerprint: null },
    });

    const intercept = forceFastPathMissOnce(clientRequestId);
    let loser: request.Response;
    try {
      loser = await placeOrder(world.tableQrs[0], {
        clientRequestId,
        items: [{ productId: world.saladId, quantity: 1 }],
      });
    } finally {
      intercept.restore();
    }
    report('case 11c unique-conflict path, legacy winner', loser);
    expect(intercept.calls).toEqual(['forced-miss', 'real']);
    expect(loser.status).toBe(201);
    expect(loser.body.data.id).toBe(winner.body.data.id);
    expect(
      await ordersWithKey(world.restaurantId, clientRequestId),
    ).toHaveLength(1);
  });
});
