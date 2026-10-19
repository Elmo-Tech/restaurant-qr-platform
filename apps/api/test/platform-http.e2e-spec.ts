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
 * Platform control dashboard API (DEC-045) against REAL PostgreSQL through the real Nest app: Platform
 * Administrator login and sessions, the platform Origin rules, that a Restaurant Staff session is not
 * a platform session, and the cross-restaurant list / detail / status / features / audit routes.
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

describeSandbox('Platform control dashboard API (real PostgreSQL)', () => {
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

  const platformOrigin = process.env.PLATFORM_ORIGIN ?? 'http://localhost:3001';
  const ADMIN_PASSWORD = 'Platform-Admin-Pw-1';

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

  const placeOrder = (qr: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/public/qr/${qr}/orders`)
      .send({ clientRequestId: randomUUID(), ...body });

  async function addAdmin(status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
    const email = `pa-${randomUUID()}@example.test`;
    await prisma.platformAdmin.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: await hasher.hashPassword(ADMIN_PASSWORD),
        displayName: 'Platform Admin',
        status,
      },
    });
    return email;
  }

  /** Signs in and returns the platform session cookie. */
  async function platformLogin(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/auth/login')
      .set('Origin', platformOrigin)
      .send({ email, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((c) =>
      c.startsWith(
        `${process.env.PLATFORM_SESSION_COOKIE_NAME ?? 'platform_session'}=`,
      ),
    );
    expect(cookie).toContain('HttpOnly');
    return (cookie ?? '').split(';')[0];
  }

  const get = (
    path: string,
    cookie: string,
    origin: string | null = platformOrigin,
  ) => {
    const req = request(app.getHttpServer())
      .get(`/api/v1/platform${path}`)
      .set('Cookie', cookie);
    return origin ? req.set('Origin', origin) : req;
  };
  const send = (
    method: 'patch' | 'put' | 'post' | 'delete',
    path: string,
    cookie: string,
    body: Record<string, unknown>,
    origin: string | null = platformOrigin,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api/v1/platform${path}`)
      .set('Cookie', cookie)
      .send(body);
    return origin ? req.set('Origin', origin) : req;
  };

  it('signs a Platform Administrator in and out, with one generic failure', async () => {
    const email = await addAdmin();
    const disabled = await addAdmin('DISABLED');
    const login = (e: string, p: string) =>
      request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .set('Origin', platformOrigin)
        .send({ email: e, password: p });

    const wrong = await login(email, 'Wrong-Password-12');
    const unknown = await login('nobody@example.test', ADMIN_PASSWORD);
    const off = await login(disabled, ADMIN_PASSWORD);
    for (const res of [wrong, unknown, off]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrong.body).toEqual(unknown.body);

    const cookie = await platformLogin(email);
    const me = await get('/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({
      email,
      displayName: 'Platform Admin',
    });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenHash/);
    const row = await prisma.platformAdmin.findFirstOrThrow({
      where: { emailNormalized: email },
    });
    expect(row.lastLoginAt).not.toBeNull();

    // no session, no access
    expect((await get('/auth/me', '')).status).toBe(401);

    // logout ends the session for good
    const out = await send('post', '/auth/logout', cookie, {});
    expect(out.status).toBe(204);
    expect((await get('/auth/me', cookie)).status).toBe(401);
  });

  it('only accepts the platform origin, and a restaurant Staff session is not a platform session', async () => {
    const email = await addAdmin();
    const cookie = await platformLogin(email);
    const webOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

    // the restaurant dashboard's origin is refused, reads included
    expect((await get('/auth/me', cookie, webOrigin)).status).toBe(403);
    expect((await get('/auth/me', cookie, 'https://evil.example')).status).toBe(
      403,
    );
    // a write with no Origin and no Referer is refused; a read from a script is judged by the cookie
    expect((await send('post', '/auth/logout', cookie, {}, null)).status).toBe(
      403,
    );
    expect((await get('/auth/me', cookie, null)).status).toBe(200);

    // a Restaurant OWNER's Staff cookie never authenticates on a platform route
    const world = await seedWorld('platform-staff');
    const owner = await addStaff(world.restaurantId, 'OWNER');
    const staffCookie = (await login(owner)).split(';')[0];
    const attempt = await get('/overview', staffCookie);
    expect(attempt.status).toBe(401);
    // and the reverse: the platform cookie does not open a restaurant route
    const reverse = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);
    expect(reverse.status).toBe(401);
  });

  it('lists, searches and shows restaurants across tenants without leaking guest or order data', async () => {
    const email = await addAdmin();
    const cookie = await platformLogin(email);
    const tag = randomUUID().slice(0, 8);
    const alpha = await seedWorld(`platform-alpha-${tag}`);
    const beta = await seedWorld(`platform-beta-${tag}`);
    const owner = await addStaff(alpha.restaurantId, 'OWNER');
    await prisma.restaurant.update({
      where: { id: beta.restaurantId },
      data: { status: 'SUSPENDED' },
    });
    await setFeature(alpha, 'WHATSAPP_ORDERING', false);
    await placeOrder(alpha.genericQr, {
      items: [{ productId: alpha.productId, quantity: 1 }],
      fulfillment: 'PICKUP',
      customerName: 'Mona',
      customerPhone: '01012345678',
    });

    const found = await get(
      `/restaurants?search=platform-alpha-${tag}`,
      cookie,
    );
    expect(found.status).toBe(200);
    expect(found.body.data.total).toBe(1);
    expect(found.body.data.items[0]).toMatchObject({
      id: alpha.restaurantId,
      status: 'ACTIVE',
      disabledFeatures: ['WHATSAPP_ORDERING'],
      counts: { branches: 1, orders30d: 1 },
    });

    const suspended = await get(
      `/restaurants?status=SUSPENDED&search=platform-beta-${tag}`,
      cookie,
    );
    const suspendedItems = suspended.body.data.items as { id: string }[];
    expect(suspendedItems.map((r) => r.id)).toEqual([beta.restaurantId]);
    expect((await get('/restaurants?pageSize=500', cookie)).status).toBe(400);
    expect((await get('/restaurants?status=NOPE', cookie)).status).toBe(400);

    const detail = await get(`/restaurants/${alpha.restaurantId}`, cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.owners).toEqual([
      { email: expect.any(String) as string, status: 'ACTIVE' },
    ]);
    const features = detail.body.data.features as { key: string }[];
    expect(features).toHaveLength(6);
    expect(features.find((f) => f.key === 'WHATSAPP_ORDERING')).toEqual({
      key: 'WHATSAPP_ORDERING',
      enabled: false,
      overridden: true,
      source: 'override',
      baseEnabled: true,
    });
    expect(detail.body.data.totals.orders).toBe(1);
    // aggregates only: nothing of the order or the guest
    expect(JSON.stringify(detail.body)).not.toMatch(
      /Mona|01012345678|customer/i,
    );
    void owner;

    expect((await get(`/restaurants/${randomUUID()}`, cookie)).status).toBe(
      404,
    );
    expect((await get('/restaurants/not-a-uuid', cookie)).status).toBe(404);
  });

  it('suspends and reactivates a restaurant, edits its features, and records every change', async () => {
    const email = await addAdmin();
    const cookie = await platformLogin(email);
    const world = await seedWorld('platform-manage');
    const id = world.restaurantId;
    const owner = await addStaff(id, 'OWNER');
    const staffOpen = async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', await login(owner));
      return res.body.data?.memberships?.[0]?.restaurant?.status as
        string | undefined;
    };
    expect(await staffOpen()).toBe('ACTIVE');

    expect(
      (
        await send('patch', `/restaurants/${id}/status`, cookie, {
          status: 'BANNED',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send('patch', `/restaurants/${id}/status`, cookie, {
          status: 'SUSPENDED',
        })
      ).body.data,
    ).toEqual({ status: 'SUSPENDED' });
    expect(await staffOpen()).toBe('SUSPENDED');
    // the public menu is unavailable while suspended
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/public/qr/${world.genericQr}/menu`,
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await send('patch', `/restaurants/${id}/status`, cookie, {
          status: 'ACTIVE',
        })
      ).body.data,
    ).toEqual({ status: 'ACTIVE' });
    expect(await staffOpen()).toBe('ACTIVE');

    // features: remove, read back through the guest menu, restore to the default
    const off = await send(
      'put',
      `/restaurants/${id}/features/ORDER_TRACKING`,
      cookie,
      { enabled: false },
    );
    expect(off.body.data).toEqual({
      key: 'ORDER_TRACKING',
      enabled: false,
      overridden: true,
      source: 'override',
      baseEnabled: true,
    });
    const menuTracking = async () =>
      (
        (
          await request(app.getHttpServer()).get(
            `/api/v1/public/qr/${world.genericQr}/menu`,
          )
        ).body.data as { context: { tracking: boolean } }
      ).context.tracking;
    expect(await menuTracking()).toBe(false);
    const back = await send(
      'put',
      `/restaurants/${id}/features/ORDER_TRACKING`,
      cookie,
      { enabled: null },
    );
    expect(back.body.data).toEqual({
      key: 'ORDER_TRACKING',
      enabled: true,
      overridden: false,
      source: 'default',
      baseEnabled: true,
    });
    expect(await menuTracking()).toBe(true);
    expect(
      await prisma.restaurantFeature.count({ where: { restaurantId: id } }),
    ).toBe(0);
    expect(
      (
        await send(
          'put',
          `/restaurants/${id}/features/ORDER_TRACKING`,
          cookie,
          { enabled: 'yes' },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send('put', `/restaurants/${id}/features/NOT_A_FEATURE`, cookie, {
          enabled: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(
          'put',
          `/restaurants/${randomUUID()}/features/ORDER_TRACKING`,
          cookie,
          { enabled: true },
        )
      ).status,
    ).toBe(404);

    // the audit log kept all of it, and an unchanged status writes nothing
    await send('patch', `/restaurants/${id}/status`, cookie, {
      status: 'ACTIVE',
    });
    const audit = await get(`/audit?restaurantId=${id}`, cookie);
    expect(audit.status).toBe(200);
    const actions = (audit.body.data as { action: string }[]).map(
      (entry) => entry.action,
    );
    expect(
      actions.filter((a) => a === 'restaurant.status_changed'),
    ).toHaveLength(2);
    expect(
      actions.filter((a) => a === 'restaurant.feature_changed'),
    ).toHaveLength(2);
    expect(audit.body.data[0]).toMatchObject({
      adminEmail: email,
      restaurantName: 'IT platform-manage',
    });

    const overview = await get('/overview', cookie);
    expect(overview.status).toBe(200);
    expect(overview.body.data.restaurants.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(overview.body.data.recentActivity)).toBe(true);
  });

  it('creates packages, applies them to restaurants live, keeps overrides on top, and records the changes', async () => {
    const email = await addAdmin();
    const cookie = await platformLogin(email);
    const world = await seedWorld('platform-package');
    const id = world.restaurantId;
    const tag = randomUUID().slice(0, 8);

    // validation
    const create = (body: Record<string, unknown>) =>
      send('post', '/packages', cookie, body);
    expect((await create({ name: '', features: [] })).status).toBe(400);
    expect(
      (await create({ name: `X ${tag}`, features: ['NOPE'] })).status,
    ).toBe(400);
    expect(
      (
        await create({
          name: `X ${tag}`,
          features: [],
          monthlyPrice: '-5',
          currencyCode: 'EGP',
        })
      ).status,
    ).toBe(400);
    // a price needs a currency
    const noCurrency = await create({
      name: `X ${tag}`,
      features: [],
      monthlyPrice: '99',
    });
    expect(noCurrency.status).toBe(422);
    expect(noCurrency.body.error.code).toBe('PACKAGE_CURRENCY_REQUIRED');

    // create: prices are normalized to two decimals, the name is unique ignoring case and spacing
    const created = await create({
      name: `  Display ${tag} `,
      description: 'Menu only',
      features: ['MENU_TEMPLATES', 'WHATSAPP_ORDERING'],
      monthlyPrice: '149.5',
      yearlyPrice: '1490',
      currencyCode: 'egp',
    });
    expect(created.status).toBe(201);
    const pkg = created.body.data as { id: string };
    expect(created.body.data).toMatchObject({
      name: `Display ${tag}`,
      status: 'ACTIVE',
      monthlyPrice: '149.50',
      yearlyPrice: '1490.00',
      currencyCode: 'EGP',
      features: ['WHATSAPP_ORDERING', 'MENU_TEMPLATES'],
      restaurantCount: 0,
    });
    const dup = await create({
      name: `DISPLAY  ${tag}`,
      features: [],
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PACKAGE_NAME_TAKEN');

    // assign: only what the package includes is allowed, at once, in the guest menu and the console
    const menuContext = async () =>
      (
        (
          await request(app.getHttpServer()).get(
            `/api/v1/public/qr/${world.genericQr}/menu`,
          )
        ).body.data as { context: { tracking: boolean } }
      ).context;
    expect((await menuContext()).tracking).toBe(true); // no package: every feature
    const assigned = await send('put', `/restaurants/${id}/package`, cookie, {
      packageId: pkg.id,
    });
    expect(assigned.body.data).toEqual({ packageId: pkg.id });
    expect((await menuContext()).tracking).toBe(false); // ORDER_TRACKING is not in the package
    const detail = await get(`/restaurants/${id}`, cookie);
    expect(detail.body.data.package).toEqual({
      id: pkg.id,
      name: `Display ${tag}`,
    });
    const states = detail.body.data.features as {
      key: string;
      enabled: boolean;
      source: string;
    }[];
    expect(states.find((f) => f.key === 'WHATSAPP_ORDERING')).toMatchObject({
      enabled: true,
      source: 'package',
    });
    expect(states.find((f) => f.key === 'ORDER_TRACKING')).toMatchObject({
      enabled: false,
      source: 'package',
      baseEnabled: false,
    });
    expect(detail.body.data.disabledFeatures).toEqual([
      'ORDER_TRACKING',
      'SMART_SUGGESTIONS',
      'DASHBOARD_ORDERING',
      'TABLE_ORDERING',
    ]);

    // editing the package reaches every restaurant on it immediately
    const edited = await send('patch', `/packages/${pkg.id}`, cookie, {
      features: ['ORDER_TRACKING'],
      description: null,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      features: ['ORDER_TRACKING'],
      description: null,
      restaurantCount: 1,
      monthlyPrice: '149.50',
    });
    expect((await menuContext()).tracking).toBe(true);

    // the restaurant's own override stays on top of its package
    await send('put', `/restaurants/${id}/features/ORDER_TRACKING`, cookie, {
      enabled: false,
    });
    expect((await menuContext()).tracking).toBe(false);
    const cleared = await send(
      'put',
      `/restaurants/${id}/features/ORDER_TRACKING`,
      cookie,
      { enabled: null },
    );
    expect(cleared.body.data).toMatchObject({
      enabled: true,
      overridden: false,
      source: 'package',
    });

    // a price cannot lose its currency; a package in use cannot be deleted, only archived
    expect(
      (
        await send('patch', `/packages/${pkg.id}`, cookie, {
          currencyCode: null,
        })
      ).status,
    ).toBe(422);
    const inUse = await send('delete', `/packages/${pkg.id}`, cookie, {});
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('PACKAGE_IN_USE');
    const archived = await send('patch', `/packages/${pkg.id}`, cookie, {
      status: 'ARCHIVED',
    });
    expect(archived.body.data.status).toBe('ARCHIVED');
    // an archived package keeps its restaurants but is not handed out again
    const other = await seedWorld('platform-package-2');
    const refused = await send(
      'put',
      `/restaurants/${other.restaurantId}/package`,
      cookie,
      { packageId: pkg.id },
    );
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('PACKAGE_ARCHIVED');
    expect((await menuContext()).tracking).toBe(true);

    // the list and the detail show how many restaurants use it, and which
    const list = await get('/packages', cookie);
    const listed = (
      list.body.data as { id: string; restaurantCount: number }[]
    ).find((item) => item.id === pkg.id);
    expect(listed?.restaurantCount).toBe(1);
    const packageDetail = await get(`/packages/${pkg.id}`, cookie);
    expect(packageDetail.body.data.restaurants).toEqual([
      { id, name: 'IT platform-package', status: 'ACTIVE' },
    ]);
    expect((await get(`/packages/${randomUUID()}`, cookie)).status).toBe(404);
    expect((await get('/packages/not-a-uuid', cookie)).status).toBe(404);

    // take the restaurant off the package: every feature again, then the package can go
    const off = await send('put', `/restaurants/${id}/package`, cookie, {
      packageId: null,
    });
    expect(off.body.data).toEqual({ packageId: null });
    expect(
      (await send('put', `/restaurants/${id}/package`, cookie, {})).status,
    ).toBe(400);
    expect(
      (
        await send('put', `/restaurants/${id}/package`, cookie, {
          packageId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(
      (await send('delete', `/packages/${pkg.id}`, cookie, {})).status,
    ).toBe(204);
    expect(await prisma.package.count({ where: { id: pkg.id } })).toBe(0);

    // everything was recorded
    const audit = await get('/audit?limit=200', cookie);
    const mine = (
      audit.body.data as { action: string; adminEmail: string }[]
    ).filter((entry) => entry.adminEmail === email);
    const count = (action: string) =>
      mine.filter((entry) => entry.action === action).length;
    expect(count('package.created')).toBe(1);
    expect(count('package.updated')).toBe(2); // features + description, then archive
    expect(count('package.deleted')).toBe(1);
    expect(count('restaurant.package_changed')).toBe(2);
  });

  it('a package without any ordering feature is a view-only menu: no WhatsApp, no dashboard orders, no table orders', async () => {
    const email = await addAdmin();
    const cookie = await platformLogin(email);
    const world = await seedWorld('platform-display-only');
    const id = world.restaurantId;
    const tag = randomUUID().slice(0, 8);

    // "Display only" keeps the look features and the tracking, but none of the three ordering features
    const created = await send('post', '/packages', cookie, {
      name: `Display only ${tag}`,
      features: ['MENU_TEMPLATES', 'SMART_SUGGESTIONS'],
    });
    expect(created.status).toBe(201);
    const pkg = created.body.data as { id: string };
    await send('put', `/restaurants/${id}/package`, cookie, {
      packageId: pkg.id,
    });
    // the restaurant itself has everything switched on: the package still wins
    await prisma.restaurant.update({
      where: { id },
      data: {
        whatsappOrderingEnabled: true,
        whatsappNumber: '+201012345678',
        pickupEnabled: true,
        deliveryEnabled: true,
        tableOrderingEnabled: true,
      },
    });

    const menu = async (qr: string) =>
      (
        (await request(app.getHttpServer()).get(`/api/v1/public/qr/${qr}/menu`))
          .body.data as {
          context: {
            ordering: Record<string, boolean> | null;
            tableOrdering: string | null;
            pickupBranches: unknown[] | null;
          };
        }
      ).context;
    const generic = await menu(world.genericQr);
    expect(generic.ordering).toEqual({
      pickup: false,
      delivery: false,
      whatsapp: false,
    });
    expect(generic.pickupBranches).toEqual([]);
    expect((await menu(world.tableQr)).tableOrdering).toBe('DISABLED');

    // and the orders themselves are refused, not only hidden
    const pickup = await placeOrder(world.genericQr, {
      items: [{ productId: world.productId, quantity: 1 }],
      fulfillment: 'PICKUP',
      customerName: 'Mona',
      customerPhone: '01012345678',
    });
    expect(pickup.status).toBeGreaterThanOrEqual(400);
    const table = await placeOrder(world.tableQr, {
      items: [{ productId: world.productId, quantity: 1 }],
    });
    expect(table.status).toBe(409);
    expect(table.body.error.code).toBe('ORDERING_DISABLED');
    expect(await prisma.order.count({ where: { restaurantId: id } })).toBe(0);

    // adding only WhatsApp ordering to the package turns on WhatsApp, and nothing else
    await send('patch', `/packages/${pkg.id}`, cookie, {
      features: ['MENU_TEMPLATES', 'SMART_SUGGESTIONS', 'WHATSAPP_ORDERING'],
    });
    expect((await menu(world.genericQr)).ordering).toMatchObject({
      whatsapp: true,
    });
    expect((await menu(world.tableQr)).tableOrdering).toBe('DISABLED');
  });
});
