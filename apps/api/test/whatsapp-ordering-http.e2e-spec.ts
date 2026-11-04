/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
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
 * WhatsApp ordering (DEC-042) against REAL PostgreSQL through the real Nest app: the Staff switch
 * (needs a WhatsApp number), what the Guest menu offers, and that `POST /whatsapp-order` prices
 * the cart with the same rules as a real order, builds the message from the Backend's numbers and
 * stores NO order.
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL the whole
 * suite is skipped.
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

describeSandbox('WhatsApp ordering (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hasher: PasswordHasherService;
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
        timezone: 'Etc/GMT-2',
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

  const publicMenu = (qr: string) =>
    request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`);

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  // ================================================================== tests

  const base = (restaurantId: string) => `/api/v1/restaurants/${restaurantId}`;

  async function patch(
    staff: Staff,
    path: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  const whatsappOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/whatsapp-order`)
      .send({ clientRequestId: randomUUID(), ...body });

  const pickup = (world: World, extra: Record<string, unknown> = {}) => ({
    items: [{ productId: world.productId, quantity: 2 }],
    fulfillment: 'PICKUP',
    customerName: 'Mona Hassan',
    customerPhone: '01012345678',
    customerNotes: '*No* onions',
    ...extra,
  });

  const delivery = (world: World, extra: Record<string, unknown> = {}) => ({
    items: [{ productId: world.productId, quantity: 1 }],
    fulfillment: 'DELIVERY',
    customerName: 'Mona',
    customerPhone: '01012345678',
    deliveryAddress: '1 Nile St',
    deliveryZoneId: world.zoneId,
    ...extra,
  });

  it('needs a WhatsApp number to be switched on, and clearing the number switches it off', async () => {
    const world = await seedWorld('wa-settings');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);

    const refused = await patch(owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('WHATSAPP_NUMBER_REQUIRED');

    await patch(owner, `${r}/contact`, { whatsapp: '+20 101 234 5678' }).then(
      (res) => expect(res.status).toBe(200),
    );
    const on = await patch(owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({
      whatsappOrderingEnabled: true,
      pickupEnabled: true,
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', await login(owner));
    expect(me.body.data.memberships[0].restaurant.whatsappOrderingEnabled).toBe(
      true,
    );

    await patch(owner, `${r}/contact`, { whatsapp: null }).then((res) =>
      expect(res.status).toBe(200),
    );
    const row = await prisma.restaurant.findUniqueOrThrow({
      where: { id: world.restaurantId },
    });
    expect(row.whatsappOrderingEnabled).toBe(false);
  });

  it('WhatsApp decides where orders go, the Pickup / Delivery switches decide which kinds are offered', async () => {
    const world = await seedWorld('wa-menu');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);

    expect(
      (await publicMenu(world.genericQr)).body.data.context.ordering,
    ).toEqual({ pickup: true, delivery: true, whatsapp: false });
    expect(
      (await publicMenu(world.tableQr)).body.data.context.ordering,
    ).toBeNull();

    await patch(owner, `${r}/contact`, { whatsapp: '+201012345678' });
    await patch(owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });
    expect(
      (await publicMenu(world.genericQr)).body.data.context.ordering,
    ).toEqual({ pickup: true, delivery: true, whatsapp: true });

    // While it is on, the app takes no Pickup / Delivery order: they go to WhatsApp instead.
    const refused = await placeOrder(world.genericQr, pickup(world));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORDER_VIA_WHATSAPP_ONLY');
    expect(
      await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
    ).toBe(0);
    // A Table QR keeps ordering through the app.
    expect(
      (
        await placeOrder(world.tableQr, {
          items: [{ productId: world.productId, quantity: 1 }],
        })
      ).status,
    ).toBe(201);

    // Switching a kind off hides it whatever the destination, and WhatsApp refuses it too.
    await patch(owner, `${r}/ordering-options`, { pickupEnabled: false });
    const noPickup = (await publicMenu(world.genericQr)).body.data.context;
    expect(noPickup.ordering).toEqual({
      pickup: false,
      delivery: true,
      whatsapp: true,
    });
    expect(noPickup.pickupBranches).toEqual([]);
    expect(noPickup.deliveryBranches).toHaveLength(1);
    expect(
      (await whatsappOrder(world.genericQr, pickup(world))).body.error.code,
    ).toBe('PICKUP_UNAVAILABLE');
    expect((await whatsappOrder(world.genericQr, delivery(world))).status).toBe(
      200,
    );

    // Back to the dashboard: the app takes orders again.
    await patch(owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: false,
      pickupEnabled: true,
    });
    expect((await placeOrder(world.genericQr, pickup(world))).status).toBe(201);

    // Dashboard mode with Pickup off and Delivery on: Delivery is still offered and ordered.
    await patch(owner, `${r}/ordering-options`, { pickupEnabled: false });
    const deliveryOnly = (await publicMenu(world.genericQr)).body.data.context;
    expect(deliveryOnly.ordering).toEqual({
      pickup: false,
      delivery: true,
      whatsapp: false,
    });
    expect(deliveryOnly.pickupBranches).toEqual([]);
    expect(deliveryOnly.deliveryBranches).toHaveLength(1);
    expect((await placeOrder(world.genericQr, delivery(world))).status).toBe(
      201,
    );
    expect(
      (await placeOrder(world.genericQr, pickup(world))).body.error.code,
    ).toBe('PICKUP_UNAVAILABLE');
  });

  it('prices the order on the Backend, builds the message and stores nothing', async () => {
    const world = await seedWorld('wa-order');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);

    // off by default
    const off = await whatsappOrder(world.genericQr, pickup(world));
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe('WHATSAPP_ORDERING_UNAVAILABLE');

    await patch(owner, `${r}/contact`, { whatsapp: '+201012345678' });
    await patch(owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });

    const ok = await whatsappOrder(world.genericQr, pickup(world));
    expect(ok.status).toBe(200);
    expect(ok.body.data.total).toBe('100.00');
    expect(ok.body.data.currencyCode).toBe('EGP');
    // the Category the product sits in, the product with its quantity, and its line price
    expect(ok.body.data.message).toContain('New order from the digital menu');
    expect(ok.body.data.message).toContain('🗂️ *Category: IT Mains*');
    expect(ok.body.data.message).toContain('*1) IT Burger* × 2');
    expect(ok.body.data.message).toContain('💰 Price: 100 EGP');
    expect(ok.body.data.message).toContain('*Total: 100 EGP*');
    expect(ok.body.data.message).toContain('Mona Hassan');
    expect(ok.body.data.message).toContain('No onions'); // formatting characters neutralized
    expect(ok.body.data.message).not.toContain('*No*');
    const url = new URL(ok.body.data.whatsappUrl as string);
    expect(url.origin + url.pathname).toBe('https://wa.me/201012345678');
    expect(url.searchParams.get('text')).toBe(ok.body.data.message);

    // delivery adds the Backend's own fee (10.00 for the seeded zone)
    const del = await whatsappOrder(world.genericQr, delivery(world));
    expect(del.status).toBe(200);
    expect(del.body.data.total).toBe('60.00');
    expect(del.body.data.message).toContain('Delivery fee: 10 EGP');
    expect(del.body.data.message).toContain('1 Nile St');

    // Never stored: no order, no table session event.
    expect(
      await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
    ).toBe(0);

    // Same refusals as a real order.
    expect(
      (
        await whatsappOrder(
          world.genericQr,
          pickup(world, { items: [{ productId: randomUUID(), quantity: 1 }] }),
        )
      ).body.error.code,
    ).toBe('ORDER_ITEM_UNAVAILABLE');
    expect(
      (
        await whatsappOrder(
          world.genericQr,
          pickup(world, { customerPhone: '' }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await whatsappOrder(
          world.genericQr,
          delivery(world, { deliveryZoneId: randomUUID() }),
        )
      ).status,
    ).toBe(400);
    const stale = await whatsappOrder(
      world.genericQr,
      pickup(world, { expectedTotal: '1.00' }),
    );
    expect(stale.status).toBe(422);
    expect(stale.body.error.code).toBe('PRICE_CHANGED');
    // A Table QR never takes WhatsApp orders.
    expect((await whatsappOrder(world.tableQr, pickup(world))).status).toBe(
      404,
    );

    // A closed branch takes none either (opening hours, slice 3).
    await prisma.branch.update({
      where: { id: world.branchId },
      data: { temporarilyClosed: true },
    });
    const closed = await whatsappOrder(world.genericQr, pickup(world));
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('BRANCH_CLOSED');
    expect(
      await prisma.order.count({ where: { restaurantId: world.restaurantId } }),
    ).toBe(0);
  });
});
