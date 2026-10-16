import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

/**
 * Product Variants V1 (DEC-041), Staff API end to end:
 * `/restaurants/{id}/products/{productId}/variants` (menu.view to read,
 * menu.manage with Restaurant-wide scope + CSRF to write).
 */
describe('Product variants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const ORIGIN = 'http://localhost:3000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
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
    passwordHasherService = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const restaurantId of createdRestaurantIds.splice(0)) {
      await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
      await prisma.order.deleteMany({ where: { restaurantId } });
      await prisma.qrCode.deleteMany({ where: { restaurantId } });
      await prisma.table.deleteMany({ where: { restaurantId } });
      await prisma.productVariantTranslation.deleteMany({
        where: { productVariant: { restaurantId } },
      });
      await prisma.productVariant.deleteMany({ where: { restaurantId } });
      await prisma.productTranslation.deleteMany({
        where: { product: { restaurantId } },
      });
      await prisma.product.deleteMany({ where: { restaurantId } });
      await prisma.categoryTranslation.deleteMany({
        where: { category: { restaurantId } },
      });
      await prisma.category.deleteMany({ where: { restaurantId } });
      await prisma.menuTranslation.deleteMany({
        where: { menu: { restaurantId } },
      });
      await prisma.menu.deleteMany({ where: { restaurantId } });
      await prisma.restaurantLocale.deleteMany({ where: { restaurantId } });
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { membership: { restaurantId } },
      });
      await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
      await prisma.restaurantRole.deleteMany({ where: { restaurantId } });
      await prisma.branch.deleteMany({ where: { restaurantId } });
      await prisma.restaurant.delete({ where: { id: restaurantId } });
    }
    for (const userId of createdUserIds.splice(0)) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed() {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Variants Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    for (const locale of ['en', 'ar']) {
      await prisma.restaurantLocale.create({
        data: { restaurantId: restaurant.id, locale, isActive: true },
      });
    }
    const menu = await prisma.menu.create({
      data: {
        restaurantId: restaurant.id,
        nameInternal: 'Main',
        displayOrder: 0,
        status: 'ACTIVE',
        isPrimary: true,
        translations: { create: [{ locale: 'en', name: 'Main' }] },
      },
    });
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        menuId: menu.id,
        status: 'ACTIVE',
        displayOrder: 0,
        translations: { create: [{ locale: 'en', name: 'Pizza' }] },
      },
    });
    const product = await prisma.product.create({
      data: {
        publicId: `product-${randomUUID()}`,
        restaurantId: restaurant.id,
        categoryId: category.id,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '100.00',
        allowCustomerNotes: true,
        featured: false,
        displayOrder: 0,
        translations: { create: [{ locale: 'en', name: 'Margherita' }] },
      },
    });
    return { restaurant, menu, category, product };
  }

  async function login(
    restaurantId: string,
    role: 'OWNER' | 'CASHIER',
    allBranches = true,
  ) {
    const email = `variants-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash: await passwordHasherService.hashPassword(PASSWORD),
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);
    await prisma.restaurantMembership.create({
      data: {
        restaurantId,
        userId: user.id,
        role,
        roleId: (await ensureStarterRole(prisma, restaurantId, role)).id,
        status: 'ACTIVE',
        allBranches,
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith('restaurant_session='));
    if (!cookie) throw new Error('no session cookie');
    return cookie.split(';')[0];
  }

  const base = (restaurantId: string, productId: string) =>
    `/api/v1/restaurants/${restaurantId}/products/${productId}/variants`;

  const send = (
    method: 'post' | 'patch' | 'put' | 'delete',
    url: string,
    cookie: string,
    body?: Record<string, unknown>,
    origin: string | null = ORIGIN,
  ) => {
    let req = request(app.getHttpServer())[method](url).set('Cookie', cookie);
    if (origin !== null) req = req.set('Origin', origin);
    return body === undefined ? req : req.send(body);
  };

  const list = (restaurantId: string, productId: string, cookie: string) =>
    request(app.getHttpServer())
      .get(base(restaurantId, productId))
      .set('Cookie', cookie);

  const variant = (
    name: string,
    priceAdjustment: string,
    displayOrder: number,
    extra = {},
  ) => ({
    name,
    status: 'ACTIVE',
    priceAdjustment,
    displayOrder,
    ...extra,
  });

  type Row = Record<string, string | number | boolean>;
  const one = (res: request.Response): Row => (res.body as { data: Row }).data;
  const many = (res: request.Response): Row[] =>
    (res.body as { data: Row[] }).data;
  const idOf = (res: request.Response): string => one(res).id as string;

  it('creates sizes, stores the default-locale name and lists them in order with money strings', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);

    const small = await send(
      'post',
      url,
      cookie,
      variant('Small', '0', 0, { isDefault: true }),
    ).expect(201);
    const large = await send(
      'post',
      url,
      cookie,
      variant('Large', '25.5', 2),
    ).expect(201);
    await send('post', url, cookie, variant('Medium', '12', 1)).expect(201);

    expect(one(small)).toMatchObject({
      name: 'Small',
      priceAdjustment: '0.00',
      isDefault: true,
      status: 'ACTIVE',
      canDelete: true,
    });
    expect(one(large).priceAdjustment).toBe('25.50');

    const listed = await list(restaurant.id, product.id, cookie).expect(200);
    expect(many(listed).map((row) => row.name)).toEqual([
      'Small',
      'Medium',
      'Large',
    ]);
    const stored = await prisma.productVariantTranslation.findMany({
      where: { productVariant: { productId: product.id } },
      select: { locale: true },
    });
    expect(stored.every((row) => row.locale === 'en')).toBe(true);
  });

  it('keeps one default: a new default replaces the old one', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);

    const first = await send(
      'post',
      url,
      cookie,
      variant('Small', '0', 0, { isDefault: true }),
    ).expect(201);
    const second = await send(
      'post',
      url,
      cookie,
      variant('Large', '20', 1, { isDefault: true }),
    ).expect(201);

    let rows = await prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([
      idOf(second),
    ]);

    await send('patch', `${url}/${idOf(first)}`, cookie, {
      isDefault: true,
    }).expect(200);
    rows = await prisma.productVariant.findMany({
      where: { productId: product.id },
    });
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([
      idOf(first),
    ]);
  });

  it('only an ACTIVE variant can be the default, and deactivating the default clears it', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);

    const refused = await send(
      'post',
      url,
      cookie,
      variant('Hidden', '0', 0, { status: 'INACTIVE', isDefault: true }),
    ).expect(400);
    expect(refused.body).toMatchObject({
      error: { code: 'VARIANT_DEFAULT_MUST_BE_ACTIVE' },
    });
    expect(
      await prisma.productVariant.count({ where: { productId: product.id } }),
    ).toBe(0);

    const small = await send(
      'post',
      url,
      cookie,
      variant('Small', '0', 0, { isDefault: true }),
    ).expect(201);
    const deactivated = await send('patch', `${url}/${idOf(small)}`, cookie, {
      status: 'INACTIVE',
    }).expect(200);
    expect(one(deactivated)).toMatchObject({
      status: 'INACTIVE',
      isDefault: false,
    });

    const again = await send('patch', `${url}/${idOf(small)}`, cookie, {
      isDefault: true,
    }).expect(400);
    expect(again.body).toMatchObject({
      error: { code: 'VARIANT_DEFAULT_MUST_BE_ACTIVE' },
    });
  });

  it('updates name, price, status and order, and rejects a negative adjustment', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);
    const created = await send(
      'post',
      url,
      cookie,
      variant('Small', '0', 0),
    ).expect(201);
    const id = idOf(created);

    const updated = await send('patch', `${url}/${id}`, cookie, {
      name: 'Personal',
      priceAdjustment: '7.25',
      displayOrder: 3,
    }).expect(200);
    expect(one(updated)).toMatchObject({
      name: 'Personal',
      priceAdjustment: '7.25',
      displayOrder: 3,
    });

    await send('patch', `${url}/${id}`, cookie, {
      priceAdjustment: '-1.00',
    }).expect(400);
    await send('post', url, cookie, variant('Bad', '-5', 1)).expect(400);
    await send('post', url, cookie, variant('', '5', 1)).expect(400);
    await send('post', url, cookie, {
      name: 'X',
      status: 'WEIRD',
      priceAdjustment: '1',
      displayOrder: 0,
    }).expect(400);

    const stored = await prisma.productVariant.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.priceAdjustment.toFixed(2)).toBe('7.25');
  });

  it('reorders the full set and refuses a stale or foreign list', async () => {
    const own = await seed();
    const foreign = await seed();
    const cookie = await login(own.restaurant.id, 'OWNER');
    const url = base(own.restaurant.id, own.product.id);
    const ids: string[] = [];
    for (const [index, name] of ['A', 'B', 'C'].entries()) {
      ids.push(
        idOf(
          await send(
            'post',
            url,
            cookie,
            variant(name, String(index), index),
          ).expect(201),
        ),
      );
    }
    const foreignVariant = await prisma.productVariant.create({
      data: {
        restaurantId: foreign.restaurant.id,
        productId: foreign.product.id,
        status: 'ACTIVE',
        priceAdjustment: '0',
        displayOrder: 0,
        isDefault: false,
      },
    });

    await send('put', `${url}/order`, cookie, {
      variantIds: [ids[2], ids[0], ids[1]],
    }).expect(200);
    const stored = await prisma.productVariant.findMany({
      where: { productId: own.product.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(stored.map((row) => row.id)).toEqual([ids[2], ids[0], ids[1]]);

    const stale = await send('put', `${url}/order`, cookie, {
      variantIds: [ids[0], ids[1]],
    }).expect(409);
    expect(stale.body).toMatchObject({ error: { code: 'ORDER_MISMATCH' } });
    await send('put', `${url}/order`, cookie, {
      variantIds: [ids[0], ids[1], foreignVariant.id],
    }).expect(409);
    await send('put', `${url}/order`, cookie, {
      variantIds: ['not-a-uuid'],
    }).expect(400);
  });

  it('deletes an unused variant but refuses (409) one an order has used', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);
    const unused = await send(
      'post',
      url,
      cookie,
      variant('Unused', '0', 0),
    ).expect(201);
    const used = await send(
      'post',
      url,
      cookie,
      variant('Used', '10', 1),
    ).expect(201);

    // an order that already used the "Used" size
    const branch = await prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: restaurant.id,
        name: 'B',
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
        publicCode: `qr-${randomUUID()}`,
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        type: 'TABLE',
        status: 'ACTIVE',
      },
    });
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        qrCodeId: qr.id,
        clientRequestId: randomUUID(),
        status: 'PENDING',
        type: 'DINE_IN',
        currencyCode: 'EGP',
        totalAmount: '110.00',
        subtotalAmount: '110.00',
        deliveryFeeAmount: '0.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: 'Margherita',
        unitPrice: '110.00',
        quantity: 1,
        lineTotal: '110.00',
        variantId: idOf(used),
        variantNameSnapshot: 'Used',
        variantAdjustmentSnapshot: '10.00',
      },
    });

    const listed = await list(restaurant.id, product.id, cookie).expect(200);
    const byName: Record<string, unknown> = {};
    for (const row of many(listed)) byName[String(row.name)] = row.canDelete;
    expect(byName).toEqual({ Unused: true, Used: false });

    await send('delete', `${url}/${idOf(unused)}`, cookie).expect(204);
    const refused = await send('delete', `${url}/${idOf(used)}`, cookie).expect(
      409,
    );
    expect(refused.body).toMatchObject({
      error: { code: 'VARIANT_HAS_HISTORICAL_REFERENCES' },
    });
    expect(
      await prisma.productVariant.count({ where: { productId: product.id } }),
    ).toBe(1);

    // the safe alternative is to deactivate it
    await send('patch', `${url}/${idOf(used)}`, cookie, {
      status: 'INACTIVE',
    }).expect(200);
  });

  it('manages translations: active locales only, default one cannot be deleted', async () => {
    const { restaurant, product } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const url = base(restaurant.id, product.id);
    const created = await send(
      'post',
      url,
      cookie,
      variant('Small', '0', 0),
    ).expect(201);
    const id = idOf(created);

    await send('put', `${url}/${id}/translations/ar`, cookie, {
      name: 'صغير',
    }).expect(200);
    const listed = await request(app.getHttpServer())
      .get(`${url}/${id}/translations`)
      .set('Cookie', cookie)
      .expect(200);
    expect(many(listed)).toEqual([
      { locale: 'ar', name: 'صغير' },
      { locale: 'en', name: 'Small' },
    ]);

    const inactiveLocale = await send(
      'put',
      `${url}/${id}/translations/fr`,
      cookie,
      { name: 'Petit' },
    );
    expect([409, 400, 404]).toContain(inactiveLocale.status);

    const noDefaultDelete = await send(
      'delete',
      `${url}/${id}/translations/en`,
      cookie,
    ).expect(409);
    expect(noDefaultDelete.body).toMatchObject({
      error: { code: 'DEFAULT_TRANSLATION_REQUIRED' },
    });
    await send('delete', `${url}/${id}/translations/ar`, cookie).expect(204);
  });

  it('is Tenant scoped: a foreign Restaurant or Product never leaks', async () => {
    const own = await seed();
    const foreign = await seed();
    const cookie = await login(own.restaurant.id, 'OWNER');
    const foreignVariant = await prisma.productVariant.create({
      data: {
        restaurantId: foreign.restaurant.id,
        productId: foreign.product.id,
        status: 'ACTIVE',
        priceAdjustment: '0',
        displayOrder: 0,
        isDefault: false,
        translations: { create: [{ locale: 'en', name: 'Secret' }] },
      },
    });

    await list(own.restaurant.id, foreign.product.id, cookie).expect(404);
    await send(
      'post',
      base(own.restaurant.id, foreign.product.id),
      cookie,
      variant('X', '0', 0),
    ).expect(404);
    // own Restaurant + own Product + a foreign variant id
    await send(
      'patch',
      `${base(own.restaurant.id, own.product.id)}/${foreignVariant.id}`,
      cookie,
      {
        name: 'Hacked',
      },
    ).expect(404);
    await send(
      'delete',
      `${base(own.restaurant.id, own.product.id)}/${foreignVariant.id}`,
      cookie,
    ).expect(404);
    // another Restaurant in the URL: not a member
    await list(foreign.restaurant.id, foreign.product.id, cookie).expect(
      (res) => {
        expect([403, 404]).toContain(res.status);
      },
    );

    const untouched = await prisma.productVariantTranslation.findFirstOrThrow({
      where: { productVariantId: foreignVariant.id },
    });
    expect(untouched.name).toBe('Secret');
  });

  it('needs menu.manage with Restaurant-wide scope and a same-origin request; reading needs menu.view', async () => {
    const { restaurant, product } = await seed();
    const url = base(restaurant.id, product.id);
    const body = variant('Small', '0', 0);

    const cashier = await login(restaurant.id, 'CASHIER');
    await send('post', url, cashier, body).expect(403);

    const branchScoped = await login(restaurant.id, 'OWNER', false);
    await send('post', url, branchScoped, body).expect(403);

    const owner = await login(restaurant.id, 'OWNER');
    await send('post', url, owner, body, 'https://evil.example').expect(403);
    await send('post', url, owner, body, null).expect(403);

    expect(
      await prisma.productVariant.count({ where: { productId: product.id } }),
    ).toBe(0);

    await request(app.getHttpServer()).get(url).expect(401);
    await send('post', url, owner, body).expect(201);
  });
});
