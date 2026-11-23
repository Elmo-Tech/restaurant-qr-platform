import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import type { StarterRoleKind } from '../src/auth/permission/role-permissions';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const password = 'correct horse battery staple';
const draft = (internalName: string) => ({
  internalName,
  scope: 'CART',
  discountType: 'PERCENTAGE',
  value: '10.00',
  translations: [{ locale: 'en', title: internalName }],
});

interface Promotion {
  id: string;
  status: string;
  updatedAt: string;
  canDelete: boolean;
}

const data = <T>(response: request.Response) =>
  (response.body as { data: T }).data;
const promotion = (response: request.Response) => data<Promotion>(response);

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ error: { code } });
}

/** Real HTTP routes, sessions and constraints; fixtures remain in the marked disposable sandbox. */
describeSandbox('Staff Promotions (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let origin: string;
  let passwordHash: string;
  type World = Awaited<ReturnType<typeof seedWorld>>;
  let own: World;
  let foreign: World;
  let manager: string;
  let owner: string;
  let cashier: string;
  let branchManager: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
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
    await assertSandboxIdentity(prisma);
    origin = app.get(ConfigService).getOrThrow<string>('CORS_ORIGIN');
    passwordHash = await app.get(PasswordHasherService).hashPassword(password);
    own = await seedWorld('Primary');
    foreign = await seedWorld('Foreign');
    manager = await login(own, 'MANAGER');
    owner = await login(own, 'OWNER');
    cashier = await login(own, 'CASHIER');
    branchManager = await login(own, 'MANAGER', false);
  }, 20_000);

  afterAll(async () => {
    await app?.close();
  });

  async function seedWorld(label: string, optIn = true) {
    const { id: restaurantId } = await prisma.restaurant.create({
      data: {
        publicId: `it-b3-${randomUUID()}`,
        name: `B3 ${label}`,
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
        countryCode: 'EG',
        locales: {
          create: [
            { locale: 'en', isActive: true },
            { locale: 'ar', isActive: true },
          ],
        },
        ...(optIn
          ? { features: { create: { feature: 'PROMOTIONS', enabled: true } } }
          : {}),
      },
    });
    const branch = (name: string) =>
      prisma.branch.create({
        data: {
          restaurantId,
          publicId: `it-b3-${randomUUID()}`,
          name,
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
    const { id: branchId } = await branch(`${label} Main`);
    const { id: otherBranchId } = await branch(`${label} Extension`);
    const { id: qrCodeId } = await prisma.qrCode.create({
      data: {
        restaurantId,
        publicCode: `it-b3-${randomUUID()}`,
        type: 'GENERIC',
        status: 'ACTIVE',
      },
    });
    const { id: menuId } = await prisma.menu.create({
      data: {
        restaurantId,
        nameInternal: `${label} Menu`,
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translations: { create: { locale: 'en', name: `${label} Menu` } },
      },
    });
    const { id: categoryId } = await prisma.category.create({
      data: {
        restaurantId,
        menuId,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: { locale: 'en', name: `${label} Mains` } },
      },
    });
    const { id: productId } = await prisma.product.create({
      data: {
        restaurantId,
        categoryId,
        publicId: `it-b3-${randomUUID()}`,
        basePrice: '10.05',
        displayOrder: 0,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        allowCustomerNotes: false,
        featured: false,
        translations: { create: { locale: 'en', name: `${label} Product` } },
      },
    });
    const { id: zoneId } = await addZone(
      restaurantId,
      branchId,
      `${label} Zone A`,
    );
    const { id: otherZoneId } = await addZone(
      restaurantId,
      otherBranchId,
      `${label} Zone B`,
    );
    return {
      restaurantId,
      branchId,
      otherBranchId,
      qrCodeId,
      menuId,
      categoryId,
      productId,
      zoneId,
      otherZoneId,
    };
  }

  function addZone(restaurantId: string, branchId: string, name: string) {
    return prisma.deliveryZone.create({
      data: {
        restaurantId,
        branchId,
        name,
        status: 'ACTIVE',
        displayOrder: 0,
        deliveryFee: '5.05',
        minimumOrder: '28.00',
        translations: { create: { locale: 'en', name } },
      },
    });
  }

  async function login(w: World, kind: StarterRoleKind, allBranches = true) {
    const email = `it-b3-${randomUUID()}@example.test`;
    const { id: userId } = await prisma.user.create({
      data: { email, emailNormalized: email, passwordHash, status: 'ACTIVE' },
    });
    const role = await ensureStarterRole(prisma, w.restaurantId, kind);
    await prisma.restaurantMembership.create({
      data: {
        restaurantId: w.restaurantId,
        userId,
        role: kind,
        roleId: role.id,
        status: 'ACTIVE',
        allBranches,
        ...(!allBranches
          ? { branchAccess: { create: { branchId: w.branchId } } }
          : {}),
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookies: unknown = response.headers['set-cookie'];
    const session = Array.isArray(cookies)
      ? cookies.find(
          (value: unknown): value is string =>
            typeof value === 'string' &&
            value.startsWith('restaurant_session='),
        )
      : undefined;
    if (!session) throw new Error('Login did not set the Staff session cookie');
    return session.split(';')[0];
  }

  const restaurantPath = (w: World) => `/api/v1/restaurants/${w.restaurantId}`;
  const path = (w: World, suffix = '') =>
    `${restaurantPath(w)}/promotions${suffix}`;
  const get = (cookie: string, url: string) =>
    request(app.getHttpServer()).get(url).set('Cookie', cookie);

  type Mutation = 'post' | 'patch' | 'delete';
  function send(
    method: Mutation,
    cookie: string,
    url: string,
    body?: object,
    requestOrigin: string | null = origin,
  ) {
    const req = request(app.getHttpServer())[method](url).set('Cookie', cookie);
    if (requestOrigin !== null) req.set('Origin', requestOrigin);
    if (body) req.send(body);
    return req;
  }

  async function create(w: World, body: object, cookie = manager) {
    return promotion(await send('post', cookie, path(w), body).expect(201));
  }

  const action = (
    w: World,
    id: string,
    name: 'activate' | 'deactivate' | 'archive',
    body?: object,
  ) => send('post', manager, path(w, `/${id}/${name}`), body);

  const previewBody = (w: World, promotionDraft = draft('Preview draft')) => ({
    draft: promotionDraft,
    branchId: w.branchId,
    orderType: 'PICKUP',
    items: [{ productId: w.productId, quantity: 3 }],
  });

  it('enforces starter roles and requires all Branches on every structural write', async () => {
    const row = await create(
      own,
      { ...draft('Role checks'), status: 'ACTIVE' },
      owner,
    );
    expect(row.status).toBe('INACTIVE');
    await request(app.getHttpServer()).get(path(own)).expect(401);
    for (const kind of ['KITCHEN', 'WAITER'] as const) {
      const cookie = await login(own, kind);
      expectError(await get(cookie, path(own)), 403, 'PERMISSION_DENIED');
      expectError(
        await send('post', cookie, path(own, '/preview'), previewBody(own)),
        403,
        'PERMISSION_DENIED',
      );
    }
    for (const cookie of [cashier, branchManager]) {
      await get(cookie, path(own)).expect(200);
      await get(cookie, path(own, `/${row.id}`)).expect(200);
      await send(
        'post',
        cookie,
        path(own, '/preview'),
        previewBody(own),
      ).expect(200);
      const writes: [Mutation, string, object?][] = [
        ['post', '', draft('Denied')],
        ['patch', `/${row.id}`, { value: '12.00' }],
        ['post', `/${row.id}/activate`],
        ['post', `/${row.id}/deactivate`],
        ['post', `/${row.id}/archive`],
        ['delete', `/${row.id}`],
      ];
      for (const [method, suffix, body] of writes) {
        expectError(
          await send(method, cookie, path(own, suffix), body),
          403,
          'PERMISSION_DENIED',
        );
      }
    }
    const choices = data<{
      branches: { id: string }[];
      deliveryZones: { id: string }[];
    }>(await get(branchManager, path(own, '/targets')).expect(200));
    expect(choices.branches.map((item) => item.id)).toEqual([own.branchId]);
    expect(choices.deliveryZones.map((item) => item.id)).toEqual([own.zoneId]);
    expectError(
      await send('post', branchManager, path(own, '/preview'), {
        ...previewBody(own),
        branchId: own.otherBranchId,
      }),
      422,
      'PROMOTION_PREVIEW_BRANCH_INVALID',
    );
    const changed = await send('patch', manager, path(own, `/${row.id}`), {
      value: '12.00',
    }).expect(200);
    expect(data(changed)).toMatchObject({ value: '12.00', status: 'INACTIVE' });
  });

  it('rejects missing and foreign Origins on unsafe routes, but not GET', async () => {
    const row = await create(own, draft('CSRF check'));
    await get(manager, path(own, `/${row.id}`)).expect(200);
    expectError(
      await send('post', manager, path(own), draft('Missing Origin'), null),
      403,
      'CSRF_VALIDATION_FAILED',
    );
    expectError(
      await send(
        'patch',
        manager,
        path(own, `/${row.id}`),
        { value: '12.00' },
        'https://untrusted.example.test',
      ),
      403,
      'CSRF_VALIDATION_FAILED',
    );
    expectError(
      await send(
        'post',
        manager,
        path(own, `/${row.id}/activate`),
        undefined,
        null,
      ),
      403,
      'CSRF_VALIDATION_FAILED',
    );
    expectError(
      await send('delete', manager, path(own, `/${row.id}`), undefined, null),
      403,
      'CSRF_VALIDATION_FAILED',
    );
    expectError(
      await send(
        'post',
        manager,
        path(own, '/preview'),
        previewBody(own),
        null,
      ),
      403,
      'CSRF_VALIDATION_FAILED',
    );
    expect(
      data(await get(manager, path(own, `/${row.id}`)).expect(200)),
    ).toMatchObject({ status: 'INACTIVE', value: '10.00' });
  });

  it('requires explicit PROMOTIONS opt-in even for a no-package Owner', async () => {
    const w = await seedWorld('Entitlement', false);
    const cookie = await login(w, 'OWNER');
    for (const res of [
      await get(cookie, path(w)),
      await get(cookie, path(w, '/targets')),
      await send('post', cookie, path(w), draft('Not enabled')),
      await send('post', cookie, path(w, '/preview'), previewBody(w)),
    ]) {
      expectError(res, 403, 'FEATURE_NOT_AVAILABLE');
    }
    await prisma.restaurantFeature.create({
      data: {
        restaurantId: w.restaurantId,
        feature: 'PROMOTIONS',
        enabled: true,
      },
    });
    await get(cookie, path(w)).expect(200);
    await get(cookie, path(w, '/targets')).expect(200);
    expect((await create(w, draft('Explicit opt-in'), cookie)).status).toBe(
      'INACTIVE',
    );
  });

  it('hides another tenant, its rows and all five target types', async () => {
    const foreignOwner = await login(foreign, 'OWNER');
    const other = await create(
      foreign,
      draft('Foreign promotion'),
      foreignOwner,
    );
    const local = await create(own, draft('Local promotion'));
    expectError(await get(manager, path(foreign)), 404, 'RESTAURANT_NOT_FOUND');
    expectError(
      await get(manager, path(own, `/${other.id}`)),
      404,
      'PROMOTION_NOT_FOUND',
    );
    expectError(
      await send('patch', manager, path(own, `/${other.id}`), {
        value: '12.00',
      }),
      404,
      'PROMOTION_NOT_FOUND',
    );
    expectError(
      await send('delete', manager, path(own, `/${other.id}`)),
      404,
      'PROMOTION_NOT_FOUND',
    );
    const choices = await get(manager, path(own, '/targets')).expect(200);
    for (const [key, id, foreignId] of [
      ['branches', own.branchId, foreign.branchId],
      ['menus', own.menuId, foreign.menuId],
      ['categories', own.categoryId, foreign.categoryId],
      ['products', own.productId, foreign.productId],
      ['deliveryZones', own.zoneId, foreign.zoneId],
    ] as const) {
      const ids = data<Record<string, { id: string }[]>>(choices)[key].map(
        (item) => item.id,
      );
      expect(ids).toContain(id);
      expect(ids).not.toContain(foreignId);
    }
    const before = await prisma.promotion.count({
      where: { restaurantId: own.restaurantId },
    });
    for (const restriction of [
      { scope: 'CART', branchIds: [own.branchId, foreign.branchId] },
      { scope: 'MENU', menuIds: [own.menuId, foreign.menuId] },
      { scope: 'CATEGORY', categoryIds: [own.categoryId, foreign.categoryId] },
      { scope: 'CART', productIds: [own.productId, foreign.productId] },
      { scope: 'DELIVERY', deliveryZoneIds: [own.zoneId, foreign.zoneId] },
    ]) {
      const body = { ...draft('Foreign target'), ...restriction };
      expectError(
        await send('post', manager, path(own), body),
        422,
        'INVALID_PROMOTION_TARGET',
      );
      expectError(
        await send('patch', manager, path(own, `/${local.id}`), body),
        422,
        'INVALID_PROMOTION_TARGET',
      );
    }
    expect(
      await prisma.promotion.count({
        where: { restaurantId: own.restaurantId },
      }),
    ).toBe(before);
    expect(
      data(await get(manager, path(own, `/${local.id}`)).expect(200)),
    ).toMatchObject({
      internalName: 'Local promotion',
      scope: 'CART',
      branchIds: [],
      menuIds: [],
      categoryIds: [],
      productIds: [],
      deliveryZoneIds: [],
    });
    expectError(
      await send('post', manager, path(own, '/preview'), {
        ...previewBody(own),
        promotionId: other.id,
      }),
      404,
      'PROMOTION_NOT_FOUND',
    );
    for (const [sample, code] of [
      [{ branchId: foreign.branchId }, 'PROMOTION_PREVIEW_BRANCH_INVALID'],
      [
        { orderType: 'DELIVERY', deliveryZoneId: foreign.zoneId },
        'PROMOTION_PREVIEW_ZONE_INVALID',
      ],
      [
        { orderType: 'DELIVERY', deliveryZoneId: own.otherZoneId },
        'PROMOTION_PREVIEW_ZONE_INVALID',
      ],
      [
        { items: [{ productId: foreign.productId, quantity: 1 }] },
        'PROMOTION_PREVIEW_PRODUCT_INVALID',
      ],
    ] as const) {
      expectError(
        await send('post', manager, path(own, '/preview'), {
          ...previewBody(own),
          ...sample,
        }),
        422,
        code,
      );
    }
  });

  it('rejects invalid money, policy combinations, schedules and translations without writing', async () => {
    const before = await prisma.promotion.count({
      where: { restaurantId: own.restaurantId },
    });
    for (const invalid of [
      {
        scope: 'CATEGORY',
        categoryIds: [own.categoryId],
        discountType: 'FIXED_AMOUNT',
      },
      { scope: 'MENU', menuIds: [own.menuId], discountType: 'FIXED_AMOUNT' },
      { scope: 'MENU', menuIds: [own.menuId], minimumSubtotal: '10.00' },
      { scope: 'CATEGORY' },
      { scope: 'QUANTITY', minimumQuantity: 2 },
      { scope: 'CART', minimumQuantity: 2, quantityBasis: 'UNITS' },
      { scope: 'DELIVERY', productIds: [own.productId] },
      { startsOn: '2031-01-02', endsOn: '2031-01-01' },
      { value: '100.01' },
      { discountType: 'FIXED_AMOUNT', value: '0.00' },
    ]) {
      const res = await send('post', manager, path(own), {
        ...draft('Invalid policy'),
        ...invalid,
      });
      expectError(res, 422, 'PROMOTION_INVALID');
      const { problems } = (
        res.body as {
          error: { details: { problems: { field: string; code: string }[] } };
        }
      ).error.details;
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(typeof problem.field).toBe('string');
        expect(typeof problem.code).toBe('string');
      }
    }
    for (const invalid of [{ value: 10 }, { value: '10.001' }]) {
      expectError(
        await send('post', manager, path(own), {
          ...draft('Invalid money'),
          ...invalid,
        }),
        400,
        'VALIDATION_ERROR',
      );
    }
    await send('post', manager, path(own), {
      ...draft('Missing default title'),
      translations: [{ locale: 'ar', title: 'عرض' }],
    }).expect(422);
    expect(
      await prisma.promotion.count({
        where: { restaurantId: own.restaurantId },
      }),
    ).toBe(before);
  });

  it('round-trips category targets and combines list filters with pagination', async () => {
    const spec = {
      ...draft('Listing needle category'),
      scope: 'CATEGORY',
      categoryIds: [own.categoryId],
      branchIds: [own.branchId],
    };
    const category = await create(own, spec);
    expect(
      data(await get(cashier, path(own, `/${category.id}`)).expect(200)),
    ).toMatchObject(spec);
    expect(
      promotion(await action(own, category.id, 'activate').expect(200)).status,
    ).toBe('ACTIVE');
    const list = await get(cashier, path(own))
      .query({ status: 'ACTIVE', scope: 'CATEGORY', search: 'nEeDlE' })
      .expect(200);
    expect(data<Promotion[]>(list).map(({ id }) => id)).toEqual([category.id]);
    expect(
      promotion(await action(own, category.id, 'deactivate').expect(200))
        .status,
    ).toBe('INACTIVE');
    expect(
      await prisma.promotionCategory.count({
        where: { promotionId: category.id, categoryId: own.categoryId },
      }),
    ).toBe(1);

    const restricted = {
      ...draft('Listing needle delivery'),
      scope: 'DELIVERY',
      deliveryZoneIds: [own.zoneId],
    };
    const a = await create(own, {
      ...restricted,
      internalName: 'Listing needle delivery A',
    });
    const b = await create(own, {
      ...restricted,
      internalName: 'Listing needle delivery B',
    });
    await create(own, { ...restricted, deliveryZoneIds: [own.otherZoneId] });
    const ids: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await get(cashier, path(own))
        .query({
          scope: 'DELIVERY',
          status: 'INACTIVE',
          search: 'needle',
          zoneId: own.zoneId,
          page,
          pageSize: 1,
        })
        .expect(200);
      expect(res.body).toMatchObject({ meta: { page, pageSize: 1, total: 2 } });
      const rows = data<Promotion[]>(res);
      expect(rows).toHaveLength(page === 3 ? 0 : 1);
      ids.push(...rows.map(({ id }) => id));
    }
    expect(ids.sort()).toEqual([a.id, b.id].sort());
  });

  it('blocks deletion of a referenced zone and requires confirmation before widening its last target', async () => {
    const { id: zoneId } = await addZone(
      own.restaurantId,
      own.branchId,
      'Safely removable',
    );
    const row = await create(own, {
      ...draft('Zone restriction'),
      scope: 'DELIVERY',
      deliveryZoneIds: [zoneId],
    });
    const active = promotion(await action(own, row.id, 'activate').expect(200));
    const zone = `${restaurantPath(own)}/delivery-zones/${zoneId}`;
    const current = path(own, `/${row.id}`);
    const readZone = async () => {
      const response = await get(
        owner,
        `${restaurantPath(own)}/delivery`,
      ).expect(200);
      return data<
        {
          zones: {
            id: string;
            canDelete: boolean;
            deleteBlockedBy: string | null;
          }[];
        }[]
      >(response)
        .flatMap(({ zones }) => zones)
        .find(({ id }) => id === zoneId);
    };
    expect(await readZone()).toMatchObject({
      canDelete: false,
      deleteBlockedBy: 'PROMOTIONS',
    });
    expectError(
      await send('delete', owner, zone),
      409,
      'DELIVERY_ZONE_USED_BY_PROMOTIONS',
    );
    const denied = await send('patch', manager, current, {
      deliveryZoneIds: [],
    });
    expectError(denied, 409, 'PROMOTION_TARGET_WIDENING_CONFIRMATION_REQUIRED');
    expect(denied.body).toMatchObject({
      error: { details: { fields: ['deliveryZoneIds'] } },
    });
    expect(data(await get(manager, current).expect(200))).toMatchObject({
      deliveryZoneIds: [zoneId],
      status: 'ACTIVE',
    });
    const changed = await send('patch', manager, current, {
      deliveryZoneIds: [],
      confirmTargetWidening: true,
      expectedUpdatedAt: active.updatedAt,
    }).expect(200);
    expect(data(changed)).toMatchObject({
      deliveryZoneIds: [],
      status: 'ACTIVE',
    });
    await send('delete', owner, zone).expect(204);
    expect(
      await prisma.deliveryZone.findUnique({ where: { id: zoneId } }),
    ).toBeNull();
    expectError(
      await action(own, row.id, 'deactivate', {
        expectedUpdatedAt: row.updatedAt,
      }),
      409,
      'PROMOTION_CHANGED',
    );
    await action(own, row.id, 'deactivate').expect(200);
  });

  async function writeOrderSnapshot(
    tx: Prisma.TransactionClient,
    w: World,
    promotionId: string,
  ) {
    const order = await tx.order.create({
      data: {
        restaurantId: w.restaurantId,
        branchId: w.branchId,
        qrCodeId: w.qrCodeId,
        clientRequestId: randomUUID(),
        status: 'PENDING',
        type: 'PICKUP',
        currencyCode: 'EGP',
        totalAmount: '9.04',
        subtotalAmount: '9.04',
        deliveryFeeAmount: '0.00',
        discountTotalAmount: '1.01',
        promotionDiscountAmount: '1.01',
      },
    });
    const line = await tx.orderItem.create({
      data: {
        orderId: order.id,
        productId: w.productId,
        productNameSnapshot: 'Historical product',
        unitPrice: '10.05',
        quantity: 1,
        lineTotal: '10.05',
      },
    });
    const row = await tx.orderPromotion.create({
      data: {
        orderId: order.id,
        restaurantId: w.restaurantId,
        promotionId,
        scope: 'CATEGORY',
        discountType: 'PERCENTAGE',
        value: '10.00',
        amount: '1.01',
        internalNameSnapshot: 'Historical name',
        titleSnapshot: 'Historical title',
        configSnapshot: { categoryIds: [w.categoryId], value: '10.00' },
      },
    });
    await tx.orderPromotionAllocation.create({
      data: {
        orderPromotionId: row.id,
        orderItemId: line.id,
        orderId: order.id,
        amount: '1.01',
      },
    });
    return row.id;
  }

  const storedSnapshot = (id: string) =>
    prisma.orderPromotion.findUniqueOrThrow({
      where: { id },
      include: { allocations: true },
    });

  it('archives a used Promotion without rewriting Order snapshots and deletes only unused promotions', async () => {
    const row = await create(own, {
      ...draft('Historical name'),
      scope: 'CATEGORY',
      categoryIds: [own.categoryId],
      branchIds: [own.branchId],
    });
    await action(own, row.id, 'activate').expect(200);
    const id = await prisma.$transaction((tx) =>
      writeOrderSnapshot(tx, own, row.id),
    );
    const before = await storedSnapshot(id);
    const current = path(own, `/${row.id}`);
    expect(promotion(await get(manager, current).expect(200)).canDelete).toBe(
      false,
    );
    expectError(
      await send('delete', manager, current),
      409,
      'PROMOTION_HAS_HISTORICAL_REFERENCES',
    );
    await send('patch', manager, current, { value: '21.50' }).expect(200);
    const archive = await action(own, row.id, 'archive').expect(200);
    expect(data(archive)).toMatchObject({
      status: 'ARCHIVED',
      categoryIds: [],
      branchIds: [],
      canDelete: false,
    });
    expect(typeof data<{ archivedAt: unknown }>(archive).archivedAt).toBe(
      'string',
    );
    expect(await storedSnapshot(id)).toEqual(before);
    expectError(
      await send('delete', manager, current),
      409,
      'PROMOTION_HAS_HISTORICAL_REFERENCES',
    );
    expectError(
      await action(own, row.id, 'activate'),
      409,
      'PROMOTION_ARCHIVED',
    );
    expect(promotion(await get(manager, current).expect(200)).status).toBe(
      'ARCHIVED',
    );

    const unused = await create(own, {
      ...draft('No history'),
      scope: 'DELIVERY',
      deliveryZoneIds: [own.otherZoneId],
    });
    expect(unused.canDelete).toBe(true);
    await send('delete', manager, path(own, `/${unused.id}`)).expect(204);
    expectError(
      await get(manager, path(own, `/${unused.id}`)),
      404,
      'PROMOTION_NOT_FOUND',
    );
    expect(
      await prisma.promotionDeliveryZone.count({
        where: { promotionId: unused.id },
      }),
    ).toBe(0);
  });

  it('maps a real Order snapshot insert racing the delete pre-check to a stable conflict', async () => {
    const row = await create(own, {
      ...draft('Delete race'),
      scope: 'CATEGORY',
      categoryIds: [own.categoryId],
    });
    await action(own, row.id, 'activate').expect(200);
    const current = path(own, `/${row.id}`);
    const race: { deletion?: Promise<request.Response> } = {};
    let snapshotId: string;
    try {
      snapshotId = await prisma.$transaction(
        async (writer) => {
          const [{ pid }] = await writer.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          const id = await writeOrderSnapshot(writer, own, row.id);
          // The uncommitted FK reference is invisible to the HTTP delete's pre-check but locks the Promotion.
          race.deletion = send('delete', manager, current).then(
            (response) => response,
          );
          const deadline = Date.now() + 4_000;
          do {
            // Poll outside the writer transaction so activity snapshots are refreshed each time.
            const [{ blocked }] = await prisma.$queryRaw<
              { blocked: boolean }[]
            >`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database()
                AND ${pid} = ANY(pg_blocking_pids(pid))
                AND query ~* '^DELETE[[:space:]]+FROM[[:space:]]+'
                AND query LIKE '%"promotions"%'
            ) AS blocked`;
            if (blocked) return id; // Commit while the real DELETE is waiting, so PostgreSQL refuses it.
            await delay(20);
          } while (Date.now() < deadline);
          throw new Error(
            'HTTP delete never waited on the uncommitted Order snapshot',
          );
        },
        { timeout: 6_000 },
      );
    } finally {
      await race.deletion;
    }
    if (!race.deletion) throw new Error('HTTP delete was not started');
    expectError(
      await race.deletion,
      409,
      'PROMOTION_HAS_HISTORICAL_REFERENCES',
    );
    expect(promotion(await get(manager, current).expect(200)).canDelete).toBe(
      false,
    );
    expect((await storedSnapshot(snapshotId)).promotionId).toBe(row.id);
  }, 10_000);

  it('returns a target-specific conflict when a Zone delete wins against a Promotion save', async () => {
    const { id: zoneId } = await addZone(
      own.restaurantId,
      own.branchId,
      'Racing zone',
    );
    const internalName = 'Racing zone promotion';
    const race: { save?: Promise<request.Response> } = {};
    try {
      await prisma.$transaction(
        async (deleting) => {
          const [{ pid }] = await deleting.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          await deleting.deliveryZone.delete({ where: { id: zoneId } });
          race.save = send('post', manager, path(own), {
            ...draft(internalName),
            scope: 'DELIVERY',
            deliveryZoneIds: [zoneId],
          }).then((response) => response);
          const deadline = Date.now() + 4_000;
          do {
            const [{ blocked }] = await prisma.$queryRaw<
              { blocked: boolean }[]
            >`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))
                AND query LIKE '%INSERT INTO%' AND query LIKE '%promotion_delivery_zones%'
            ) AS blocked`;
            if (blocked) return;
            await delay(20);
          } while (Date.now() < deadline);
          throw new Error(
            'The Promotion write never waited on the deleting Zone',
          );
        },
        { timeout: 6_000 },
      );
    } finally {
      await race.save;
    }
    if (!race.save) throw new Error('Promotion save was not started');
    const response = await race.save;
    expectError(response, 409, 'PROMOTION_TARGET_CHANGED');
    expect(response.body).toMatchObject({
      error: { details: { fields: ['deliveryZoneIds'] } },
    });
    expect(
      await prisma.promotion.count({
        where: { restaurantId: own.restaurantId, internalName },
      }),
    ).toBe(0);
  }, 10_000);

  it('uses authoritative PRICE_CHANGED when a hard delete wins against checkout', async () => {
    const w = await seedWorld('Checkout race');
    const cookie = await login(w, 'MANAGER');
    const row = await create(
      w,
      {
        ...draft('Checkout race'),
        scope: 'CATEGORY',
        categoryIds: [w.categoryId],
      },
      cookie,
    );
    await send('post', cookie, path(w, `/${row.id}/activate`)).expect(200);
    const { publicCode } = await prisma.qrCode.findUniqueOrThrow({
      where: { id: w.qrCodeId },
    });
    const clientRequestId = randomUUID();
    const place = (expectedTotal: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/public/qr/${publicCode}/orders`)
        .send({
          fulfillment: 'PICKUP',
          branchId: w.branchId,
          customerName: 'Sara',
          customerPhone: '+20 100 000 0000',
          expectedTotal,
          clientRequestId,
          items: [{ productId: w.productId, quantity: 1 }],
        });
    const race: { checkout?: Promise<request.Response> } = {};
    try {
      await prisma.$transaction(
        async (deleting) => {
          const [{ pid }] = await deleting.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          await deleting.promotion.delete({
            where: { id: row.id, restaurantId: w.restaurantId },
          });
          race.checkout = place('9.04').then((response) => response);
          const deadline = Date.now() + 4_000;
          do {
            const [{ blocked }] = await prisma.$queryRaw<
              { blocked: boolean }[]
            >`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))
                AND query LIKE '%FROM promotions%' AND query LIKE '%FOR KEY SHARE'
            ) AS blocked`;
            if (blocked) return;
            await delay(20);
          } while (Date.now() < deadline);
          throw new Error('Checkout never waited on the deleting Promotion');
        },
        { timeout: 6_000 },
      );
    } finally {
      await race.checkout;
    }
    if (!race.checkout) throw new Error('Checkout was not started');
    const changed = await race.checkout;
    expectError(changed, 422, 'PRICE_CHANGED');
    expect(changed.body).toMatchObject({
      error: { details: { pricing: { total: '10.05' } } },
    });
    expect(
      await prisma.order.count({ where: { restaurantId: w.restaurantId } }),
    ).toBe(0);
    const confirmed = await place('10.05').expect(201);
    expect(data(confirmed)).toMatchObject({ total: '10.05', promotions: [] });
  }, 10_000);

  it('previews exact DEC-075 savings, rounding and net zone minimum without writing', async () => {
    const w = await seedWorld('Preview');
    const cookie = await login(w, 'MANAGER');
    const category = await create(
      w,
      {
        ...draft('Preview category'),
        scope: 'CATEGORY',
        categoryIds: [w.categoryId],
        branchIds: [w.branchId],
      },
      cookie,
    );
    const delivery = await create(
      w,
      {
        ...draft('Preview delivery'),
        scope: 'DELIVERY',
        value: '50.00',
        deliveryZoneIds: [w.zoneId],
      },
      cookie,
    );
    for (const row of [category, delivery]) {
      await send('post', cookie, path(w, `/${row.id}/activate`)).expect(200);
    }
    const preview = {
      ...previewBody(w, draft('Preview 10 percent on the cart')),
      orderType: 'DELIVERY',
      deliveryZoneId: w.zoneId,
    };
    const counts = async () => ({
      promotions: await prisma.promotion.count({
        where: { restaurantId: w.restaurantId },
      }),
      orders: await prisma.order.count({
        where: { restaurantId: w.restaurantId },
      }),
    });
    const before = await counts();
    const summary = await send(
      'post',
      cookie,
      path(w, '/preview'),
      preview,
    ).expect(200);
    // Per-unit category saving is 1.01 × 3 = 3.03; cart percentage saves 3.02 only.
    expect(data(summary)).toMatchObject({
      strategy: 'ITEM',
      merchandiseOriginal: '30.15',
      merchandisePayable: '27.12',
      deliveryFeeOriginal: '5.05',
      deliveryFeePayable: '2.52',
      grandTotal: '29.64',
      appliedSaving: '0.00',
      diagnostic: { status: 'LOST_TO_BETTER_OFFER', potentialSaving: '3.02' },
      zoneMinimumShortfall: '0.88',
    });
    const qualifying = await send('post', cookie, path(w, '/preview'), {
      ...preview,
      draft: {
        ...draft('Quantity threshold'),
        scope: 'QUANTITY',
        quantityBasis: 'UNITS',
        minimumQuantity: 4,
      },
    }).expect(200);
    expect(data(qualifying)).toMatchObject({
      diagnostic: { status: 'BELOW_MINIMUM_QUANTITY', remainingQuantity: 1 },
    });
    const replacesExisting = await send('post', cookie, path(w, '/preview'), {
      ...preview,
      promotionId: category.id,
      draft: {
        ...draft('Preview a change to category'),
        scope: 'CATEGORY',
        categoryIds: [w.categoryId],
        value: '5.00',
      },
    }).expect(200);
    expect(data(replacesExisting)).toMatchObject({
      strategy: 'ITEM',
      merchandisePayable: '28.65',
      appliedSaving: '1.50',
      zoneMinimumShortfall: null,
      diagnostic: { status: 'APPLIED', potentialSaving: '1.50' },
    });
    expect(await counts()).toEqual(before);
    expect(
      data(await get(cookie, path(w, `/${category.id}`)).expect(200)),
    ).toMatchObject({ value: '10.00', status: 'ACTIVE' });
  });
});
