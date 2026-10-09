/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import type { RestaurantAccessContext } from './../src/auth/context/restaurant-access.service';
import { effectiveRolePermissions } from './../src/auth/permission/role-permissions';
import type { StarterRoleKind } from './../src/auth/permission/role-permissions';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import type { OrderStatus } from './../src/generated/prisma/client';
import { OrdersService } from './../src/orders/orders.service';
import { PublicOrdersService } from './../src/public/public-orders.service';
import { TableSessionsService } from './../src/table-sessions/table-sessions.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Table Sessions Batch A (slices 2-4): staff reads, manual open, close with the
 * pending-order policy, auto-close after a rejected first order, the payment
 * ledger (full-balance settlement, idempotency, voids), the cancel-after-payment
 * guard and the `sessions.open` permission migration -- all against REAL
 * PostgreSQL through the real Nest application (HTTP -> guards -> services).
 *
 * Isolation: see `support/sandbox-guard.ts`. The guard is imported FIRST so the
 * Nest app boots against the marked sandbox only; without
 * TABLE_SESSION_IT_DATABASE_URL the whole suite is skipped.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const PASSWORD = 'correct horse battery staple';

interface World {
  restaurantId: string;
  branchId: string;
  tableId: string;
  qrCode: string;
  productId: string;
}

interface Staff {
  userId: string;
  membershipId: string;
  email: string;
  scope: RestaurantAccessContext;
  cookie?: string;
}

