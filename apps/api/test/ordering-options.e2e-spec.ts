/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment --
 * supertest exposes `response.body` as `any`; the assertions below read the JSON
 * envelope directly, exactly like the other HTTP e2e specs in this folder. */
import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import type { StarterRoleKind } from './../src/auth/permission/role-permissions';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Restaurant ordering options against REAL PostgreSQL through the real Nest
 * app: the Restaurant-wide Pickup / Delivery switches (Settings -> Restaurant
 * QR). Staff write rules, the effect on the Guest menu and on order creation,
 * and that Dine-in is never affected.
 *
 * Isolation: see `support/sandbox-guard.ts`; without
 * TABLE_SESSION_IT_DATABASE_URL the whole suite is skipped.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const PASSWORD = 'correct horse battery staple';

interface Staff {
  email: string;
  cookie?: string;
}

interface World {
  restaurantId: string;
  branchId: string;
  zoneId: string;
  genericQr: string;
  tableQr: string;
  productId: string;
}

describeSandbox('Restaurant ordering options (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
  let origin = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    origin = process.env.CORS_ORIGIN ?? origin;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- fixtures

  async function seedWorld(label: string): Promise<World> {
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
        timezone: 'Africa/Cairo',
      },
    });
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: 'Zone A',
        deliveryFee: '10.00',
        minimumOrder: '0.00',
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    const table = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableNumber: `T-${randomUUID().slice(0, 6)}`,
        status: 'ACTIVE',
      },
    });
    const generic = await prisma.qrCode.create({
      data: {
        publicCode: `it-gqr-${randomUUID()}`,
        restaurantId: restaurant.id,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const tableQr = await prisma.qrCode.create({
      data: {
        publicCode: `it-tqr-${randomUUID()}`,
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
      zoneId: zone.id,
      genericQr: generic.publicCode,
      tableQr: tableQr.publicCode,
      productId: product.id,
    };
  }

  async function addStaff(
    restaurantId: string,
    kind: StarterRoleKind,
    options: { allBranches?: boolean; branchIds?: string[] } = {},
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
    const role = await ensureStarterRole(prisma, restaurantId, kind);
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches: options.allBranches ?? true,
      },
    });
    for (const branchId of options.branchIds ?? []) {
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId },
      });
    }
    return { email };
  }

  async function login(staff: Staff): Promise<string> {
    if (staff.cookie) return staff.cookie;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: staff.email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const pair = setCookie.find((c) => c.startsWith('restaurant_session='));
    if (!pair) throw new Error('missing session cookie');
    staff.cookie = pair.split(';')[0];
    return staff.cookie;
  }

  async function patchOptions(staff: Staff, restaurantId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${restaurantId}/ordering-options`)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  const publicMenu = (qr: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  // ================================================================== tests

  it('defaults to both on, then switches each type independently and shows in /auth/me', async () => {
    const world = await seedWorld('options-flow');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;

    const me0 = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me0.body.data.memberships[0].restaurant.pickupEnabled).toBe(true);
    expect(me0.body.data.memberships[0].restaurant.deliveryEnabled).toBe(true);

    const off = await patchOptions(owner, r, { deliveryEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({
      pickupEnabled: true,
      deliveryEnabled: false,
      tableOrderingEnabled: true,
    });

    const me1 = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me1.body.data.memberships[0].restaurant.deliveryEnabled).toBe(false);
    expect(me1.body.data.memberships[0].restaurant.pickupEnabled).toBe(true);

    // an empty body is a no-op that returns the current values
    const noop = await patchOptions(owner, r, {});
    expect(noop.status).toBe(200);
    expect(noop.body.data).toEqual({
      pickupEnabled: true,
      deliveryEnabled: false,
      tableOrderingEnabled: true,
    });
  });

  it('rejects non-boolean values and unknown fields are ignored', async () => {
    const world = await seedWorld('options-validation');
    const owner = await addStaff(world.restaurantId, 'OWNER');

    const bad = await patchOptions(owner, world.restaurantId, { pickupEnabled: 'no' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const extra = await patchOptions(owner, world.restaurantId, { name: 'Hacked', status: 'INACTIVE' });
    expect(extra.status).toBe(200);
    const row = await prisma.restaurant.findUniqueOrThrow({ where: { id: world.restaurantId } });
    expect(row.name).toBe('IT options-validation');
    expect(row.status).toBe('ACTIVE');
  });

  it('the Guest menu and order creation follow the switches; Dine-in is never affected', async () => {
    const world = await seedWorld('options-guest');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;
    const items = [{ productId: world.productId, quantity: 1 }];
    const pickup = {
      items,
      fulfillment: 'PICKUP',
      customerName: 'Mona',
      customerPhone: '01000000000',
    };
    const delivery = {
      items,
      fulfillment: 'DELIVERY',
      customerName: 'Mona',
      customerPhone: '01000000000',
      deliveryAddress: '1 Nile St',
      deliveryZoneId: world.zoneId,
    };

    // both on
    const both = await publicMenu(world.genericQr);
    expect(both.body.data.context.pickupBranches).toHaveLength(1);
    expect(both.body.data.context.deliveryBranches).toHaveLength(1);

    // Delivery off: Pickup still works, Delivery is refused and creates nothing
    await patchOptions(owner, r, { deliveryEnabled: false });
    const noDelivery = await publicMenu(world.genericQr);
    expect(noDelivery.body.data.context.deliveryBranches).toEqual([]);
    expect(noDelivery.body.data.context.pickupBranches).toHaveLength(1);
    const refusedDelivery = await placeOrder(world.genericQr, delivery);
    expect(refusedDelivery.status).toBe(409);
    expect(refusedDelivery.body.error.code).toBe('DELIVERY_UNAVAILABLE');
    expect((await placeOrder(world.genericQr, pickup)).status).toBe(201);

    // Pickup off (Delivery back on): the reverse
    await patchOptions(owner, r, { pickupEnabled: false, deliveryEnabled: true });
    const noPickup = await publicMenu(world.genericQr);
    expect(noPickup.body.data.context.pickupBranches).toEqual([]);
    expect(noPickup.body.data.context.deliveryBranches).toHaveLength(1);
    const refusedPickup = await placeOrder(world.genericQr, pickup);
    expect(refusedPickup.status).toBe(409);
    expect(refusedPickup.body.error.code).toBe('PICKUP_UNAVAILABLE');
    expect((await placeOrder(world.genericQr, delivery)).status).toBe(201);

    // both off: browse only; Dine-in from a Table QR still works
    await patchOptions(owner, r, { pickupEnabled: false, deliveryEnabled: false });
    const none = await publicMenu(world.genericQr);
    expect(none.body.data.context.pickupBranches).toEqual([]);
    expect(none.body.data.context.deliveryBranches).toEqual([]);
    expect(none.body.data.menu.categories.length).toBeGreaterThan(0);
    expect((await placeOrder(world.genericQr, pickup)).status).toBe(409);
    expect((await placeOrder(world.genericQr, delivery)).status).toBe(409);
    const dineIn = await placeOrder(world.tableQr, { items });
    expect(dineIn.status).toBe(201);

    // only the refused attempts were refused: exactly one Pickup, one Delivery and one Dine-in exist
    const orders = await prisma.order.findMany({ where: { restaurantId: r } });
    expect(orders.map((order) => order.type).sort()).toEqual(['DELIVERY', 'DINE_IN', 'PICKUP']);
  });

  it('Table ordering off: the Table menu is view-only and orders are refused, Online is unaffected (DEC-038)', async () => {
    const world = await seedWorld('options-table');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = world.restaurantId;
    const items = [{ productId: world.productId, quantity: 1 }];
    const pickup = {
      items,
      fulfillment: 'PICKUP',
      customerName: 'Mona',
      customerPhone: '01000000000',
    };

    // on by default, and the switch shows in /auth/me
    const me0 = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me0.body.data.memberships[0].restaurant.tableOrderingEnabled).toBe(true);
    const before = await publicMenu(world.tableQr);
    expect(before.body.data.context.tableOrdering).not.toBe('DISABLED');

    const off = await patchOptions(owner, r, { tableOrderingEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.tableOrderingEnabled).toBe(false);
    // the other two switches are untouched
    expect(off.body.data.pickupEnabled).toBe(true);
    expect(off.body.data.deliveryEnabled).toBe(true);

    // the Table menu is still complete, but reports DISABLED
    const view = await publicMenu(world.tableQr);
    expect(view.status).toBe(200);
    expect(view.body.data.context.tableOrdering).toBe('DISABLED');
    expect(view.body.data.menu.categories.length).toBeGreaterThan(0);

    // the advisory re-check says the same
    const recheck = await request(app.getHttpServer()).get(
      `/api/v1/public/qr/${world.tableQr}/table-ordering`,
    );
    expect(recheck.body.data.tableOrdering).toBe('DISABLED');

    // a Dine-in order is refused and creates neither an Order nor a Table Session
    const refused = await placeOrder(world.tableQr, { items });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORDERING_DISABLED');
    expect(await prisma.order.count({ where: { restaurantId: r } })).toBe(0);
    expect(await prisma.tableSession.count({ where: { restaurantId: r } })).toBe(0);

    // Online ordering is independent
    expect((await placeOrder(world.genericQr, pickup)).status).toBe(201);

    // and it comes back
    await patchOptions(owner, r, { tableOrderingEnabled: true });
    expect((await placeOrder(world.tableQr, { items })).status).toBe(201);
  });

  it('requires restaurant.manage with Restaurant-wide scope, a session and CSRF; never crosses tenants', async () => {
    const a = await seedWorld('options-a');
    const b = await seedWorld('options-b');
    const owner = await addStaff(a.restaurantId, 'OWNER');
    const waiter = await addStaff(a.restaurantId, 'WAITER');
    const scoped = await addStaff(a.restaurantId, 'OWNER', {
      allBranches: false,
      branchIds: [a.branchId],
    });
    const foreignOwner = await addStaff(b.restaurantId, 'OWNER');

    expect((await patchOptions(waiter, a.restaurantId, { pickupEnabled: false })).status).toBe(403);
    expect((await patchOptions(scoped, a.restaurantId, { pickupEnabled: false })).status).toBe(403);
    const foreign = await patchOptions(foreignOwner, a.restaurantId, { pickupEnabled: false });
    expect([403, 404]).toContain(foreign.status);
    const anonymous = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${a.restaurantId}/ordering-options`)
      .set('Origin', origin)
      .send({ pickupEnabled: false });
    expect(anonymous.status).toBe(401);
    const noOrigin = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${a.restaurantId}/ordering-options`)
      .set('Cookie', await login(owner))
      .send({ pickupEnabled: false });
    expect(noOrigin.status).toBe(403);

    const row = await prisma.restaurant.findUniqueOrThrow({ where: { id: a.restaurantId } });
    expect(row.pickupEnabled).toBe(true);
    const other = await prisma.restaurant.findUniqueOrThrow({ where: { id: b.restaurantId } });
    expect(other.pickupEnabled).toBe(true);
  });

  // ============================================================ QR appearance

  const patchStyle = async (staff: Staff, restaurantId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${restaurantId}/qr-style`)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);

  it('QR style: defaults, accepted changes, refused (inverted / low contrast / missing logo) and permissions', async () => {
    const world = await seedWorld('qr-style');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const waiter = await addStaff(world.restaurantId, 'WAITER');
    const r = world.restaurantId;

    const me0 = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me0.body.data.memberships[0].restaurant.qrStyle).toEqual({
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      showLogo: false,
      showName: true,
    });

    // colors are normalised to upper-case and merged onto the stored style
    const ok = await patchStyle(owner, r, { foregroundColor: '#14532d', backgroundColor: '#f0fdf4' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({
      foregroundColor: '#14532D',
      backgroundColor: '#F0FDF4',
      showLogo: false,
      showName: true,
    });

    const inverted = await patchStyle(owner, r, { foregroundColor: '#FFFFFF', backgroundColor: '#000000' });
    expect(inverted.status).toBe(400);
    expect(inverted.body.error.code).toBe('QR_STYLE_INVERTED');
    const low = await patchStyle(owner, r, { foregroundColor: '#C8C8C8' });
    expect(low.status).toBe(400);
    expect(low.body.error.code).toBe('QR_STYLE_LOW_CONTRAST');
    const noLogo = await patchStyle(owner, r, { showLogo: true });
    expect(noLogo.status).toBe(400);
    expect(noLogo.body.error.code).toBe('QR_STYLE_LOGO_REQUIRED');
    const malformed = await patchStyle(owner, r, { foregroundColor: 'red' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    // refused styles wrote nothing
    const row = await prisma.restaurant.findUniqueOrThrow({ where: { id: r } });
    expect([row.qrForegroundColor, row.qrBackgroundColor, row.qrShowLogo]).toEqual([
      '#14532D',
      '#F0FDF4',
      false,
    ]);

    // with a logo the centered logo can be switched on
    await prisma.restaurant.update({ where: { id: r }, data: { logoAssetPath: '/media/it-logo.png' } });
    const withLogo = await patchStyle(owner, r, { showLogo: true, showName: false });
    expect(withLogo.status).toBe(200);
    expect(withLogo.body.data.showLogo).toBe(true);
    expect(withLogo.body.data.showName).toBe(false);

    expect((await patchStyle(waiter, r, { showName: true })).status).toBe(403);
  });
});
