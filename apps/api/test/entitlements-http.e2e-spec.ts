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
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import type { StarterRoleKind } from './../src/auth/permission/role-permissions';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Feature entitlements (DEC-043) against REAL PostgreSQL through the real Nest app: a Restaurant
 * without overrides has every feature; an override takes a feature away from THAT Restaurant only,
 * on the Guest menu, on the Guest endpoints and on the Staff controls.
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
  categoryId: string;
}

describeSandbox('Feature entitlements (real PostgreSQL)', () => {
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
      categoryId: category.id,
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

  // ================================================================== tests

  const base = (restaurantId: string) => `/api/v1/restaurants/${restaurantId}`;

  async function send(
    method: 'patch' | 'put',
    staff: Staff,
    path: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', await login(staff))
      .set('Origin', origin)
      .send(body);
  }

  interface MenuData {
    context: {
      tracking: boolean;
      templatesAllowed: boolean;
      suggestions: boolean;
      tableOrdering: string | null;
      ordering: { pickup: boolean; delivery: boolean; whatsapp: boolean };
      pickupBranches: unknown[];
      restaurant: { menuTemplate: string };
    };
  }

  const menu = async (qr: string): Promise<MenuData> =>
    (await request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`))
      .body.data as MenuData;

  async function addProduct(world: World, name: string) {
    return prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: world.restaurantId,
        categoryId: world.categoryId,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '20.00',
        displayOrder: 1,
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name } },
      },
    });
  }

  const setFeature = (world: World, feature: string, enabled: boolean) =>
    prisma.restaurantFeature.upsert({
      where: {
        restaurantId_feature: {
          restaurantId: world.restaurantId,
          feature: feature as never,
        },
      },
      create: {
        restaurantId: world.restaurantId,
        feature: feature as never,
        enabled,
      },
      update: { enabled },
    });

  const pickupOrder = (world: World, extra: Record<string, unknown> = {}) => ({
    items: [{ productId: world.productId, quantity: 1 }],
    fulfillment: 'PICKUP',
    customerName: 'Mona',
    customerPhone: '01012345678',
    ...extra,
  });

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  const whatsappOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/whatsapp-order`)
      .send({ clientRequestId: randomUUID(), ...body });

  it('gives a Restaurant every feature except the opt-in ones by default, and an override affects only that Restaurant', async () => {
    const world = await seedWorld('ent-default');
    const other = await seedWorld('ent-default-other');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const otherOwner = await addStaff(other.restaurantId, 'OWNER');

    const me = async (staff: Staff): Promise<Record<string, boolean>> =>
      (
        await request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Cookie', await login(staff))
      ).body.data.memberships[0].restaurant.features as Record<string, boolean>;
    const everything = {
      WHATSAPP_ORDERING: true,
      ORDER_TRACKING: true,
      SMART_SUGGESTIONS: true,
      MENU_TEMPLATES: true,
      DASHBOARD_ORDERING: true,
      TABLE_ORDERING: true,
      KITCHEN: true,
      // the one opt-in feature (DEC-057): off until the platform turns it on
      MENU_IMPORT: false,
    };
    expect(await me(owner)).toEqual(everything);
    expect((await menu(world.genericQr)).context.tracking).toBe(true);

    await setFeature(world, 'ORDER_TRACKING', false);
    expect(await me(owner)).toEqual({ ...everything, ORDER_TRACKING: false });
    expect(await me(otherOwner)).toEqual(everything);
    expect((await menu(world.genericQr)).context.tracking).toBe(false);
    expect((await menu(other.genericQr)).context.tracking).toBe(true);

    // an override can also switch it back on
    await setFeature(world, 'ORDER_TRACKING', true);
    expect((await menu(world.genericQr)).context.tracking).toBe(true);
  });

  it('WhatsApp ordering: refused to switch on, and not offered, without the feature', async () => {
    const world = await seedWorld('ent-whatsapp');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    await send('patch', owner, `${r}/contact`, { whatsapp: '+201012345678' });
    await setFeature(world, 'WHATSAPP_ORDERING', false);

    const refused = await send('patch', owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'WHATSAPP_ORDERING',
    });

    // switched on while allowed, then the platform takes it away: guests see the dashboard flow again
    await setFeature(world, 'WHATSAPP_ORDERING', true);
    expect(
      (
        await send('patch', owner, `${r}/ordering-options`, {
          whatsappOrderingEnabled: true,
        })
      ).status,
    ).toBe(200);
    expect((await menu(world.genericQr)).context.ordering.whatsapp).toBe(true);
    await setFeature(world, 'WHATSAPP_ORDERING', false);
    expect((await menu(world.genericQr)).context.ordering).toEqual({
      pickup: true,
      delivery: true,
      whatsapp: false,
    });
    const wa = await whatsappOrder(world.genericQr, pickupOrder(world));
    expect(wa.status).toBe(409);
    expect(wa.body.error.code).toBe('WHATSAPP_ORDERING_UNAVAILABLE');
    expect((await placeOrder(world.genericQr, pickupOrder(world))).status).toBe(
      201,
    );
    // switching it off is always allowed
    expect(
      (
        await send('patch', owner, `${r}/ordering-options`, {
          whatsappOrderingEnabled: false,
        })
      ).status,
    ).toBe(200);
  });

  it('menu templates: only the classic one without the feature, even if another was saved before', async () => {
    const world = await seedWorld('ent-templates');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    expect(
      (
        await send('patch', owner, `${r}/menu-template`, {
          menuTemplate: 'GALLERY',
        })
      ).status,
    ).toBe(200);
    await setFeature(world, 'MENU_TEMPLATES', false);

    expect((await menu(world.genericQr)).context.restaurant.menuTemplate).toBe(
      'CLASSIC',
    );
    // the page is told not to honour a template typed into the URL
    expect((await menu(world.genericQr)).context.templatesAllowed).toBe(false);
    const refused = await send('patch', owner, `${r}/menu-template`, {
      menuTemplate: 'LIST',
    });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'MENU_TEMPLATES',
    });
    expect(
      (
        await send('patch', owner, `${r}/menu-template`, {
          menuTemplate: 'CLASSIC',
        })
      ).status,
    ).toBe(200);

    await setFeature(world, 'MENU_TEMPLATES', true);
    expect(
      (
        await send('patch', owner, `${r}/menu-template`, {
          menuTemplate: 'FLOATING',
        })
      ).status,
    ).toBe(200);
    expect((await menu(world.genericQr)).context.restaurant.menuTemplate).toBe(
      'FLOATING',
    );
    expect((await menu(world.genericQr)).context.templatesAllowed).toBe(true);
  });

  it('smart suggestions: cannot be turned on, and the cart gets none, without the feature', async () => {
    const world = await seedWorld('ent-suggestions');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    const fries = await addProduct(world, 'Fries');
    await send('put', owner, `${r}/products/${world.productId}/suggestions`, {
      productIds: [fries.id],
    });
    expect(
      (await send('patch', owner, `${r}/suggestions`, { mode: 'MANUAL' }))
        .status,
    ).toBe(200);
    const ask = async (): Promise<string[]> =>
      (
        await request(app.getHttpServer())
          .post(`/api/v1/public/qr/${world.genericQr}/suggestions`)
          .send({ productIds: [world.productId] })
      ).body.data.productIds as string[];
    expect(await ask()).toEqual([fries.id]);
    expect((await menu(world.genericQr)).context.suggestions).toBe(true);

    await setFeature(world, 'SMART_SUGGESTIONS', false);
    expect(await ask()).toEqual([]);
    expect((await menu(world.genericQr)).context.suggestions).toBe(false);
    const refused = await send('patch', owner, `${r}/suggestions`, {
      mode: 'BOTH',
    });
    expect(refused.status).toBe(403);
    expect(refused.body.error.feature).toBe('SMART_SUGGESTIONS');
    expect(
      (await send('patch', owner, `${r}/suggestions`, { mode: 'OFF' })).status,
    ).toBe(200);
  });

  it('order tracking: nothing can be looked up without the feature', async () => {
    const world = await seedWorld('ent-tracking');
    const placed = await placeOrder(world.genericQr, pickupOrder(world));
    expect(placed.status).toBe(201);
    const orderId = placed.body.data.id as string;
    const track = () =>
      request(app.getHttpServer()).get(
        `/api/v1/public/qr/${world.genericQr}/orders/${orderId}/tracking`,
      );
    const lookup = () =>
      request(app.getHttpServer())
        .post(`/api/v1/public/qr/${world.genericQr}/orders/lookup`)
        .send({ phone: '01012345678' });
    expect((await track()).status).toBe(200);
    expect((await lookup()).body.data).toHaveLength(1);

    await setFeature(world, 'ORDER_TRACKING', false);
    expect((await track()).status).toBe(404);
    expect((await lookup()).body.data).toEqual([]);
  });

  it('dashboard ordering: pickup and delivery are offered only through WhatsApp without it; tables are unaffected', async () => {
    const world = await seedWorld('ent-dashboard');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const r = base(world.restaurantId);
    await setFeature(world, 'DASHBOARD_ORDERING', false);

    // no destination for the order: nothing is offered and the app endpoint refuses
    expect((await menu(world.genericQr)).context.ordering).toEqual({
      pickup: false,
      delivery: false,
      whatsapp: false,
    });
    expect((await menu(world.genericQr)).context.pickupBranches).toEqual([]);
    expect(
      (await placeOrder(world.genericQr, pickupOrder(world))).body.error.code,
    ).toBe('PICKUP_UNAVAILABLE');
    // dine-in still reaches the dashboard
    expect(
      (
        await placeOrder(world.tableQr, {
          items: [{ productId: world.productId, quantity: 1 }],
        })
      ).status,
    ).toBe(201);

    // with WhatsApp ordering they are offered, and the order goes to WhatsApp (never the dashboard)
    await send('patch', owner, `${r}/contact`, { whatsapp: '+201012345678' });
    await send('patch', owner, `${r}/ordering-options`, {
      whatsappOrderingEnabled: true,
    });
    expect((await menu(world.genericQr)).context.ordering).toEqual({
      pickup: true,
      delivery: true,
      whatsapp: true,
    });
    expect(
      (await whatsappOrder(world.genericQr, pickupOrder(world))).status,
    ).toBe(200);
    expect(
      (await placeOrder(world.genericQr, pickupOrder(world))).body.error.code,
    ).toBe('ORDER_VIA_WHATSAPP_ONLY');
    // the Restaurant's own switch still decides which kinds
    await send('patch', owner, `${r}/ordering-options`, {
      pickupEnabled: false,
    });
    expect((await menu(world.genericQr)).context.ordering).toEqual({
      pickup: false,
      delivery: true,
      whatsapp: true,
    });
  });

  it('table ordering: a Table QR is view-only without the feature, and pickup is unaffected', async () => {
    const world = await seedWorld('ent-table');
    await setFeature(world, 'TABLE_ORDERING', false);

    expect((await menu(world.tableQr)).context.tableOrdering).toBe('DISABLED');
    const res = await placeOrder(world.tableQr, {
      items: [{ productId: world.productId, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDERING_DISABLED');
    const recheck = await request(app.getHttpServer()).get(
      `/api/v1/public/qr/${world.tableQr}/table-ordering`,
    );
    expect(recheck.body.data.tableOrdering).toBe('DISABLED');
    expect((await placeOrder(world.genericQr, pickupOrder(world))).status).toBe(
      201,
    );
  });
});