describeSandbox(
  'Table Sessions lifecycle, billing and payments (real PostgreSQL)',
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let hasher: PasswordHasherService;
    let publicOrders: PublicOrdersService;
    let orders: OrdersService;
    let sessions: TableSessionsService;
    let origin = 'http://localhost:3000';

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
      hasher = app.get(PasswordHasherService);
      publicOrders = app.get(PublicOrdersService, { strict: false });
      orders = app.get(OrdersService, { strict: false });
      sessions = app.get(TableSessionsService, { strict: false });
      origin = process.env.CORS_ORIGIN ?? origin;
    });

    afterAll(async () => {
      await app?.close();
    });

    // ---------------------------------------------------------------- fixtures

    async function seedWorld(label: string, price = '50.00'): Promise<World> {
      const restaurant = await prisma.restaurant.create({
        data: {
          publicId: `it-rest-${randomUUID()}`,
          name: `IT ${label}`,
          status: 'ACTIVE',
          defaultLocale: 'en',
          currencyCode: 'EGP',
          // a real, translated menu so the PUBLIC menu endpoint resolves
          locales: { create: { locale: 'en', isActive: true } },
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
          tableNumber: '1',
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
      const product = await prisma.product.create({
        data: {
          publicId: `product-${randomUUID()}`,
          restaurantId: restaurant.id,
          categoryId: category.id,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
          basePrice: price,
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
      };
    }

    /** A second Branch (with one Table and QR) in the same Restaurant. */
    async function addBranch(world: World, label: string) {
      const branch = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: world.restaurantId,
          name: `IT Branch ${label}`,
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
      const table = await prisma.table.create({
        data: {
          restaurantId: world.restaurantId,
          branchId: branch.id,
          tableNumber: '1',
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `it-qr-${randomUUID()}`,
          restaurantId: world.restaurantId,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      return { branchId: branch.id, tableId: table.id, qrCode: qr.publicCode };
    }

    async function addTable(
      world: World,
      tableNumber: string,
      branchId = world.branchId,
    ) {
      const table = await prisma.table.create({
        data: {
          restaurantId: world.restaurantId,
          branchId,
          tableNumber,
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `it-qr-${randomUUID()}`,
          restaurantId: world.restaurantId,
          branchId,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      return { tableId: table.id, qrCode: qr.publicCode };
    }

    async function addStaff(
      restaurantId: string,
      kind: StarterRoleKind | 'CUSTOM',
      options: {
        allBranches?: boolean;
        branchIds?: string[];
        customPermissions?: string[];
      } = {},
    ): Promise<Staff> {
      const email = `it-${randomUUID()}@example.test`;
      const user = await prisma.user.create({
        data: {
          email,
          emailNormalized: email,
          passwordHash: await hasher.hashPassword(PASSWORD),
          status: 'ACTIVE',
        },
      });
      const role =
        kind === 'CUSTOM'
          ? await prisma.restaurantRole.create({
              data: {
                restaurantId,
                name: `IT custom ${randomUUID().slice(0, 8)}`,
                nameNormalized: `it custom ${randomUUID()}`,
                kind: 'CUSTOM',
                permissions: options.customPermissions ?? [],
              },
            })
          : await ensureStarterRole(prisma, restaurantId, kind);
      const allBranches = options.allBranches ?? true;
      const membership = await prisma.restaurantMembership.create({
        data: {
          restaurantId,
          userId: user.id,
          role: kind,
          roleId: role.id,
          status: 'ACTIVE',
          allBranches,
        },
      });
      for (const branchId of options.branchIds ?? []) {
        await prisma.restaurantMembershipBranch.create({
          data: { restaurantMembershipId: membership.id, branchId },
        });
      }
      return {
        userId: user.id,
        membershipId: membership.id,
        email,
        scope: {
          restaurantId,
          membershipId: membership.id,
          allBranches,
          role: kind,
          roleId: role.id,
          permissions: effectiveRolePermissions({
            kind: role.kind,
            permissions: role.permissions,
          }),
        },
      };
    }

    async function login(staff: Staff): Promise<string> {
      if (staff.cookie) {
        return staff.cookie;
      }
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: staff.email, password: PASSWORD })
        .expect(200);
      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const pair = setCookie.find((c) => c.startsWith('restaurant_session='));
      if (!pair) {
        throw new Error('missing session cookie');
      }
      staff.cookie = pair.split(';')[0];
      return staff.cookie;
    }

    async function api(
      staff: Staff | null,
      method: 'get' | 'post',
      restaurantId: string,
      path: string,
      body?: Record<string, unknown>,
      options: { omitOrigin?: boolean } = {},
    ) {
      let req = request(app.getHttpServer())[method](
        `/api/v1/restaurants/${restaurantId}/table-sessions${path}`,
      );
      if (staff) {
        req = req.set('Cookie', await login(staff));
      }
      if (method === 'post' && !options.omitOrigin) {
        req = req.set('Origin', origin);
      }
      return body ? req.send(body) : req;
    }

    function place(
      world: { qrCode: string; productId: string },
      clientRequestId = randomUUID(),
    ) {
      return publicOrders.createOrder({
        publicCode: world.qrCode,
        clientRequestId,
        items: [{ productId: world.productId, quantity: 1 }],
      });
    }

    async function ordersOf(tableId: string) {
      return prisma.order.findMany({
        where: { tableId },
        orderBy: [{ createdAt: 'asc' }],
      });
    }

    async function sessionRows(tableId: string) {
      return prisma.tableSession.findMany({
        where: { tableId },
        orderBy: { openedAt: 'asc' },
      });
    }

    async function transition(
      scope: RestaurantAccessContext,
      orderId: string,
      from: OrderStatus,
      to: OrderStatus,
    ) {
      return orders.updateOrderStatus({
        scope,
        orderId,
        expectedStatus: from,
        status: to,
      });
    }

    /** Places `count` Dine-In orders, accepts them all, and returns the session public id. */
    async function acceptedSession(
      world: World,
      manager: Staff,
      count: number,
    ) {
      for (let i = 0; i < count; i += 1) {
        const result = await place(world);
        expect(result.outcome).toBe('created');
      }
      const placed = await ordersOf(world.tableId);
      for (const order of placed) {
        const accepted = await transition(
          manager.scope,
          order.id,
          'PENDING',
          'ACCEPTED',
        );
        expect(accepted.outcome).toBe('updated');
      }
      const [session] = await sessionRows(world.tableId);
      return session;
    }

    async function closeKeep(manager: Staff, publicId: string) {
      const result = await sessions.closeSession(manager.scope, publicId, {
        pendingOrders: 'KEEP',
      });
      expect(result.outcome).toBe('closed');
      return result;
    }

    // ======================================================== HTTP authorization

    describe('HTTP: authentication, permissions, CSRF and validation', () => {
      it('requires authentication', async () => {
        const world = await seedWorld('auth');
        const response = await api(null, 'get', world.restaurantId, '');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication is required.',
          },
        });
      });

      it('rejects a state-changing request without the approved Origin (CSRF)', async () => {
        const world = await seedWorld('csrf');
        const manager = await addStaff(world.restaurantId, 'MANAGER');

        const response = await api(
          manager,
          'post',
          world.restaurantId,
          '',
          { tableId: world.tableId },
          { omitOrigin: true },
        );

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('CSRF_VALIDATION_FAILED');
        expect(await sessionRows(world.tableId)).toHaveLength(0);
      });

      it('enforces the role matrix: KITCHEN none, WAITER view only, CASHIER and MANAGER operate, a custom role without sessions.open cannot open', async () => {
        const world = await seedWorld('matrix');
        const kitchen = await addStaff(world.restaurantId, 'KITCHEN');
        const waiter = await addStaff(world.restaurantId, 'WAITER');
        const cashier = await addStaff(world.restaurantId, 'CASHIER');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const customNoOpen = await addStaff(world.restaurantId, 'CUSTOM', {
          customPermissions: [
            'restaurant.view',
            'sessions.view',
            'sessions.close',
            'sessions.settle',
          ],
        });

        // list
        expect((await api(kitchen, 'get', world.restaurantId, '')).status).toBe(
          403,
        );
        for (const staff of [waiter, cashier, manager, customNoOpen]) {
          expect((await api(staff, 'get', world.restaurantId, '')).status).toBe(
            200,
          );
        }

        // open
        for (const staff of [kitchen, waiter, customNoOpen]) {
          const denied = await api(staff, 'post', world.restaurantId, '', {
            tableId: world.tableId,
          });
          expect(denied.status).toBe(403);
          expect(denied.body.error.code).toBe('PERMISSION_DENIED');
        }
        expect(await sessionRows(world.tableId)).toHaveLength(0);
        const opened = await api(cashier, 'post', world.restaurantId, '', {
          tableId: world.tableId,
        });
        expect(opened.status).toBe(201);
        const sessionId = opened.body.data.id as string;

        // close
        expect(
          (
            await api(
              waiter,
              'post',
              world.restaurantId,
              `/${sessionId}/close`,
              {},
            )
          ).status,
        ).toBe(403);
        const closed = await api(
          customNoOpen,
          'post',
          world.restaurantId,
          `/${sessionId}/close`,
          {},
        );
        expect(closed.status).toBe(200);
        expect(closed.body.data.status).toBe('CLOSED');

        // payments (empty session: nothing to settle, but authorization comes first)
        const payBody = {
          clientRequestId: randomUUID(),
          method: 'CASH',
          expectedAmount: '0.00',
        };
        expect(
          (
            await api(
              waiter,
              'post',
              world.restaurantId,
              `/${sessionId}/payments`,
              payBody,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await api(
              customNoOpen,
              'post',
              world.restaurantId,
              `/${sessionId}/payments`,
              payBody,
            )
          ).status,
        ).toBe(409);
      });

      it('hides sessions of another restaurant (404, never a distinct reason) and never lists them', async () => {
        const a = await seedWorld('tenant-a');
        const b = await seedWorld('tenant-b');
        const managerA = await addStaff(a.restaurantId, 'MANAGER');
        const managerB = await addStaff(b.restaurantId, 'MANAGER');
        await place(a);
        const [sessionA] = await sessionRows(a.tableId);

        const detail = await api(
          managerB,
          'get',
          b.restaurantId,
          `/${sessionA.publicId}`,
        );
        const close = await api(
          managerB,
          'post',
          b.restaurantId,
          `/${sessionA.publicId}/close`,
          {
            pendingOrders: 'KEEP',
          },
        );
        const list = await api(managerB, 'get', b.restaurantId, '');
        const foreignOpen = await api(managerB, 'post', b.restaurantId, '', {
          tableId: a.tableId,
        });
        const foreignRoute = await api(managerB, 'get', a.restaurantId, '');

        expect(detail.status).toBe(404);
        expect(detail.body.error.code).toBe('TABLE_SESSION_NOT_FOUND');
        expect(close.status).toBe(404);
        expect(list.body.data).toEqual([]);
        expect(foreignOpen.status).toBe(404);
        expect(foreignOpen.body.error.code).toBe('TABLE_NOT_FOUND');
        expect(foreignRoute.status).toBe(404);
        expect((await sessionRows(a.tableId))[0].status).toBe('OPEN');
        expect(
          await prisma.tableSession.count({
            where: { restaurantId: b.restaurantId },
          }),
        ).toBe(0);
        void managerA;
      });

      it('enforces Branch scope: a Branch-assigned membership cannot see, close, pay or open at another Branch', async () => {
        const world = await seedWorld('branch-scope');
        const other = await addBranch(world, 'other');
        const scoped = await addStaff(world.restaurantId, 'MANAGER', {
          allBranches: false,
          branchIds: [world.branchId],
        });
        await place(world);
        await place({ qrCode: other.qrCode, productId: world.productId });
        const [own] = await sessionRows(world.tableId);
        const [foreign] = await sessionRows(other.tableId);

        const list = await api(scoped, 'get', world.restaurantId, '');
        const ownDetail = await api(
          scoped,
          'get',
          world.restaurantId,
          `/${own.publicId}`,
        );
        const foreignDetail = await api(
          scoped,
          'get',
          world.restaurantId,
          `/${foreign.publicId}`,
        );
        const foreignClose = await api(
          scoped,
          'post',
          world.restaurantId,
          `/${foreign.publicId}/close`,
          {
            pendingOrders: 'KEEP',
          },
        );
        const foreignOpen = await api(scoped, 'post', world.restaurantId, '', {
          tableId: other.tableId,
        });
        const narrowed = await api(
          scoped,
          'get',
          world.restaurantId,
          `?branchId=${other.branchId}`,
        );

        expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([
          own.publicId,
        ]);
        expect(ownDetail.status).toBe(200);
        expect(foreignDetail.status).toBe(404);
        expect(foreignClose.status).toBe(404);
        expect(foreignOpen.status).toBe(404);
        // A foreign branchId filter can never widen access: it is dropped, so only
        // the membership's own sessions come back (same rule as the Orders list).
        expect(narrowed.body.data.map((s: { id: string }) => s.id)).toEqual([
          own.publicId,
        ]);
        expect((await sessionRows(other.tableId))[0].status).toBe('OPEN');
      });

      it('validates bodies and queries (400, nothing written)', async () => {
        const world = await seedWorld('validation');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await acceptedSession(world, manager, 1);
        const [session] = await sessionRows(world.tableId);
        await closeKeep(manager, session.publicId);
        const base = `/${session.publicId}/payments`;

        const noRequestId = await api(
          manager,
          'post',
          world.restaurantId,
          base,
          {
            method: 'CASH',
            expectedAmount: '50.00',
          },
        );
        const badMethod = await api(manager, 'post', world.restaurantId, base, {
          clientRequestId: randomUUID(),
          method: 'BITCOIN',
          expectedAmount: '50.00',
        });
        const floatAmount = await api(
          manager,
          'post',
          world.restaurantId,
          base,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '50.123',
          },
        );
        const numberAmount = await api(
          manager,
          'post',
          world.restaurantId,
          base,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: 50,
          },
        );
        const badOpen = await api(manager, 'post', world.restaurantId, '', {
          tableId: 'nope',
        });
        const badFilter = await api(
          manager,
          'get',
          world.restaurantId,
          '?payment=WHATEVER',
        );
        const badLimit = await api(
          manager,
          'get',
          world.restaurantId,
          '?limit=100000',
        );

        for (const response of [
          noRequestId,
          badMethod,
          floatAmount,
          numberAmount,
          badOpen,
          badFilter,
          badLimit,
        ]) {
          expect(response.status).toBe(400);
        }
        expect(
          await prisma.tableSessionPayment.count({
            where: { tableSessionId: session.id },
          }),
        ).toBe(0);
      });
    });

    // ============================================================ HTTP end to end

    describe('HTTP: a full service lifecycle', () => {
      it('order, close, settle, void, lock, reopen as a NEW session; the old unpaid balance stays independent', async () => {
        const world = await seedWorld('e2e');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const r = world.restaurantId;

        expect((await place(world)).outcome).toBe('created');
        expect((await place(world)).outcome).toBe('created');
        const [session] = await sessionRows(world.tableId);
        const id = session.publicId;

        // detail: rounds grouped, nothing billed yet (both PENDING)
        const before = await api(manager, 'get', r, `/${id}`);
        expect(before.status).toBe(200);
        expect(
          before.body.data.rounds.map(
            (x: { roundNumber: number }) => x.roundNumber,
          ),
        ).toEqual([1, 2]);
        expect(before.body.data.bill).toMatchObject({
          eligibleTotal: '0.00',
          pendingAmount: '100.00',
          paidAmount: '0.00',
          balance: '0.00',
          paymentStatus: 'NO_CHARGE',
        });

        // closing with pending orders requires an explicit choice
        const needChoice = await api(manager, 'post', r, `/${id}/close`, {});
        expect(needChoice.status).toBe(409);
        expect(needChoice.body.error.code).toBe('SESSION_HAS_PENDING_ORDERS');
        expect(needChoice.body.error.details).toEqual({ pendingOrderCount: 2 });

        // staff accept both, then the bill is the sum of the snapshots
        for (const order of await ordersOf(world.tableId)) {
          expect(
            (await transition(manager.scope, order.id, 'PENDING', 'ACCEPTED'))
              .outcome,
          ).toBe('updated');
        }
        const billed = await api(manager, 'get', r, `/${id}`);
        expect(billed.body.data.bill).toMatchObject({
          eligibleTotal: '100.00',
          pendingAmount: '0.00',
          balance: '100.00',
          paymentStatus: 'UNPAID',
        });

        // close: ordering is locked, payment untouched
        const closed = await api(manager, 'post', r, `/${id}/close`, {});
        expect(closed.status).toBe(200);
        expect(closed.body.data).toMatchObject({
          status: 'CLOSED',
          closureReason: 'NORMAL',
        });
        expect(closed.body.data.bill.paymentStatus).toBe('UNPAID');
        expect(await place(world)).toEqual({
          outcome: 'tableOrderingUnavailable',
        });

        // wrong amount is rejected with the live balance
        const clientRequestId = randomUUID();
        const mismatch = await api(manager, 'post', r, `/${id}/payments`, {
          clientRequestId,
          method: 'CASH',
          expectedAmount: '99.99',
        });
        expect(mismatch.status).toBe(409);
        expect(mismatch.body.error).toMatchObject({
          code: 'PAYMENT_AMOUNT_MISMATCH',
          details: { balance: '100.00' },
        });

        // settle, replay is idempotent
        const paid = await api(manager, 'post', r, `/${id}/payments`, {
          clientRequestId,
          method: 'CARD',
          expectedAmount: '100.00',
          note: 'terminal 2',
        });
        expect(paid.status).toBe(201);
        expect(paid.body.data.bill).toMatchObject({
          paidAmount: '100.00',
          balance: '0.00',
          paymentStatus: 'PAID',
        });
        const replay = await api(manager, 'post', r, `/${id}/payments`, {
          clientRequestId,
          method: 'CARD',
          expectedAmount: '100.00',
        });
        expect(replay.status).toBe(201);
        expect(replay.body.data.payments).toHaveLength(1);
        const paymentId = paid.body.data.payments[0].id as string;
        expect(
          (
            await api(manager, 'post', r, `/${id}/payments`, {
              clientRequestId: randomUUID(),
              method: 'CASH',
              expectedAmount: '0.00',
            })
          ).body.error.code,
        ).toBe('NOTHING_TO_SETTLE');

        // void needs a reason; it is a correction, the session stays CLOSED and locked
        const noReason = await api(
          manager,
          'post',
          r,
          `/${id}/payments/${paymentId}/void`,
          {},
        );
        expect(noReason.status).toBe(400);
        const voided = await api(
          manager,
          'post',
          r,
          `/${id}/payments/${paymentId}/void`,
          {
            reason: 'entered on the wrong table',
          },
        );
        expect(voided.status).toBe(200);
        expect(voided.body.data.status).toBe('CLOSED');
        expect(voided.body.data.bill).toMatchObject({
          paidAmount: '0.00',
          paymentStatus: 'UNPAID',
        });
        expect(voided.body.data.payments[0].voided).toMatchObject({
          reason: 'entered on the wrong table',
        });
        expect(JSON.stringify(voided.body).toLowerCase()).not.toContain(
          'refund',
        );
        expect(
          (
            await api(manager, 'post', r, `/${id}/payments/${paymentId}/void`, {
              reason: 'again',
            })
          ).body.error.code,
        ).toBe('PAYMENT_ALREADY_VOIDED');
        expect(await place(world)).toEqual({
          outcome: 'tableOrderingUnavailable',
        });

        // the unpaid closed session is still listed as outstanding
        const outstanding = await api(
          manager,
          'get',
          r,
          '?status=CLOSED&payment=OUTSTANDING',
        );
        expect(outstanding.body.data.map((s: { id: string }) => s.id)).toEqual([
          id,
        ]);

        // staff open a NEW session: guests can order again, balances stay separate
        const reopened = await api(manager, 'post', r, '', {
          tableId: world.tableId,
        });
        expect(reopened.status).toBe(201);
        expect(reopened.body.data.id).not.toBe(id);
        expect((await place(world)).outcome).toBe('created');
        const fresh = await api(manager, 'get', r, `/${reopened.body.data.id}`);
        expect(fresh.body.data.rounds).toHaveLength(1);
        expect(fresh.body.data.rounds[0].roundNumber).toBe(1);
        expect(fresh.body.data.bill.balance).toBe('0.00');
        const old = await api(manager, 'get', r, `/${id}`);
        expect(old.body.data).toMatchObject({ status: 'CLOSED' });
        expect(old.body.data.bill).toMatchObject({
          eligibleTotal: '100.00',
          balance: '100.00',
        });
        expect(
          (await api(manager, 'post', r, '', { tableId: world.tableId })).body
            .error.code,
        ).toBe('TABLE_SESSION_ALREADY_OPEN');
      });
    });

    // ================================================================ lifecycle

    describe('open / close rules', () => {
      it('manual open creates a STAFF session, clears the lock and audits it; INACTIVE and unknown tables are rejected', async () => {
        const world = await seedWorld('open');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await prisma.table.update({
          where: { id: world.tableId },
          data: { staffOpenRequired: true },
        });
        expect(await place(world)).toEqual({
          outcome: 'tableOrderingUnavailable',
        });

        const opened = await sessions.openSession(manager.scope, {
          tableId: world.tableId,
        });

        expect(opened.outcome).toBe('opened');
        const [row] = await sessionRows(world.tableId);
        expect(row).toMatchObject({
          status: 'OPEN',
          openedVia: 'STAFF',
          openedByMembershipId: manager.membershipId,
        });
        expect(
          (
            await prisma.table.findUniqueOrThrow({
              where: { id: world.tableId },
            })
          ).staffOpenRequired,
        ).toBe(false);
        const events = await prisma.tableSessionEvent.findMany({
          where: { tableSessionId: row.id },
        });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'SESSION_OPENED',
          actorType: 'STAFF',
          actorMembershipId: manager.membershipId,
        });
        expect((await place(world)).outcome).toBe('created');
        expect((await ordersOf(world.tableId))[0].roundNumber).toBe(1);

        const extra = await addTable(world, '2');
        await prisma.table.update({
          where: { id: extra.tableId },
          data: { status: 'INACTIVE' },
        });
        expect(
          await sessions.openSession(manager.scope, { tableId: extra.tableId }),
        ).toEqual({
          outcome: 'tableInactive',
        });
        expect(
          await sessions.openSession(manager.scope, { tableId: randomUUID() }),
        ).toEqual({
          outcome: 'tableNotFound',
        });
        expect(
          await sessions.openSession(manager.scope, { tableId: 'not-a-uuid' }),
        ).toEqual({
          outcome: 'tableNotFound',
        });
      });

      it('closing is idempotent, locks QR ordering, never touches payment and writes exactly one audit event', async () => {
        const world = await seedWorld('close');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);

        const first = await sessions.closeSession(
          manager.scope,
          session.publicId,
          {},
        );
        const second = await sessions.closeSession(
          manager.scope,
          session.publicId,
          {},
        );

        expect(first).toMatchObject({
          outcome: 'closed',
          alreadyClosed: false,
        });
        expect(second).toMatchObject({
          outcome: 'closed',
          alreadyClosed: true,
        });
        const row = await prisma.tableSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        expect(row).toMatchObject({
          status: 'CLOSED',
          closureReason: 'NORMAL',
          closedByMembershipId: manager.membershipId,
        });
        expect(row.closedAt).not.toBeNull();
        expect(
          (
            await prisma.table.findUniqueOrThrow({
              where: { id: world.tableId },
            })
          ).staffOpenRequired,
        ).toBe(true);
        expect(
          await prisma.tableSessionEvent.count({
            where: { tableSessionId: session.id, type: 'SESSION_CLOSED' },
          }),
        ).toBe(1);
        expect(
          await prisma.tableSessionPayment.count({
            where: { tableSessionId: session.id },
          }),
        ).toBe(0);
        expect(
          first.outcome === 'closed' && first.data.bill.paymentStatus,
        ).toBe('UNPAID');
        expect(await place(world)).toEqual({
          outcome: 'tableOrderingUnavailable',
        });
      });

      it('an empty manually opened session can be closed and is NO_CHARGE', async () => {
        const world = await seedWorld('empty');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const opened = await sessions.openSession(manager.scope, {
          tableId: world.tableId,
        });
        expect(opened.outcome).toBe('opened');
        if (opened.outcome !== 'opened') return;

        const closed = await sessions.closeSession(
          manager.scope,
          opened.data.id,
          {},
        );

        expect(closed.outcome).toBe('closed');
        expect(
          closed.outcome === 'closed' && closed.data.bill.paymentStatus,
        ).toBe('NO_CHARGE');
        expect(
          await sessions.recordPayment(manager.scope, opened.data.id, {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '0.00',
          }),
        ).toEqual({ outcome: 'nothingToSettle' });
      });

      describe('pending orders policy (P3)', () => {
        it('requires an explicit choice, and KEEP leaves them PENDING in the normal lifecycle', async () => {
          const world = await seedWorld('keep');
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          await place(world);
          await place(world);
          const [session] = await sessionRows(world.tableId);

          const blocked = await sessions.closeSession(
            manager.scope,
            session.publicId,
            {},
          );
          expect(blocked).toEqual({
            outcome: 'pendingOrders',
            pendingOrderCount: 2,
          });
          expect((await sessionRows(world.tableId))[0].status).toBe('OPEN');

          const kept = await sessions.closeSession(
            manager.scope,
            session.publicId,
            { pendingOrders: 'KEEP' },
          );
          expect(kept.outcome).toBe('closed');
          const still = await ordersOf(world.tableId);
          expect(still.map((o) => o.status)).toEqual(['PENDING', 'PENDING']);
          // normal lifecycle still works afterwards
          expect(
            (
              await transition(
                manager.scope,
                still[0].id,
                'PENDING',
                'ACCEPTED',
              )
            ).outcome,
          ).toBe('updated');
        });

        it('REJECT rejects them through the existing rules with an OrderStatusEvent each, and leaves accepted orders alone', async () => {
          const world = await seedWorld('reject');
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          await place(world);
          await place(world);
          await place(world);
          const all = await ordersOf(world.tableId);
          expect(
            (await transition(manager.scope, all[0].id, 'PENDING', 'ACCEPTED'))
              .outcome,
          ).toBe('updated');
          expect(
            (
              await transition(
                manager.scope,
                all[0].id,
                'ACCEPTED',
                'PREPARING',
              )
            ).outcome,
          ).toBe('updated');
          const [session] = await sessionRows(world.tableId);

          const closed = await sessions.closeSession(
            manager.scope,
            session.publicId,
            { pendingOrders: 'REJECT' },
          );

          expect(closed.outcome).toBe('closed');
          const after = await ordersOf(world.tableId);
          expect(after.map((o) => o.status)).toEqual([
            'PREPARING',
            'REJECTED',
            'REJECTED',
          ]);
          for (const order of after.slice(1)) {
            const events = await prisma.orderStatusEvent.findMany({
              where: { orderId: order.id },
              orderBy: { transitionedAt: 'asc' },
            });
            expect(events.map((e) => e.newStatus)).toEqual([
              'PENDING',
              'REJECTED',
            ]);
          }
          // the kitchen continues the accepted order after the close
          expect(
            (await transition(manager.scope, all[0].id, 'PREPARING', 'READY'))
              .outcome,
          ).toBe('updated');
          const event = await prisma.tableSessionEvent.findFirstOrThrow({
            where: { tableSessionId: session.id, type: 'SESSION_CLOSED' },
          });
          expect(event.metadata).toMatchObject({
            pendingOrders: 'REJECT',
            rejectedOrderCount: 2,
          });
        });

        it('REJECT without orders.reject is refused and changes nothing', async () => {
          const world = await seedWorld('reject-denied');
          const closerOnly = await addStaff(world.restaurantId, 'CUSTOM', {
            customPermissions: [
              'restaurant.view',
              'sessions.view',
              'sessions.close',
            ],
          });
          await place(world);
          const [session] = await sessionRows(world.tableId);

          const result = await sessions.closeSession(
            closerOnly.scope,
            session.publicId,
            { pendingOrders: 'REJECT' },
          );

          expect(result).toEqual({ outcome: 'permissionDenied' });
          expect((await sessionRows(world.tableId))[0].status).toBe('OPEN');
          expect((await ordersOf(world.tableId))[0].status).toBe('PENDING');
          expect(
            (
              await prisma.table.findUniqueOrThrow({
                where: { id: world.tableId },
              })
            ).staffOpenRequired,
          ).toBe(false);
        });
      });
    });

    // =============================================== auto-close (P6) and rejection

    describe('automatic closure after a rejected first order (P6)', () => {
      it('closes ONLY when no other order remains, with reason FIRST_ORDER_REJECTED, actor SYSTEM, and does not lock the table', async () => {
        const world = await seedWorld('auto-close');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await place(world);
        const [order] = await ordersOf(world.tableId);

        const rejected = await transition(
          manager.scope,
          order.id,
          'PENDING',
          'REJECTED',
        );

        expect(rejected.outcome).toBe('updated');
        const [session] = await sessionRows(world.tableId);
        expect(session).toMatchObject({
          status: 'CLOSED',
          closureReason: 'FIRST_ORDER_REJECTED',
          closedByMembershipId: null,
        });
        const event = await prisma.tableSessionEvent.findFirstOrThrow({
          where: { tableSessionId: session.id, type: 'SESSION_CLOSED' },
        });
        expect(event).toMatchObject({
          actorType: 'SYSTEM',
          actorMembershipId: null,
        });
        expect(
          (
            await prisma.table.findUniqueOrThrow({
              where: { id: world.tableId },
            })
          ).staffOpenRequired,
        ).toBe(false);
        // the table is still orderable and opens a brand new session
        expect((await place(world)).outcome).toBe('created');
        const rows = await sessionRows(world.tableId);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({
          status: 'OPEN',
          openedVia: 'FIRST_ORDER',
        });
      });

      it.each([['PENDING'], ['ACCEPTED']] as const)(
        'NEVER closes an active multi-order session when the first order is rejected while another order is %s',
        async (otherStatus) => {
          const world = await seedWorld(`multi-${otherStatus}`);
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          await place(world);
          await place(world);
          const [first, second] = await ordersOf(world.tableId);
          if (otherStatus === 'ACCEPTED') {
            expect(
              (
                await transition(
                  manager.scope,
                  second.id,
                  'PENDING',
                  'ACCEPTED',
                )
              ).outcome,
            ).toBe('updated');
          }

          const rejected = await transition(
            manager.scope,
            first.id,
            'PENDING',
            'REJECTED',
          );

          expect(rejected.outcome).toBe('updated');
          const [session] = await sessionRows(world.tableId);
          expect(session.status).toBe('OPEN');
          expect(session.closureReason).toBeNull();
        },
      );

      it('does not close when the other order was SERVED (real service happened)', async () => {
        const world = await seedWorld('served');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await place(world);
        await place(world);
        const [first, second] = await ordersOf(world.tableId);
        for (const [from, to] of [
          ['PENDING', 'ACCEPTED'],
          ['ACCEPTED', 'PREPARING'],
          ['PREPARING', 'READY'],
          ['READY', 'SERVED'],
        ] as const) {
          expect(
            (await transition(manager.scope, second.id, from, to)).outcome,
          ).toBe('updated');
        }

        await transition(manager.scope, first.id, 'PENDING', 'REJECTED');

        expect((await sessionRows(world.tableId))[0].status).toBe('OPEN');
      });

      it('never auto-closes a manually opened session, even when its round 1 is rejected', async () => {
        const world = await seedWorld('manual-no-auto');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        expect(
          (
            await sessions.openSession(manager.scope, {
              tableId: world.tableId,
            })
          ).outcome,
        ).toBe('opened');
        await place(world);
        const [order] = await ordersOf(world.tableId);

        await transition(manager.scope, order.id, 'PENDING', 'REJECTED');

        expect((await sessionRows(world.tableId))[0].status).toBe('OPEN');
      });

      it('stays correct under a race: a concurrent second order is never attached to the auto-closed session', async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const world = await seedWorld(`race-${attempt}`);
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          await place(world);
          const [first] = await ordersOf(world.tableId);

          const [rejected, second] = await Promise.all([
            transition(manager.scope, first.id, 'PENDING', 'REJECTED'),
            place(world),
          ]);

          expect(rejected.outcome).toBe('updated');
          expect(second.outcome).toBe('created');
          const rows = await sessionRows(world.tableId);
          const open = rows.filter((s) => s.status === 'OPEN');
          expect(open.length).toBeLessThanOrEqual(1);
          for (const session of rows.filter((s) => s.status === 'CLOSED')) {
            const attached = await prisma.order.findMany({
              where: { tableSessionId: session.id },
            });
            expect(attached.every((o) => o.status === 'REJECTED')).toBe(true);
          }
          // the second order is always in a live (OPEN) session
          const all = await ordersOf(world.tableId);
          const secondOrder = all.find((o) => o.id !== first.id);
          const secondSession = rows.find(
            (s) => s.id === secondOrder?.tableSessionId,
          );
          expect(secondSession?.status).toBe('OPEN');
        }
      });
    });

    // ============================================================ billing / reads

    describe('reads, billing and derived payment status', () => {
      it('computes the running bill exactly from snapshots (Decimal) and ignores later price edits', async () => {
        const world = await seedWorld('decimal', '33.33');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 3);

        await prisma.product.update({
          where: { id: world.productId },
          data: { basePrice: '99.99' },
        });
        const detail = await sessions.getSession(
          manager.scope,
          session.publicId,
        );

        expect(detail.outcome).toBe('found');
        if (detail.outcome !== 'found') return;
        expect(detail.data.bill).toMatchObject({
          eligibleTotal: '99.99',
          balance: '99.99',
          paymentStatus: 'UNPAID',
        });
        expect(detail.data.rounds.map((r) => r.order.totalAmount)).toEqual([
          '33.33',
          '33.33',
          '33.33',
        ]);
        expect(detail.data.rounds[0].order.items[0]).toMatchObject({
          productNameSnapshot: 'IT Burger',
          unitPrice: '33.33',
          lineTotal: '33.33',
        });
        expect(detail.data.currencyCode).toBe('EGP');
      });

      it('lists open, closed and historical sessions with filters, newest first', async () => {
        const world = await seedWorld('list');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const extra = await addTable(world, '2');
        const s1 = await acceptedSession(world, manager, 1);
        await closeKeep(manager, s1.publicId);
        await sessions.openSession(manager.scope, { tableId: world.tableId });
        await place({ qrCode: extra.qrCode, productId: world.productId });

        const all = await sessions.listSessions(manager.scope, {});
        const open = await sessions.listSessions(manager.scope, {
          status: 'OPEN',
        });
        const closed = await sessions.listSessions(manager.scope, {
          status: 'CLOSED',
        });
        const byTable = await sessions.listSessions(manager.scope, {
          tableId: world.tableId,
        });
        const outstanding = await sessions.listSessions(manager.scope, {
          payment: 'OUTSTANDING',
        });
        const limited = await sessions.listSessions(manager.scope, {
          limit: 1,
        });

        expect(all).toHaveLength(3);
        expect(open).toHaveLength(2);
        expect(closed.map((s) => s.id)).toEqual([s1.publicId]);
        expect(byTable).toHaveLength(2);
        expect(byTable[0].openedAt.getTime()).toBeGreaterThanOrEqual(
          byTable[1].openedAt.getTime(),
        );
        expect(outstanding.map((s) => s.id)).toEqual([s1.publicId]);
        expect(limited).toHaveLength(1);
        expect(closed[0]).toMatchObject({
          branch: { id: world.branchId },
          table: { id: world.tableId },
          orderCount: 1,
        });
      });

      it('an unpaid closed session never changes a new session balance', async () => {
        const world = await seedWorld('independent');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const old = await acceptedSession(world, manager, 2);
        await closeKeep(manager, old.publicId);
        const opened = await sessions.openSession(manager.scope, {
          tableId: world.tableId,
        });
        expect(opened.outcome).toBe('opened');
        if (opened.outcome !== 'opened') return;

        expect((await place(world)).outcome).toBe('created');
        const newSession = (await sessionRows(world.tableId)).find(
          (s) => s.status === 'OPEN',
        );
        const orders2 = (await ordersOf(world.tableId)).filter(
          (o) => o.tableSessionId === newSession?.id,
        );
        expect(orders2).toHaveLength(1);
        expect(orders2[0].roundNumber).toBe(1);
        expect(
          (
            await transition(
              manager.scope,
              orders2[0].id,
              'PENDING',
              'ACCEPTED',
            )
          ).outcome,
        ).toBe('updated');

        const fresh = await sessions.getSession(manager.scope, opened.data.id);
        const stale = await sessions.getSession(manager.scope, old.publicId);
        expect(fresh.outcome === 'found' && fresh.data.bill).toMatchObject({
          eligibleTotal: '50.00',
          balance: '50.00',
        });
        expect(stale.outcome === 'found' && stale.data.bill).toMatchObject({
          eligibleTotal: '100.00',
          balance: '100.00',
        });
      });

      it('legacy session-less Dine-In orders keep working and never appear in a session', async () => {
        const world = await seedWorld('legacy');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const qr = await prisma.qrCode.findUniqueOrThrow({
          where: { publicCode: world.qrCode },
        });
        const legacy = await prisma.order.create({
          data: {
            restaurantId: world.restaurantId,
            branchId: world.branchId,
            tableId: world.tableId,
            qrCodeId: qr.id,
            clientRequestId: randomUUID(),
            status: 'ACCEPTED',
            type: 'DINE_IN',
            currencyCode: 'EGP',
            totalAmount: '20.00',
            subtotalAmount: '20.00',
            deliveryFeeAmount: '0.00',
          },
        });

        // staff transitions on a session-less order are unaffected (incl. cancel)
        expect(
          (await transition(manager.scope, legacy.id, 'ACCEPTED', 'CANCELLED'))
            .outcome,
        ).toBe('updated');
        await place(world);
        const [session] = await sessionRows(world.tableId);
        const detail = await sessions.getSession(
          manager.scope,
          session.publicId,
        );
        expect(detail.outcome === 'found' && detail.data.orderCount).toBe(1);
        expect(
          (await prisma.order.findUniqueOrThrow({ where: { id: legacy.id } }))
            .tableSessionId,
        ).toBeNull();
      });
    });

    // ================================================================ payments

    describe('payment ledger rules', () => {
      it('cannot settle an OPEN session; records the Backend balance as CASH/CARD/OTHER on a CLOSED one; audits it', async () => {
        const world = await seedWorld('pay');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 2);
        const input = {
          clientRequestId: randomUUID(),
          method: 'OTHER' as const,
          expectedAmount: '100.00',
          note: 'voucher',
        };

        expect(
          await sessions.recordPayment(manager.scope, session.publicId, input),
        ).toEqual({ outcome: 'notClosed' });
        await closeKeep(manager, session.publicId);
        const result = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          input,
        );

        expect(result).toMatchObject({ outcome: 'recorded', replayed: false });
        const [payment] = await prisma.tableSessionPayment.findMany({
          where: { tableSessionId: session.id },
        });
        expect(payment).toMatchObject({
          kind: 'PAYMENT',
          method: 'OTHER',
          note: 'voucher',
          recordedByMembershipId: manager.membershipId,
          clientRequestId: input.clientRequestId,
        });
        expect(payment.amount.toFixed(2)).toBe('100.00');
        const event = await prisma.tableSessionEvent.findFirstOrThrow({
          where: { tableSessionId: session.id, type: 'PAYMENT_RECORDED' },
        });
        expect(event.metadata).toMatchObject({
          paymentId: payment.id,
          amount: '100.00',
          method: 'OTHER',
        });
        expect(
          result.outcome === 'recorded' && result.data.bill.paymentStatus,
        ).toBe('PAID');
      });

      it('is idempotent and exactly-once under concurrent double submits', async () => {
        const world = await seedWorld('pay-idem');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);
        await closeKeep(manager, session.publicId);
        const clientRequestId = randomUUID();
        const input = {
          clientRequestId,
          method: 'CASH' as const,
          expectedAmount: '50.00',
        };

        const results = await Promise.all(
          Array.from({ length: 6 }, () =>
            sessions.recordPayment(manager.scope, session.publicId, input),
          ),
        );

        expect(results.every((r) => r.outcome === 'recorded')).toBe(true);
        expect(
          results.filter((r) => r.outcome === 'recorded' && !r.replayed),
        ).toHaveLength(1);
        expect(
          await prisma.tableSessionPayment.count({
            where: { tableSessionId: session.id },
          }),
        ).toBe(1);
        expect(
          await prisma.tableSessionEvent.count({
            where: { tableSessionId: session.id, type: 'PAYMENT_RECORDED' },
          }),
        ).toBe(1);
      });

      it('concurrent DIFFERENT settlement requests settle once; the rest find nothing to settle', async () => {
        const world = await seedWorld('pay-race');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);
        await closeKeep(manager, session.publicId);

        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            sessions.recordPayment(manager.scope, session.publicId, {
              clientRequestId: randomUUID(),
              method: 'CASH',
              expectedAmount: '50.00',
            }),
          ),
        );

        expect(results.filter((r) => r.outcome === 'recorded')).toHaveLength(1);
        expect(
          results.filter((r) => r.outcome === 'nothingToSettle'),
        ).toHaveLength(3);
        expect(
          await prisma.tableSessionPayment.count({
            where: { tableSessionId: session.id },
          }),
        ).toBe(1);
      });

      it('a void is an audited correction; a corrected payment can follow; the session is never reopened', async () => {
        const world = await seedWorld('void');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);
        await closeKeep(manager, session.publicId);
        const first = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '50.00',
          },
        );
        const paymentId =
          first.outcome === 'recorded' ? first.data.payments[0].id : '';

        const voided = await sessions.voidPayment(
          manager.scope,
          session.publicId,
          paymentId,
          'wrong method',
        );
        const again = await sessions.voidPayment(
          manager.scope,
          session.publicId,
          paymentId,
          'twice',
        );
        const unknown = await sessions.voidPayment(
          manager.scope,
          session.publicId,
          randomUUID(),
          'x',
        );
        const corrected = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CARD',
            expectedAmount: '50.00',
          },
        );

        expect(voided.outcome).toBe('voided');
        expect(again).toEqual({ outcome: 'alreadyVoided' });
        expect(unknown).toEqual({ outcome: 'paymentNotFound' });
        expect(corrected).toMatchObject({
          outcome: 'recorded',
          replayed: false,
        });
        const row = await prisma.tableSessionPayment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        expect(row).toMatchObject({
          voidedByMembershipId: manager.membershipId,
          voidReason: 'wrong method',
        });
        expect(row.voidedAt).not.toBeNull();
        expect(row.amount.toFixed(2)).toBe('50.00'); // the original record is kept
        expect((await sessionRows(world.tableId))[0].status).toBe('CLOSED');
        expect(
          await prisma.tableSessionEvent.count({
            where: { tableSessionId: session.id, type: 'PAYMENT_VOIDED' },
          }),
        ).toBe(1);
        expect(
          corrected.outcome === 'recorded' && corrected.data.bill,
        ).toMatchObject({
          paidAmount: '50.00',
          paymentStatus: 'PAID',
        });
      });

      it('blocks cancelling an order while its session has an active payment; allowed again after a void', async () => {
        const world = await seedWorld('cancel-guard');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);
        const [order] = await ordersOf(world.tableId);
        await closeKeep(manager, session.publicId);
        const paid = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '50.00',
          },
        );
        const paymentId =
          paid.outcome === 'recorded' ? paid.data.payments[0].id : '';

        const blocked = await transition(
          manager.scope,
          order.id,
          'ACCEPTED',
          'CANCELLED',
        );
        expect(blocked).toEqual({ outcome: 'cancelBlockedBySettlement' });
        expect(
          (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
            .status,
        ).toBe('ACCEPTED');

        await sessions.voidPayment(
          manager.scope,
          session.publicId,
          paymentId,
          'cancelling the order',
        );
        const cancelled = await transition(
          manager.scope,
          order.id,
          'ACCEPTED',
          'CANCELLED',
        );

        expect(cancelled.outcome).toBe('updated');
        const detail = await sessions.getSession(
          manager.scope,
          session.publicId,
        );
        expect(
          detail.outcome === 'found' && detail.data.bill.paymentStatus,
        ).toBe('NO_CHARGE');
      });

      it('a late-accepted kept order re-opens a balance on a settled closed session, which can be settled again', async () => {
        const world = await seedWorld('late');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await place(world);
        await place(world);
        const [first, second] = await ordersOf(world.tableId);
        await transition(manager.scope, first.id, 'PENDING', 'ACCEPTED');
        const [session] = await sessionRows(world.tableId);
        await closeKeep(manager, session.publicId);
        const paid = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '50.00',
          },
        );
        expect(
          paid.outcome === 'recorded' && paid.data.bill.paymentStatus,
        ).toBe('PAID');
        expect(
          paid.outcome === 'recorded' && paid.data.bill.pendingAmount,
        ).toBe('50.00');

        const accepted = await transition(
          manager.scope,
          second.id,
          'PENDING',
          'ACCEPTED',
        );
        const detail = await sessions.getSession(
          manager.scope,
          session.publicId,
        );

        expect(accepted.outcome).toBe('updated');
        expect(detail.outcome === 'found' && detail.data.bill).toMatchObject({
          eligibleTotal: '100.00',
          paidAmount: '50.00',
          balance: '50.00',
          pendingAmount: '0.00',
          paymentStatus: 'PARTIALLY_PAID',
        });
        const stale = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: '100.00',
          },
        );
        expect(stale).toEqual({ outcome: 'amountMismatch', balance: '50.00' });
        const second2 = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CARD',
            expectedAmount: '50.00',
          },
        );
        expect(
          second2.outcome === 'recorded' && second2.data.bill,
        ).toMatchObject({
          paidAmount: '100.00',
          paymentStatus: 'PAID',
        });
        expect(
          second2.outcome === 'recorded' && second2.data.payments,
        ).toHaveLength(2);
      });

      it('a cancellation racing a payment never leaves an overpaid session', async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const world = await seedWorld(`cancel-pay-${attempt}`);
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          const session = await acceptedSession(world, manager, 1);
          const [order] = await ordersOf(world.tableId);
          await closeKeep(manager, session.publicId);

          const [cancel, pay] = await Promise.all([
            transition(manager.scope, order.id, 'ACCEPTED', 'CANCELLED'),
            sessions.recordPayment(manager.scope, session.publicId, {
              clientRequestId: randomUUID(),
              method: 'CASH',
              expectedAmount: '50.00',
            }),
          ]);

          const cancelled = cancel.outcome === 'updated';
          const paid = pay.outcome === 'recorded';
          expect(cancelled && paid).toBe(false); // never both
          const detail = await sessions.getSession(
            manager.scope,
            session.publicId,
          );
          expect(
            detail.outcome === 'found' && detail.data.bill.paymentStatus,
          ).not.toBe('OVERPAID');
          if (paid) {
            expect(cancel).toEqual({ outcome: 'cancelBlockedBySettlement' });
          } else {
            expect(cancel.outcome).toBe('updated');
            expect(pay.outcome).toBe('nothingToSettle');
          }
        }
      });
    });

    // ============================================================== concurrency

    describe('concurrency', () => {
      it('simultaneous manual opens create exactly one OPEN session', async () => {
        const world = await seedWorld('open-race');
        const manager = await addStaff(world.restaurantId, 'MANAGER');

        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            sessions.openSession(manager.scope, { tableId: world.tableId }),
          ),
        );

        expect(results.filter((r) => r.outcome === 'opened')).toHaveLength(1);
        expect(results.filter((r) => r.outcome === 'alreadyOpen')).toHaveLength(
          4,
        );
        expect(
          (await sessionRows(world.tableId)).filter((s) => s.status === 'OPEN'),
        ).toHaveLength(1);
      });

      it('simultaneous closes close once and write exactly one SESSION_CLOSED event', async () => {
        const world = await seedWorld('close-race');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);

        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            sessions.closeSession(manager.scope, session.publicId, {}),
          ),
        );

        expect(results.every((r) => r.outcome === 'closed')).toBe(true);
        expect(
          results.filter((r) => r.outcome === 'closed' && !r.alreadyClosed),
        ).toHaveLength(1);
        expect(
          await prisma.tableSessionEvent.count({
            where: { tableSessionId: session.id, type: 'SESSION_CLOSED' },
          }),
        ).toBe(1);
      });

      it('a close racing guest orders: every order lands before the close or is rejected; none is attached to the CLOSED session afterwards', async () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const world = await seedWorld(`close-vs-orders-${attempt}`);
          const manager = await addStaff(world.restaurantId, 'MANAGER');
          await place(world);
          const [session] = await sessionRows(world.tableId);

          const [closed, ...placed] = await Promise.all([
            sessions.closeSession(manager.scope, session.publicId, {
              pendingOrders: 'KEEP',
            }),
            ...Array.from({ length: 5 }, () => place(world)),
          ]);

          expect(closed.outcome).toBe('closed');
          const row = await prisma.tableSession.findUniqueOrThrow({
            where: { id: session.id },
          });
          expect(row.status).toBe('CLOSED');
          const attached = await prisma.order.findMany({
            where: { tableSessionId: session.id },
          });
          // nothing was written into the session after it was closed
          expect(
            attached.every(
              (o) => o.createdAt.getTime() <= (row.closedAt as Date).getTime(),
            ),
          ).toBe(true);
          const created = placed.filter((p) => p.outcome === 'created').length;
          const refused = placed.filter(
            (p) => p.outcome === 'tableOrderingUnavailable',
          ).length;
          expect(created + refused).toBe(5);
          expect(attached.length).toBe(1 + created);
          expect(await sessionRows(world.tableId)).toHaveLength(1);
          // and from now on the table is locked
          expect(await place(world)).toEqual({
            outcome: 'tableOrderingUnavailable',
          });
        }
      });
    });

    // ================================================== sessions.open migration

    describe('sessions.open permission migration (real rows)', () => {
      it('grants only starter OWNER/MANAGER/CASHIER roles that hold close+settle, never custom/waiter/kitchen, and is idempotent', async () => {
        const restaurant = await prisma.restaurant.create({
          data: {
            publicId: `it-rest-${randomUUID()}`,
            name: 'IT permission migration',
            status: 'ACTIVE',
            defaultLocale: 'en',
            currencyCode: 'EGP',
          },
        });
        const old = [
          'restaurant.view',
          'sessions.view',
          'sessions.resume',
          'sessions.settle',
          'sessions.close',
        ];
        const make = (kind: string, name: string, permissions: string[]) =>
          prisma.restaurantRole.create({
            data: {
              restaurantId: restaurant.id,
              name,
              nameNormalized: `${name.toLowerCase()}-${randomUUID()}`,
              kind: kind as never,
              permissions,
            },
          });
        const owner = await make('OWNER', 'Owner', [...old, 'roles.manage']);
        const manager = await make('MANAGER', 'Renamed Manager', old);
        const cashier = await make('CASHIER', 'Cashier', old);
        const restrictedCashier = await make('CUSTOM', 'Restricted', [
          'sessions.view',
        ]);
        const waiter = await make('WAITER', 'Waiter', [
          'restaurant.view',
          'sessions.view',
        ]);
        const kitchen = await make('KITCHEN', 'Kitchen', ['restaurant.view']);
        const customFull = await make('CUSTOM', 'Custom full', old);
        const manualOwnerRemoval = await prisma.restaurantRole.create({
          data: {
            restaurantId: restaurant.id,
            name: 'Manager no settle',
            nameNormalized: `manager-no-settle-${randomUUID()}`,
            kind: 'CUSTOM',
            permissions: ['sessions.close'],
          },
        });

        const sql = readFileSync(
          join(
            __dirname,
            '../prisma/migrations/20261010090000_add_sessions_open_permission/migration.sql',
          ),
          'utf8',
        );
        await prisma.$executeRawUnsafe(sql);
        await prisma.$executeRawUnsafe(sql); // second run: idempotent

        const stored = async (id: string) =>
          (await prisma.restaurantRole.findUniqueOrThrow({ where: { id } }))
            .permissions;
        expect(await stored(owner.id)).toContain('sessions.open');
        expect(await stored(manager.id)).toContain('sessions.open');
        expect(await stored(cashier.id)).toContain('sessions.open');
        for (const untouched of [
          restrictedCashier,
          waiter,
          kitchen,
          customFull,
          manualOwnerRemoval,
        ]) {
          expect(await stored(untouched.id)).not.toContain('sessions.open');
        }
        const managerKeys = await stored(manager.id);
        expect(managerKeys.filter((k) => k === 'sessions.open')).toHaveLength(
          1,
        );
        expect(managerKeys.filter((k) => k !== 'sessions.open').sort()).toEqual(
          [...old].sort(),
        );
      });
    });

    // ============================================ Batch B: board, bill, guest lock

    describe('Dashboard board', () => {
      it('reports per-table ordering availability, the live session and OLD unpaid bills separately from the new session', async () => {
        const world = await seedWorld('board');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const second = await addTable(world, '2');
        const inactive = await addTable(world, '3');
        await prisma.table.update({
          where: { id: inactive.tableId },
          data: { status: 'INACTIVE' },
        });

        // Table 1: an old CLOSED + UNPAID session, then a NEW open session with its own order
        const old = await acceptedSession(world, manager, 2);
        await closeKeep(manager, old.publicId);
        const board1 = await sessions.getBoard(manager.scope, {});
        const row1 = (id: string, rows = board1) =>
          rows.find((r) => r.table.id === id);
        expect(row1(world.tableId)).toMatchObject({
          ordering: 'CLOSED_BY_STAFF',
          openSession: null,
          outstanding: { sessionCount: 1, balance: '100.00' },
        });

        await sessions.openSession(manager.scope, { tableId: world.tableId });
        await place(world);
        // Table 2: free, never used
        const board2 = await sessions.getBoard(manager.scope, {});

        expect(row1(world.tableId, board2)).toMatchObject({
          ordering: 'AVAILABLE',
          openSession: { status: 'OPEN', orderCount: 1, pendingOrderCount: 1 },
          // the old unpaid balance is reported next to, never inside, the new session
          outstanding: {
            sessionCount: 1,
            balance: '100.00',
            currencyCode: 'EGP',
          },
        });
        expect(row1(world.tableId, board2)?.openSession?.bill).toMatchObject({
          eligibleTotal: '0.00',
          pendingAmount: '50.00',
          balance: '0.00',
        });
        expect(row1(second.tableId, board2)).toMatchObject({
          ordering: 'AVAILABLE',
          openSession: null,
          outstanding: null,
        });
        expect(row1(inactive.tableId, board2)).toMatchObject({
          ordering: 'UNAVAILABLE',
        });
      });

      it('is tenant- and Branch-scoped, and requires sessions.view', async () => {
        const a = await seedWorld('board-a');
        const b = await seedWorld('board-b');
        const other = await addBranch(a, 'second');
        const managerA = await addStaff(a.restaurantId, 'MANAGER');
        const scoped = await addStaff(a.restaurantId, 'MANAGER', {
          allBranches: false,
          branchIds: [a.branchId],
        });
        const kitchen = await addStaff(a.restaurantId, 'KITCHEN');
        const managerB = await addStaff(b.restaurantId, 'MANAGER');

        const all = await sessions.getBoard(managerA.scope, {});
        const narrow = await sessions.getBoard(scoped.scope, {});
        const foreignFilter = await sessions.getBoard(scoped.scope, {
          branchId: other.branchId,
        });
        const tenantB = await sessions.getBoard(managerB.scope, {});

        expect(all.map((r) => r.table.id).sort()).toEqual(
          [a.tableId, other.tableId].sort(),
        );
        expect(narrow.map((r) => r.table.id)).toEqual([a.tableId]);
        expect(foreignFilter.map((r) => r.table.id)).toEqual([a.tableId]); // dropped, never widened
        expect(tenantB.map((r) => r.table.id)).toEqual([b.tableId]);
        const denied = await api(kitchen, 'get', a.restaurantId, '/board');
        expect(denied.status).toBe(403);
        const ok = await api(managerA, 'get', a.restaurantId, '/board');
        expect(ok.status).toBe(200);
        expect(ok.body.data).toHaveLength(2);
      });
    });

    describe('exact payment filter (no scan cap)', () => {
      it('SQL filter agrees with the derived status on every state, including OVERPAID', async () => {
        const world = await seedWorld('filter-states');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const t = [
          world,
          ...(await Promise.all(
            ['2', '3', '4', '5'].map((n) => addTable(world, n)),
          )),
        ] as {
          tableId: string;
          qrCode: string;
        }[];
        const product = world.productId;
        const settle = async (publicId: string, amount: string) =>
          sessions.recordPayment(manager.scope, publicId, {
            clientRequestId: randomUUID(),
            method: 'CASH',
            expectedAmount: amount,
          });
        const build = async (
          tbl: { tableId: string; qrCode: string },
          accepted: number,
        ) => {
          for (let i = 0; i < accepted; i += 1) {
            await place({ qrCode: tbl.qrCode, productId: product });
          }
          for (const order of await ordersOf(tbl.tableId)) {
            await transition(manager.scope, order.id, 'PENDING', 'ACCEPTED');
          }
          const [row] = await sessionRows(tbl.tableId);
          await closeKeep(manager, row.publicId);
          return row;
        };

        const unpaid = await build(t[0], 1);
        const paid = await build(t[1], 1);
        await settle(paid.publicId, '50.00');
        const partial = await build(t[2], 1);
        await settle(partial.publicId, '50.00');
        // a kept order accepted AFTER settlement: PARTIALLY_PAID
        await place({ qrCode: t[2].qrCode, productId: product }).catch(
          () => undefined,
        );
        const empty = await sessions.openSession(manager.scope, {
          tableId: t[3].tableId,
        });
        expect(empty.outcome).toBe('opened');
        if (empty.outcome === 'opened')
          await sessions.closeSession(manager.scope, empty.data.id, {});
        const over = await build(t[4], 1);
        // force a corrupt state the API forbids (payment above the bill) to prove the SQL twin
        const membership = manager.membershipId;
        await prisma.tableSessionPayment.create({
          data: {
            restaurantId: world.restaurantId,
            branchId: world.branchId,
            tableSessionId: over.id,
            amount: '75.00',
            method: 'CASH',
            clientRequestId: randomUUID(),
            recordedByMembershipId: membership,
          },
        });

        const all = await sessions.listSessions(manager.scope, { limit: 200 });
        for (const status of [
          'NO_CHARGE',
          'UNPAID',
          'PAID',
          'PARTIALLY_PAID',
          'OVERPAID',
        ] as const) {
          const viaSql = await sessions.listSessions(manager.scope, {
            payment: status,
            limit: 200,
          });
          const viaTs = all.filter((s) => s.bill.paymentStatus === status);
          expect(viaSql.map((s) => s.id).sort()).toEqual(
            viaTs.map((s) => s.id).sort(),
          );
        }
        const outstanding = await sessions.listSessions(manager.scope, {
          payment: 'OUTSTANDING',
          limit: 200,
        });
        expect(outstanding.map((s) => s.id)).toContain(unpaid.publicId);
        expect(outstanding.map((s) => s.id)).not.toContain(paid.publicId);
        expect(
          (
            await sessions.listSessions(manager.scope, { payment: 'OVERPAID' })
          ).map((s) => s.id),
        ).toEqual([over.publicId]);
      });

      it('finds an OLD unpaid closed session behind 1100 newer sessions (no silent truncation)', async () => {
        const world = await seedWorld('filter-cap');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const old = await acceptedSession(world, manager, 1);
        await closeKeep(manager, old.publicId);
        const bulk = await addTable(world, '9');
        await prisma.$executeRaw`
          INSERT INTO "table_sessions"
            ("id","public_id","restaurant_id","branch_id","table_id","status","opened_at","opened_via",
             "closed_at","closure_reason","next_round_number","updated_at")
          SELECT gen_random_uuid(), 'session-' || gen_random_uuid()::text,
                 ${world.restaurantId}::uuid, ${world.branchId}::uuid, ${bulk.tableId}::uuid,
                 'CLOSED', now() + (g || ' seconds')::interval, 'STAFF',
                 now() + (g || ' seconds')::interval, 'NORMAL', 1, now()
            FROM generate_series(1, 1100) AS g`;

        const outstanding = await sessions.listSessions(manager.scope, {
          status: 'CLOSED',
          payment: 'OUTSTANDING',
          limit: 50,
        });
        const everything = await sessions.listSessions(manager.scope, {
          limit: 200,
        });

        expect(outstanding.map((s) => s.id)).toEqual([old.publicId]);
        expect(everything).toHaveLength(200); // the plain list is limited, the filter is exact
      });
    });

    describe('combined bill document', () => {
      it('contains only accepted rounds in totals, lists pending separately, active payments only, and is tenant/permission scoped', async () => {
        const world = await seedWorld('bill');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const waiter = await addStaff(world.restaurantId, 'WAITER');
        const kitchen = await addStaff(world.restaurantId, 'KITCHEN');
        const foreign = await seedWorld('bill-foreign');
        const foreignManager = await addStaff(foreign.restaurantId, 'MANAGER');
        await place(world);
        await place(world);
        await place(world);
        const all = await ordersOf(world.tableId);
        await transition(manager.scope, all[0].id, 'PENDING', 'ACCEPTED');
        await transition(manager.scope, all[1].id, 'PENDING', 'ACCEPTED');
        await transition(manager.scope, all[1].id, 'ACCEPTED', 'CANCELLED');
        const [session] = await sessionRows(world.tableId);
        await sessions.closeSession(manager.scope, session.publicId, {
          pendingOrders: 'KEEP',
        });
        const paid = await sessions.recordPayment(
          manager.scope,
          session.publicId,
          {
            clientRequestId: randomUUID(),
            method: 'CARD',
            expectedAmount: '50.00',
          },
        );
        const paymentId =
          paid.outcome === 'recorded' ? paid.data.payments[0].id : '';
        await sessions.voidPayment(
          manager.scope,
          session.publicId,
          paymentId,
          'typo',
        );
        await sessions.recordPayment(manager.scope, session.publicId, {
          clientRequestId: randomUUID(),
          method: 'CASH',
          expectedAmount: '50.00',
        });

        const bill = await api(
          waiter,
          'get',
          world.restaurantId,
          `/${session.publicId}/bill`,
        );

        expect(bill.status).toBe(200);
        const doc = bill.body.data;
        expect(doc.restaurant).toMatchObject({
          name: 'IT bill',
          currencyCode: 'EGP',
        });
        expect(doc.table.tableNumber).toBe('1');
        expect(doc.session).toMatchObject({
          id: session.publicId,
          status: 'CLOSED',
        });
        expect(
          doc.rounds.map((r: { roundNumber: number }) => r.roundNumber),
        ).toEqual([1]);
        expect(
          doc.awaitingRounds.map((r: { roundNumber: number }) => r.roundNumber),
        ).toEqual([3]);
        expect(doc.totals).toMatchObject({
          eligibleTotal: '50.00',
          pendingAmount: '50.00',
          paidAmount: '50.00',
          balance: '0.00',
          paymentStatus: 'PAID',
        });
        expect(doc.payments).toHaveLength(1);
        expect(doc.payments[0]).toMatchObject({
          method: 'CASH',
          amount: '50.00',
        });
        expect(doc.voidedPaymentCount).toBe(1);
        expect(doc.rounds[0].items[0]).toMatchObject({
          productNameSnapshot: 'IT Burger',
          lineTotal: '50.00',
        });

        expect(
          (
            await api(
              kitchen,
              'get',
              world.restaurantId,
              `/${session.publicId}/bill`,
            )
          ).status,
        ).toBe(403);
        const crossTenant = await api(
          foreignManager,
          'get',
          foreign.restaurantId,
          `/${session.publicId}/bill`,
        );
        expect(crossTenant.status).toBe(404);
        expect(crossTenant.body.error.code).toBe('TABLE_SESSION_NOT_FOUND');
      });

      it('records a BILL_PRINTED audit event without changing the session, the bill or the payments', async () => {
        const world = await seedWorld('bill-print');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const session = await acceptedSession(world, manager, 1);
        const before = await sessions.getSession(
          manager.scope,
          session.publicId,
        );

        const response = await api(
          manager,
          'post',
          world.restaurantId,
          `/${session.publicId}/bill/printed`,
          {},
        );
        const noOrigin = await api(
          manager,
          'post',
          world.restaurantId,
          `/${session.publicId}/bill/printed`,
          {},
          { omitOrigin: true },
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ recorded: true });
        expect(noOrigin.status).toBe(403);
        expect(
          await prisma.tableSessionEvent.count({
            where: { tableSessionId: session.id, type: 'BILL_PRINTED' },
          }),
        ).toBe(1);
        const after = await sessions.getSession(
          manager.scope,
          session.publicId,
        );
        expect(
          after.outcome === 'found' &&
            before.outcome === 'found' &&
            after.data.bill,
        ).toEqual(before.outcome === 'found' ? before.data.bill : undefined);
        expect(after.outcome === 'found' && after.data.status).toBe('OPEN');
      });
    });

    describe('Guest QR lock and unlock (public API)', () => {
      const publicGet = (path: string) =>
        request(app.getHttpServer()).get(`/api/v1/public/qr${path}`);

      it('advertises availability in the menu context and the Check-again endpoint, and the order endpoint answers 409 TABLE_ORDERING_UNAVAILABLE when locked', async () => {
        const world = await seedWorld('guest-lock');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        await place(world);
        const [session] = await sessionRows(world.tableId);

        const open = await publicGet(`/${world.qrCode}/table-ordering`);
        const menuOpen = await publicGet(`/${world.qrCode}/menu`);
        expect(open.status).toBe(200);
        expect(open.body.data).toEqual({ tableOrdering: 'AVAILABLE' });
        expect(menuOpen.body.data.context.tableOrdering).toBe('AVAILABLE');

        await sessions.closeSession(manager.scope, session.publicId, {
          pendingOrders: 'KEEP',
        });
        const locked = await publicGet(`/${world.qrCode}/table-ordering`);
        const menuLocked = await publicGet(`/${world.qrCode}/menu`);
        const submit = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.qrCode}/orders`)
          .send({
            clientRequestId: randomUUID(),
            items: [{ productId: world.productId, quantity: 1 }],
          });
        expect(locked.body.data).toEqual({ tableOrdering: 'CLOSED' });
        expect(menuLocked.status).toBe(200); // the menu stays browseable
        expect(menuLocked.body.data.context.tableOrdering).toBe('CLOSED');
        expect(submit.status).toBe(409);
        expect(submit.body.error.code).toBe('TABLE_ORDERING_UNAVAILABLE');
        expect(JSON.stringify(locked.body)).not.toMatch(
          /session|balance|payment|paid/i,
        );

        await sessions.openSession(manager.scope, { tableId: world.tableId });
        const unlocked = await publicGet(`/${world.qrCode}/table-ordering`);
        const accepted = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.qrCode}/orders`)
          .send({
            clientRequestId: randomUUID(),
            items: [{ productId: world.productId, quantity: 1 }],
          });
        expect(unlocked.body.data).toEqual({ tableOrdering: 'AVAILABLE' });
        expect(accepted.status).toBe(201);
      });

      it('a stale page retrying an order that was created before the lock still gets the original order (no duplicate)', async () => {
        const world = await seedWorld('guest-retry');
        const manager = await addStaff(world.restaurantId, 'MANAGER');
        const clientRequestId = randomUUID();
        const body = {
          clientRequestId,
          items: [{ productId: world.productId, quantity: 1 }],
        };
        const first = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.qrCode}/orders`)
          .send(body);
        expect(first.status).toBe(201);
        const [session] = await sessionRows(world.tableId);
        await sessions.closeSession(manager.scope, session.publicId, {
          pendingOrders: 'KEEP',
        });

        const retry = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.qrCode}/orders`)
          .send(body);
        const fresh = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.qrCode}/orders`)
          .send({ ...body, clientRequestId: randomUUID() });

        expect(retry.status).toBe(201);
        expect(retry.body.data.id).toBe(first.body.data.id);
        expect(fresh.status).toBe(409);
        expect(await ordersOf(world.tableId)).toHaveLength(1);
      });

      it('Pickup and Delivery QRs are unaffected: no field, a locked table never influences them', async () => {
        const world = await seedWorld('guest-generic');
        await prisma.table.update({
          where: { id: world.tableId },
          data: { staffOpenRequired: true },
        });
        const generic = await prisma.qrCode.create({
          data: {
            publicCode: `it-qr-${randomUUID()}`,
            restaurantId: world.restaurantId,
            type: 'GENERIC',
            status: 'ACTIVE',
          },
        });

        const menu = await publicGet(`/${generic.publicCode}/menu`);
        const recheck = await publicGet(
          `/${generic.publicCode}/table-ordering`,
        );
        const pickup = await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${generic.publicCode}/orders`)
          .send({
            clientRequestId: randomUUID(),
            items: [{ productId: world.productId, quantity: 1 }],
            customerName: 'Sara',
            customerPhone: '+20 100 000 0000',
          });

        expect(menu.body.data.context.tableOrdering).toBeNull();
        expect(recheck.status).toBe(404);
        expect(pickup.status).toBe(201);
      });
    });
  },
);
