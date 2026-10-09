import {
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './../src/generated/prisma/client';
import { PublicOrdersService } from './../src/public/public-orders.service';
import { isClosedSessionTriggerViolation } from './../src/table-sessions/table-session-ordering';

/**
 * Table Sessions, Slice 1: REAL-PostgreSQL integration tests (no mocks) for
 * session creation/attachment, round allocation, the table lock, idempotency,
 * the CHECK / partial-unique / composite-FK integrity and both triggers.
 *
 * Isolation: see `support/sandbox-guard.ts` (sandbox-only, identity-checked,
 * skipped without TABLE_SESSION_IT_DATABASE_URL).
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

interface Tenant {
  restaurantId: string;
  branchId: string;
  tableId: string;
  qrCode: string;
  productId: string;
  menuId: string;
}

describeSandbox('Table Sessions Slice 1 (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: PublicOrdersService;

  beforeAll(async () => {
    assertSandboxUrl(SANDBOX_URL as string);
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: SANDBOX_URL as string,
        max: 20,
      }),
    });
    await prisma.$connect();
    try {
      await assertSandboxIdentity(prisma);
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
    service = new PublicOrdersService(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedTenant(label: string, tableNumber = '1'): Promise<Tenant> {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `it-rest-${randomUUID()}`,
        name: `IT ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: `IT Branch ${label}`,
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
      },
    });
    const table = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableNumber,
        status: 'ACTIVE',
      },
    });
    const qr = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        type: 'TABLE',
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
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    const product = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '50.00',
        displayOrder: 0,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name: 'IT Burger' } },
      },
    });
    return {
      restaurantId: restaurant.id,
      branchId: branch.id,
      tableId: table.id,
      qrCode: qr.publicCode,
      productId: product.id,
      menuId: menu.id,
    };
  }

  async function addTable(tenant: Tenant, tableNumber: string) {
    const table = await prisma.table.create({
      data: {
        restaurantId: tenant.restaurantId,
        branchId: tenant.branchId,
        tableNumber,
        status: 'ACTIVE',
      },
    });
    const qr = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: tenant.restaurantId,
        branchId: tenant.branchId,
        tableId: table.id,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    return { tableId: table.id, qrCode: qr.publicCode };
  }

  function place(
    tenant: { qrCode: string; productId: string },
    clientRequestId: string = randomUUID(),
    qrOverride?: string,
  ) {
    return service.createOrder({
      publicCode: qrOverride ?? tenant.qrCode,
      clientRequestId,
      items: [{ productId: tenant.productId, quantity: 1 }],
    });
  }

  async function sessionsOf(tableId: string) {
    return prisma.tableSession.findMany({
      where: { tableId },
      orderBy: { openedAt: 'asc' },
    });
  }

  async function ordersOf(tableId: string) {
    return prisma.order.findMany({
      where: { tableId },
      orderBy: { roundNumber: 'asc' },
    });
  }

  async function lockTable(tableId: string) {
    await prisma.$executeRaw`UPDATE "tables" SET "staff_open_required" = true WHERE "id" = ${tableId}::uuid`;
  }

  /** Simulates what the later "close" slice will do: close the session AND lock the table, atomically. */
  async function closeSessionAndLock(
    sessionId: string,
    tableId: string,
    lock = true,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "tables" WHERE "id" = ${tableId}::uuid FOR NO KEY UPDATE`;
      await tx.$executeRaw`UPDATE "table_sessions"
          SET "status" = 'CLOSED', "closed_at" = now(), "closure_reason" = 'NORMAL'
        WHERE "id" = ${sessionId}::uuid`;
      if (lock) {
        await tx.$executeRaw`UPDATE "tables" SET "staff_open_required" = true WHERE "id" = ${tableId}::uuid`;
      }
    });
  }

  function rawOrderData(
    tenant: Tenant,
    overrides: Record<string, unknown> = {},
  ): Parameters<PrismaClient['order']['create']>[0]['data'] {
    return {
      restaurantId: tenant.restaurantId,
      branchId: tenant.branchId,
      tableId: tenant.tableId,
      qrCodeId: undefined as never,
      clientRequestId: randomUUID(),
      status: 'PENDING',
      type: 'DINE_IN',
      currencyCode: 'EGP',
      totalAmount: '10.00',
      subtotalAmount: '10.00',
      deliveryFeeAmount: '0.00',
      ...overrides,
    } as never;
  }

  async function qrIdOf(code: string) {
    return (
      await prisma.qrCode.findUniqueOrThrow({ where: { publicCode: code } })
    ).id;
  }

  async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      await fn();
    } catch (error) {
      return error;
    }
    throw new Error('expected the operation to fail');
  }

  // ------------------------------------------------------- creation + rounds

  it('the first Dine-In order opens exactly one OPEN session (FIRST_ORDER), round 1, with one SESSION_OPENED event', async () => {
    const t = await seedTenant('first');

    const result = await place(t);
    expect(result.outcome).toBe('created');

    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      status: 'OPEN',
      openedVia: 'FIRST_ORDER',
      nextRoundNumber: 2,
      restaurantId: t.restaurantId,
      branchId: t.branchId,
      closedAt: null,
      closureReason: null,
    });
    expect(sessions[0].publicId).toMatch(/^session-/);
    const orders = await ordersOf(t.tableId);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      tableSessionId: sessions[0].id,
      roundNumber: 1,
      type: 'DINE_IN',
    });
    const events = await prisma.tableSessionEvent.findMany({
      where: { tableSessionId: sessions[0].id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'SESSION_OPENED',
      actorType: 'GUEST',
    });
  });

  it('later orders join the same OPEN session with sequential rounds (no extra session or event)', async () => {
    const t = await seedTenant('join');

    await place(t);
    await place(t);
    await place(t);

    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].nextRoundNumber).toBe(4);
    expect((await ordersOf(t.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(
      await prisma.tableSessionEvent.count({
        where: { tableSessionId: sessions[0].id },
      }),
    ).toBe(1);
  });

  it('pricing and snapshots are unchanged by sessions (server-authoritative totals, name snapshot)', async () => {
    const t = await seedTenant('pricing');

    const result = await place(t);

    expect(result.outcome).toBe('created');
    const order = (await ordersOf(t.tableId))[0];
    expect(order.totalAmount.toFixed(2)).toBe('50.00');
    expect(order.subtotalAmount.toFixed(2)).toBe('50.00');
    expect(order.currencyCode).toBe('EGP');
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(item.productNameSnapshot).toBe('IT Burger');
    expect(item.unitPrice.toFixed(2)).toBe('50.00');
  });

  // --------------------------------------------------------------- concurrency

  it('two SIMULTANEOUS first orders on one table create ONE session with rounds 1 and 2', async () => {
    const t = await seedTenant('race2');

    const results = await Promise.all([place(t), place(t)]);

    expect(results.map((r) => r.outcome)).toEqual(['created', 'created']);
    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].nextRoundNumber).toBe(3);
    expect((await ordersOf(t.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2,
    ]);
    expect(
      await prisma.tableSessionEvent.count({
        where: { tableSessionId: sessions[0].id },
      }),
    ).toBe(1);
  });

  it('12 simultaneous first orders: one session, rounds exactly 1..12, no gaps, no duplicates', async () => {
    const t = await seedTenant('race12');

    const results = await Promise.all(
      Array.from({ length: 12 }, () => place(t)),
    );

    expect(results.every((r) => r.outcome === 'created')).toBe(true);
    expect(await sessionsOf(t.tableId)).toHaveLength(1);
    const rounds = (await ordersOf(t.tableId)).map((o) => o.roundNumber);
    expect(rounds).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect((await sessionsOf(t.tableId))[0].nextRoundNumber).toBe(13);
  });

  it('simultaneous orders joining an EXISTING session get unique sequential rounds', async () => {
    const t = await seedTenant('racejoin');
    await place(t);

    await Promise.all(Array.from({ length: 8 }, () => place(t)));

    expect(await sessionsOf(t.tableId)).toHaveLength(1);
    expect((await ordersOf(t.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('simultaneous orders on DIFFERENT tables never share a session and never block each other into collisions', async () => {
    const t = await seedTenant('multitable');
    const second = await addTable(t, '2');
    const third = await addTable(t, '3');

    await Promise.all([
      place(t),
      place(t),
      place({ qrCode: second.qrCode, productId: t.productId }),
      place({ qrCode: second.qrCode, productId: t.productId }),
      place({ qrCode: third.qrCode, productId: t.productId }),
    ]);

    const a = await sessionsOf(t.tableId);
    const b = await sessionsOf(second.tableId);
    const c = await sessionsOf(third.tableId);
    expect([a.length, b.length, c.length]).toEqual([1, 1, 1]);
    expect(new Set([a[0].id, b[0].id, c[0].id]).size).toBe(3);
    expect((await ordersOf(second.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2,
    ]);
    expect((await ordersOf(third.tableId)).map((o) => o.roundNumber)).toEqual([
      1,
    ]);
  });

  // -------------------------------------------------------------- idempotency

  it('a concurrent double-submit with the SAME clientRequestId creates one order, one session, round 1', async () => {
    const t = await seedTenant('idem-race');
    const clientRequestId = randomUUID();

    const [a, b] = await Promise.all([
      place(t, clientRequestId),
      place(t, clientRequestId),
    ]);

    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('created');
    expect(
      a.outcome === 'created' &&
        b.outcome === 'created' &&
        a.data.id === b.data.id,
    ).toBe(true);
    expect(await ordersOf(t.tableId)).toHaveLength(1);
    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(1);
    // The losing attempt's round allocation was rolled back with its transaction.
    expect(sessions[0].nextRoundNumber).toBe(2);
  });

  it('a sequential retry returns the original order and allocates no new round', async () => {
    const t = await seedTenant('idem-seq');
    const clientRequestId = randomUUID();

    const first = await place(t, clientRequestId);
    const retry = await place(t, clientRequestId);

    expect(
      first.outcome === 'created' &&
        retry.outcome === 'created' &&
        first.data.id === retry.data.id,
    ).toBe(true);
    expect((await sessionsOf(t.tableId))[0].nextRoundNumber).toBe(2);
  });

  it('an idempotent retry still returns the ORIGINAL order after the table was closed and locked; a NEW submission is rejected', async () => {
    const t = await seedTenant('idem-locked');
    const clientRequestId = randomUUID();
    const first = await place(t, clientRequestId);
    const session = (await sessionsOf(t.tableId))[0];
    await closeSessionAndLock(session.id, t.tableId);

    const retry = await place(t, clientRequestId);
    const fresh = await place(t);

    expect(
      first.outcome === 'created' &&
        retry.outcome === 'created' &&
        retry.data.id === first.data.id,
    ).toBe(true);
    expect(fresh).toEqual({ outcome: 'tableOrderingUnavailable' });
    expect(await ordersOf(t.tableId)).toHaveLength(1);
    expect(await sessionsOf(t.tableId)).toHaveLength(1);
  });

  // ------------------------------------------------------ ordering lock rules

  it('a table locked by staff with no OPEN session rejects with tableOrderingUnavailable and creates nothing', async () => {
    const t = await seedTenant('locked-fresh');
    await lockTable(t.tableId);

    const result = await place(t);

    expect(result).toEqual({ outcome: 'tableOrderingUnavailable' });
    expect(await sessionsOf(t.tableId)).toHaveLength(0);
    expect(await ordersOf(t.tableId)).toHaveLength(0);
    expect(
      await prisma.tableSessionEvent.count({
        where: { restaurantId: t.restaurantId },
      }),
    ).toBe(0);
  });

  it('a CLOSED session is never reopened: a locked table rejects and the session stays CLOSED', async () => {
    const t = await seedTenant('never-reopen');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    await closeSessionAndLock(session.id, t.tableId);

    const result = await place(t);

    expect(result).toEqual({ outcome: 'tableOrderingUnavailable' });
    const after = await sessionsOf(t.tableId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: session.id, status: 'CLOSED' });
    expect(after[0].closedAt).not.toBeNull();
    expect(await ordersOf(t.tableId)).toHaveLength(1);
  });

  it('an unlocked table after a CLOSED session (e.g. auto-close) opens a NEW session; the closed one keeps its own orders', async () => {
    const t = await seedTenant('new-after-closed');
    await place(t);
    const old = (await sessionsOf(t.tableId))[0];
    await closeSessionAndLock(old.id, t.tableId, false);

    await place(t);

    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: old.id, status: 'CLOSED' });
    expect(sessions[1]).toMatchObject({ status: 'OPEN', nextRoundNumber: 2 });
    const orders = await ordersOf(t.tableId);
    expect(orders.filter((o) => o.tableSessionId === old.id)).toHaveLength(1);
    const fresh = orders.find((o) => o.tableSessionId === sessions[1].id);
    expect(fresh?.roundNumber).toBe(1);
  });

  it('an order attaches to a session opened some other way (staff-style insert) and takes round 1', async () => {
    const t = await seedTenant('staff-open');
    await lockTable(t.tableId);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "tables" WHERE "id" = ${t.tableId}::uuid FOR NO KEY UPDATE`;
      await tx.tableSession.create({
        data: {
          publicId: `session-${randomUUID()}`,
          restaurantId: t.restaurantId,
          branchId: t.branchId,
          tableId: t.tableId,
          status: 'OPEN',
          openedVia: 'STAFF',
        },
      });
      await tx.$executeRaw`UPDATE "tables" SET "staff_open_required" = false WHERE "id" = ${t.tableId}::uuid`;
    });

    const result = await place(t);

    expect(result.outcome).toBe('created');
    const sessions = await sessionsOf(t.tableId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].openedVia).toBe('STAFF');
    expect((await ordersOf(t.tableId))[0].roundNumber).toBe(1);
  });

  it('a failed FIRST order leaves no orphan OPEN session, event or round', async () => {
    const t = await seedTenant('no-orphan');

    const result = await service.createOrder({
      publicCode: t.qrCode,
      clientRequestId: randomUUID(),
      items: [{ productId: randomUUID(), quantity: 1 }],
    });

    expect(result).toEqual({ outcome: 'itemsUnavailable' });
    expect(await sessionsOf(t.tableId)).toHaveLength(0);
    expect(await ordersOf(t.tableId)).toHaveLength(0);
    expect(
      await prisma.tableSessionEvent.count({
        where: { restaurantId: t.restaurantId },
      }),
    ).toBe(0);
    // The next valid order still starts at round 1 (nothing was consumed).
    await place(t);
    expect((await ordersOf(t.tableId))[0].roundNumber).toBe(1);
  });

  it('a failed LATER order does not consume a round number', async () => {
    const t = await seedTenant('no-gap');
    await place(t);
    await service.createOrder({
      publicCode: t.qrCode,
      clientRequestId: randomUUID(),
      items: [{ productId: randomUUID(), quantity: 1 }],
    });

    await place(t);

    expect((await ordersOf(t.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2,
    ]);
    expect((await sessionsOf(t.tableId))[0].nextRoundNumber).toBe(3);
  });

  // ------------------------------------------------------- lock serialization

  it('an order waits for a closer holding the table lock, then is rejected (never attached to the closing session)', async () => {
    const t = await seedTenant('close-race');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];

    let orderSettled = false;
    let orderPromise: ReturnType<typeof place> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "tables" WHERE "id" = ${t.tableId}::uuid FOR NO KEY UPDATE`;
      orderPromise = place(t).then((r) => {
        orderSettled = true;
        return r;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(orderSettled).toBe(false); // blocked on the table lock
      await tx.$executeRaw`UPDATE "table_sessions"
          SET "status" = 'CLOSED', "closed_at" = now(), "closure_reason" = 'NORMAL'
        WHERE "id" = ${session.id}::uuid`;
      await tx.$executeRaw`UPDATE "tables" SET "staff_open_required" = true WHERE "id" = ${t.tableId}::uuid`;
    });

    expect(await orderPromise).toEqual({ outcome: 'tableOrderingUnavailable' });
    expect(await ordersOf(t.tableId)).toHaveLength(1);
    expect((await sessionsOf(t.tableId))[0].status).toBe('CLOSED');
  });

  it('even a writer that skips the table lock cannot attach an order to a session being closed (trigger FOR SHARE waits, then rejects with TS001)', async () => {
    const t = await seedTenant('trigger-race');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    const qrId = await qrIdOf(t.qrCode);

    let insertError: unknown;
    let insertSettled = false;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "table_sessions"
          SET "status" = 'CLOSED', "closed_at" = now(), "closure_reason" = 'NORMAL'
        WHERE "id" = ${session.id}::uuid`;
      const insert = prisma.order
        .create({
          data: rawOrderData(t, {
            qrCodeId: qrId,
            tableSessionId: session.id,
            roundNumber: 99,
          }),
        })
        .catch((error: unknown) => {
          insertError = error;
        })
        .finally(() => {
          insertSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(insertSettled).toBe(false); // waiting on the uncommitted close
      void insert;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(insertSettled).toBe(true);
    expect(isClosedSessionTriggerViolation(insertError)).toBe(true);
    expect(await ordersOf(t.tableId)).toHaveLength(1);
  });

  // -------------------------------------------------------- trigger behavior

  it('trigger 1: inserting an order into a CLOSED session is refused with SQLSTATE TS001 and is recognized by the application', async () => {
    const t = await seedTenant('trg-closed');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    await closeSessionAndLock(session.id, t.tableId);
    const qrId = await qrIdOf(t.qrCode);

    const error = await captureError(() =>
      prisma.order.create({
        data: rawOrderData(t, {
          qrCodeId: qrId,
          tableSessionId: session.id,
          roundNumber: 2,
        }),
      }),
    );

    expect(isClosedSessionTriggerViolation(error)).toBe(true);
    expect(await ordersOf(t.tableId)).toHaveLength(1);
  });

  it('trigger 1 also refuses a raw SQL insert into a CLOSED session', async () => {
    const t = await seedTenant('trg-closed-raw');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    await closeSessionAndLock(session.id, t.tableId);
    const qrId = await qrIdOf(t.qrCode);

    const error = await captureError(
      () => prisma.$executeRaw`INSERT INTO "orders"
          ("id","restaurant_id","branch_id","table_id","qr_code_id","client_request_id","status","type",
           "currency_code","total_amount","subtotal_amount","delivery_fee_amount","table_session_id","round_number","updated_at")
        VALUES (${randomUUID()}::uuid, ${t.restaurantId}::uuid, ${t.branchId}::uuid, ${t.tableId}::uuid, ${qrId}::uuid,
                ${randomUUID()}::uuid, 'PENDING', 'DINE_IN', 'EGP', 10, 10, 0, ${session.id}::uuid, 7, now())`,
    );

    expect(isClosedSessionTriggerViolation(error)).toBe(true);
  });

  it('trigger 2: an order can never be re-linked, renumbered or (legacy) attached to a session; ordinary status updates still work', async () => {
    const t = await seedTenant('trg-immutable');
    await place(t);
    await place(t);
    const [first, second] = await ordersOf(t.tableId);
    const session = (await sessionsOf(t.tableId))[0];
    const qrId = await qrIdOf(t.qrCode);
    const legacy = await prisma.order.create({
      data: rawOrderData(t, { qrCodeId: qrId }), // legacy shape: DINE_IN, no session
    });
    expect(legacy.tableSessionId).toBeNull();

    const renumber = await captureError(() =>
      prisma.order.update({
        where: { id: first.id },
        data: { roundNumber: 50 },
      }),
    );
    const unlink = await captureError(
      () =>
        prisma.$executeRaw`UPDATE "orders" SET "table_session_id" = NULL, "round_number" = NULL WHERE "id" = ${second.id}::uuid`,
    );
    const attachLegacy = await captureError(
      () =>
        prisma.$executeRaw`UPDATE "orders" SET "table_session_id" = ${session.id}::uuid, "round_number" = 9 WHERE "id" = ${legacy.id}::uuid`,
    );

    for (const error of [renumber, unlink, attachLegacy]) {
      expect(
        JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
      ).toMatch(/TS002|immutable/);
    }
    const stillSame = await prisma.order.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(stillSame).toMatchObject({
      tableSessionId: session.id,
      roundNumber: 1,
    });
    // The existing Order lifecycle is untouched.
    const accepted = await prisma.order.update({
      where: { id: first.id },
      data: { status: 'ACCEPTED' },
    });
    expect(accepted.status).toBe('ACCEPTED');
    const legacyAccepted = await prisma.order.update({
      where: { id: legacy.id },
      data: { status: 'ACCEPTED' },
    });
    expect(legacyAccepted.status).toBe('ACCEPTED');
  });

  // ------------------------------------------------------------- constraints

  it('allows only one OPEN session per table (partial unique index); a new OPEN is fine once the previous is CLOSED', async () => {
    const t = await seedTenant('one-open');
    const open = () =>
      prisma.tableSession.create({
        data: {
          publicId: `session-${randomUUID()}`,
          restaurantId: t.restaurantId,
          branchId: t.branchId,
          tableId: t.tableId,
          status: 'OPEN',
          openedVia: 'STAFF',
        },
      });
    const first = await open();

    const duplicate = await captureError(open);
    expect(String((duplicate as Error).message)).toMatch(
      /table_sessions_one_open_per_table|Unique constraint/,
    );

    await closeSessionAndLock(first.id, t.tableId, false);
    await expect(open()).resolves.toMatchObject({ status: 'OPEN' });
    expect((await sessionsOf(t.tableId)).length).toBe(2);
  });

  it('composite integrity: a session cannot belong to another tenant/branch than its table', async () => {
    const a = await seedTenant('scope-a');
    const b = await seedTenant('scope-b');

    const wrongTenant = await captureError(() =>
      prisma.tableSession.create({
        data: {
          publicId: `session-${randomUUID()}`,
          restaurantId: b.restaurantId,
          branchId: a.branchId,
          tableId: a.tableId,
          status: 'OPEN',
          openedVia: 'STAFF',
        },
      }),
    );
    const wrongBranch = await captureError(() =>
      prisma.tableSession.create({
        data: {
          publicId: `session-${randomUUID()}`,
          restaurantId: a.restaurantId,
          branchId: b.branchId,
          tableId: a.tableId,
          status: 'OPEN',
          openedVia: 'STAFF',
        },
      }),
    );

    expect(wrongTenant).toBeInstanceOf(Error);
    expect(wrongBranch).toBeInstanceOf(Error);
    expect(
      await prisma.tableSession.count({ where: { tableId: a.tableId } }),
    ).toBe(0);
  });

  it('composite integrity: an order cannot reference a session of another table, branch or tenant', async () => {
    const a = await seedTenant('order-scope-a');
    const b = await seedTenant('order-scope-b');
    const otherTable = await addTable(a, '2');
    await place(a);
    await place({ qrCode: otherTable.qrCode, productId: a.productId });
    await place(b);
    const sessionA = (await sessionsOf(a.tableId))[0];
    const sessionB = (await sessionsOf(b.tableId))[0];
    const qrA = await qrIdOf(a.qrCode);

    const otherTableOrder = await captureError(() =>
      prisma.order.create({
        data: rawOrderData(a, {
          qrCodeId: qrA,
          tableId: otherTable.tableId,
          tableSessionId: sessionA.id,
          roundNumber: 40,
        }),
      }),
    );
    const otherTenantOrder = await captureError(() =>
      prisma.order.create({
        data: rawOrderData(a, {
          qrCodeId: qrA,
          tableSessionId: sessionB.id,
          roundNumber: 41,
        }),
      }),
    );

    expect(otherTableOrder).toBeInstanceOf(Error);
    expect(otherTenantOrder).toBeInstanceOf(Error);
    expect(
      await prisma.order.count({ where: { tableSessionId: sessionB.id } }),
    ).toBe(1);
  });

  it('CHECK constraints: session/round travel together, only DINE_IN orders have a session, CLOSED needs closure fields', async () => {
    const t = await seedTenant('checks');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    const qrId = await qrIdOf(t.qrCode);

    const noRound = await captureError(() =>
      prisma.order.create({
        data: rawOrderData(t, { qrCodeId: qrId, tableSessionId: session.id }),
      }),
    );
    const pickupWithSession = await captureError(() =>
      prisma.order.create({
        data: rawOrderData(t, {
          qrCodeId: qrId,
          type: 'PICKUP',
          tableSessionId: session.id,
          roundNumber: 5,
        }),
      }),
    );
    const closedWithoutFields = await captureError(
      () =>
        prisma.$executeRaw`UPDATE "table_sessions" SET "status" = 'CLOSED' WHERE "id" = ${session.id}::uuid`,
    );
    const reopen = await captureError(
      () =>
        prisma.$executeRaw`UPDATE "table_sessions" SET "next_round_number" = 0 WHERE "id" = ${session.id}::uuid`,
    );

    for (const error of [
      noRound,
      pickupWithSession,
      closedWithoutFields,
      reopen,
    ]) {
      expect(error).toBeInstanceOf(Error);
    }
    expect((await sessionsOf(t.tableId))[0]).toMatchObject({
      status: 'OPEN',
      nextRoundNumber: 2,
    });
  });

  it('the settlement ledger and audit tables reject invalid rows (amount > 0, void state, tenant scope)', async () => {
    const t = await seedTenant('ledger');
    await place(t);
    const session = (await sessionsOf(t.tableId))[0];
    const membership = await seedMembership(t.restaurantId);

    const zero = await captureError(() =>
      prisma.tableSessionPayment.create({
        data: {
          restaurantId: t.restaurantId,
          branchId: t.branchId,
          tableSessionId: session.id,
          amount: '0.00',
          method: 'CASH',
          clientRequestId: randomUUID(),
          recordedByMembershipId: membership,
        },
      }),
    );
    const halfVoid = await captureError(() =>
      prisma.tableSessionPayment.create({
        data: {
          restaurantId: t.restaurantId,
          branchId: t.branchId,
          tableSessionId: session.id,
          amount: '10.00',
          method: 'CASH',
          clientRequestId: randomUUID(),
          recordedByMembershipId: membership,
          voidedAt: new Date(),
        },
      }),
    );
    const wrongBranchEvent = await captureError(() =>
      prisma.tableSessionEvent.create({
        data: {
          restaurantId: t.restaurantId,
          branchId: randomUUID(),
          tableSessionId: session.id,
          type: 'SESSION_CLOSED',
          actorType: 'SYSTEM',
        },
      }),
    );
    const ok = await prisma.tableSessionPayment.create({
      data: {
        restaurantId: t.restaurantId,
        branchId: t.branchId,
        tableSessionId: session.id,
        amount: '50.00',
        method: 'CASH',
        clientRequestId: randomUUID(),
        recordedByMembershipId: membership,
      },
    });

    expect(zero).toBeInstanceOf(Error);
    expect(halfVoid).toBeInstanceOf(Error);
    expect(wrongBranchEvent).toBeInstanceOf(Error);
    expect(ok.kind).toBe('PAYMENT');
  });

  async function seedMembership(restaurantId: string): Promise<string> {
    const email = `it-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: 'not-a-real-hash',
        status: 'ACTIVE',
      },
    });
    const role = await prisma.restaurantRole.create({
      data: {
        restaurantId,
        name: 'IT Cashier',
        nameNormalized: `it cashier ${randomUUID()}`,
        kind: 'CUSTOM',
        permissions: [],
      },
    });
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role: 'CUSTOM',
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
    return membership.id;
  }

  // --------------------------------------------- unaffected order types, legacy

  it('Pickup and Delivery orders are unaffected: no session, no round, no table lock involvement', async () => {
    const t = await seedTenant('generic');
    await lockTable(t.tableId); // a locked TABLE must not influence generic ordering
    const generic = await prisma.qrCode.create({
      data: {
        publicCode: `it-qr-${randomUUID()}`,
        restaurantId: t.restaurantId,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId: t.restaurantId,
        branchId: t.branchId,
        name: 'IT Zone',
        deliveryFee: '10.00',
        minimumOrder: '0.00',
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    const items = [{ productId: t.productId, quantity: 1 }];

    const pickup = await service.createOrder({
      publicCode: generic.publicCode,
      clientRequestId: randomUUID(),
      items,
      customerName: 'Sara',
      customerPhone: '+20 100 000 0000',
    });
    const delivery = await service.createOrder({
      publicCode: generic.publicCode,
      clientRequestId: randomUUID(),
      items,
      customerName: 'Sara',
      customerPhone: '+20 100 000 0000',
      fulfillment: 'DELIVERY',
      deliveryZoneId: zone.id,
      deliveryAddress: '12 Test Street',
    });

    expect(pickup.outcome).toBe('created');
    expect(delivery.outcome).toBe('created');
    const orders = await prisma.order.findMany({
      where: { restaurantId: t.restaurantId },
    });
    expect(orders.map((o) => o.type).sort()).toEqual(['DELIVERY', 'PICKUP']);
    expect(
      orders.every((o) => o.tableSessionId === null && o.roundNumber === null),
    ).toBe(true);
    expect(
      await prisma.tableSession.count({
        where: { restaurantId: t.restaurantId },
      }),
    ).toBe(0);
    const deliveryOrder = orders.find((o) => o.type === 'DELIVERY');
    expect(deliveryOrder?.totalAmount.toFixed(2)).toBe('60.00');
  });

  it('legacy session-less Dine-In orders are never migrated: they stay NULL and do not affect a new session', async () => {
    const t = await seedTenant('legacy');
    const qrId = await qrIdOf(t.qrCode);
    const legacy = await prisma.order.create({
      data: rawOrderData(t, { qrCodeId: qrId }),
    });

    await place(t);

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(after.tableSessionId).toBeNull();
    expect(after.roundNumber).toBeNull();
    const session = (await sessionsOf(t.tableId))[0];
    expect(session.nextRoundNumber).toBe(2);
    expect(
      await prisma.order.count({ where: { tableSessionId: session.id } }),
    ).toBe(1);
  });

  it('tenant isolation: two restaurants ordering at the same moment get independent sessions and round counters', async () => {
    const a = await seedTenant('iso-a');
    const b = await seedTenant('iso-b');

    await Promise.all([place(a), place(b), place(a), place(b), place(a)]);

    const sa = await sessionsOf(a.tableId);
    const sb = await sessionsOf(b.tableId);
    expect(sa).toHaveLength(1);
    expect(sb).toHaveLength(1);
    expect(sa[0].restaurantId).toBe(a.restaurantId);
    expect(sb[0].restaurantId).toBe(b.restaurantId);
    expect((await ordersOf(a.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2, 3,
    ]);
    expect((await ordersOf(b.tableId)).map((o) => o.roundNumber)).toEqual([
      1, 2,
    ]);
  });
});
