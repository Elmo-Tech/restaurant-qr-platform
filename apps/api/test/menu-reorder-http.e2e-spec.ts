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
 * Menu management drag-and-drop ordering end to end:
 * `PUT /restaurants/{id}/categories/order` and `PUT /restaurants/{id}/products/order`
 * (menu.manage, Restaurant-wide scope, CSRF). The order is the full list; a stale
 * or foreign list is refused with nothing written; the Guest Menu follows it.
 */
describe('Menu ordering (e2e)', () => {
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
      await prisma.productTranslation.deleteMany({ where: { product: { restaurantId } } });
      await prisma.product.deleteMany({ where: { restaurantId } });
      await prisma.categoryTranslation.deleteMany({ where: { category: { restaurantId } } });
      await prisma.category.deleteMany({ where: { restaurantId } });
      await prisma.menuTranslation.deleteMany({ where: { menu: { restaurantId } } });
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
        name: 'Order Test',
        status: 'ACTIVE',
        defaultLocale: 'en',
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    await prisma.restaurantLocale.create({
      data: { restaurantId: restaurant.id, locale: 'en', isActive: true },
    });
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
    const categories = [];
    for (const [index, name] of ['One', 'Two', 'Three'].entries()) {
      categories.push(
        await prisma.category.create({
          data: {
            restaurantId: restaurant.id,
            menuId: menu.id,
            status: 'ACTIVE',
            displayOrder: index,
            translations: { create: [{ locale: 'en', name }] },
          },
        }),
      );
    }
    const products = [];
    for (const [index, name] of ['Alpha', 'Beta', 'Gamma'].entries()) {
      products.push(
        await prisma.product.create({
          data: {
            publicId: `product-${randomUUID()}`,
            restaurantId: restaurant.id,
            categoryId: categories[0].id,
            status: 'ACTIVE',
            availability: 'AVAILABLE',
            basePrice: '10.00',
            allowCustomerNotes: true,
            featured: false,
            displayOrder: index,
            translations: { create: [{ locale: 'en', name }] },
          },
        }),
      );
    }
    return { restaurant, menu, categories, products };
  }

  async function login(restaurantId: string, role: 'OWNER' | 'CASHIER', allBranches = true) {
    const email = `menu-order-${randomUUID()}@example.test`;
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

  const putOrder = (
    restaurantId: string,
    resource: 'categories' | 'products',
    cookie: string,
    body: Record<string, unknown>,
    origin: string | null = ORIGIN,
  ) => {
    let req = request(app.getHttpServer())
      .put(`/api/v1/restaurants/${restaurantId}/${resource}/order`)
      .set('Cookie', cookie);
    if (origin !== null) req = req.set('Origin', origin);
    return req.send(body);
  };

  it('reorders Categories and persists displayOrder as the position', async () => {
    const { restaurant, menu, categories } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const [one, two, three] = categories;

    const response = await putOrder(restaurant.id, 'categories', cookie, {
      menuId: menu.id,
      categoryIds: [three.id, one.id, two.id],
    }).expect(200);

    expect(response.body).toEqual({
      data: { categoryIds: [three.id, one.id, two.id] },
    });
    const stored = await prisma.category.findMany({
      where: { menuId: menu.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, displayOrder: true },
    });
    expect(stored).toEqual([
      { id: three.id, displayOrder: 0 },
      { id: one.id, displayOrder: 1 },
      { id: two.id, displayOrder: 2 },
    ]);

    // the Staff list API returns them in the new order
    const list = await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${restaurant.id}/categories?menuId=${menu.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect((list.body.data as { id: string }[]).map((row) => row.id)).toEqual([
      three.id,
      one.id,
      two.id,
    ]);
  });

  it('reorders Products within a Category', async () => {
    const { restaurant, categories, products } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');
    const [alpha, beta, gamma] = products;

    await putOrder(restaurant.id, 'products', cookie, {
      categoryId: categories[0].id,
      productIds: [gamma.id, alpha.id, beta.id],
    }).expect(200);

    const stored = await prisma.product.findMany({
      where: { categoryId: categories[0].id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(stored.map((row) => row.id)).toEqual([gamma.id, alpha.id, beta.id]);
  });

  it('refuses a list that is not exactly the current set, writing nothing', async () => {
    const { restaurant, menu, categories } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');

    const response = await putOrder(restaurant.id, 'categories', cookie, {
      menuId: menu.id,
      categoryIds: [categories[2].id, categories[0].id],
    }).expect(409);

    expect(response.body).toMatchObject({ error: { code: 'ORDER_MISMATCH' } });
    const stored = await prisma.category.findMany({
      where: { menuId: menu.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(stored.map((row) => row.id)).toEqual(categories.map((row) => row.id));
  });

  it('never reorders another Restaurant: a foreign menu is 404, a foreign id is a mismatch', async () => {
    const own = await seed();
    const foreign = await seed();
    const cookie = await login(own.restaurant.id, 'OWNER');

    await putOrder(own.restaurant.id, 'categories', cookie, {
      menuId: foreign.menu.id,
      categoryIds: foreign.categories.map((row) => row.id),
    }).expect(404);

    await putOrder(own.restaurant.id, 'categories', cookie, {
      menuId: own.menu.id,
      categoryIds: [own.categories[0].id, own.categories[1].id, foreign.categories[0].id],
    }).expect(409);

    const foreignStored = await prisma.category.findMany({
      where: { menuId: foreign.menu.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(foreignStored.map((row) => row.id)).toEqual(foreign.categories.map((row) => row.id));
  });

  it('needs menu.manage with Restaurant-wide scope and a same-origin request', async () => {
    const { restaurant, menu, categories } = await seed();
    const body = { menuId: menu.id, categoryIds: categories.map((row) => row.id).reverse() };

    const cashier = await login(restaurant.id, 'CASHIER');
    await putOrder(restaurant.id, 'categories', cashier, body).expect(403);

    const branchScoped = await login(restaurant.id, 'OWNER', false);
    await putOrder(restaurant.id, 'categories', branchScoped, body).expect(403);

    const owner = await login(restaurant.id, 'OWNER');
    await putOrder(restaurant.id, 'categories', owner, body, 'https://evil.example').expect(403);

    const stored = await prisma.category.findMany({
      where: { menuId: menu.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true },
    });
    expect(stored.map((row) => row.id)).toEqual(categories.map((row) => row.id));
  });

  it('rejects malformed bodies', async () => {
    const { restaurant, menu } = await seed();
    const cookie = await login(restaurant.id, 'OWNER');

    await putOrder(restaurant.id, 'categories', cookie, {
      menuId: menu.id,
      categoryIds: ['not-a-uuid'],
    }).expect(400);
    await putOrder(restaurant.id, 'categories', cookie, {
      menuId: menu.id,
      categoryIds: [],
    }).expect(400);
  });
});
