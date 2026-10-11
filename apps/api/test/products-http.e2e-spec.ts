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
 * Day 1 Menu Vertical Slice, Batch D: proves Product List, Create, generic
 * Update, and the focused Availability Update end-to-end through the real
 * `GET`/`POST /api/v1/restaurants/{restaurantId}/products`,
 * `PATCH .../products/{productId}`, and
 * `PATCH .../products/{productId}/availability` endpoints -- HTTP Cookie ->
 * guard chain -> ProductsService -> PrismaService -> PostgreSQL. GET:
 * AuthGuard -> RestaurantAccessGuard -> PermissionGuard. Mutations:
 * AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard ->
 * AllBranchesRequiredGuard (Restaurant-structural mutation, mirrors
 * Menu/Category).
 *
 * Creates temporary Restaurant/User/Membership/AuthSession/Menu/Category/
 * Product rows and removes them in afterEach, so the database returns to
 * its empty state regardless of test outcome.
 */
describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const APPROVED_ORIGIN = 'http://localhost:3000';
  const UNAUTHENTICATED_BODY = {
    error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  };
  const PERMISSION_DENIED_BODY = {
    error: {
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission to perform this action.',
    },
  };
  const CSRF_VALIDATION_FAILED_BODY = {
    error: {
      code: 'CSRF_VALIDATION_FAILED',
      message: 'Cross-origin request rejected.',
    },
  };
  const CATEGORY_NOT_FOUND_BODY = {
    error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
  };
  const PRODUCT_NOT_FOUND_BODY = {
    error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
  };

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

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const uniqueEmail = `products-${randomUUID()}@example.test`;
    const passwordHash = await passwordHasherService.hashPassword(PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        emailNormalized: uniqueEmail.toLowerCase(),
        passwordHash,
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    return { id: user.id, email: uniqueEmail };
  }

  async function createRestaurant(defaultLocale = 'ar') {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Cairo Bites',
        status: 'ACTIVE',
        defaultLocale,
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    return restaurant;
  }

  async function createBranch(restaurantId: string) {
    return prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId,
        name: 'Maadi',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
      },
    });
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
    allBranches?: boolean;
    branchIds?: string[];
  }) {
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role ?? 'OWNER',
        roleId: (await ensureStarterRole(prisma, params.restaurantId, params.role ?? 'OWNER')).id,
        status: 'ACTIVE',
        allBranches: params.allBranches ?? true,
      },
    });
    for (const branchId of params.branchIds ?? []) {
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId },
      });
    }
    return membership;
  }

  async function createMenuFixture(restaurantId: string, locale = 'ar') {
    const menu = await prisma.menu.create({
      data: {
        restaurantId,
        nameInternal: 'Main Menu',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      },
    });
    await prisma.menuTranslation.create({
      data: { menuId: menu.id, locale, name: 'القائمة الرئيسية' },
    });
    return menu;
  }

  async function createCategoryFixture(
    restaurantId: string,
    menuId: string,
    locale = 'ar',
  ) {
    const category = await prisma.category.create({
      data: {
        restaurantId,
        menuId,
        status: 'ACTIVE',
        displayOrder: 0,
      },
    });
    await prisma.categoryTranslation.create({
      data: { categoryId: category.id, locale, name: 'المقبلات' },
    });
    return category;
  }

  async function loginAndGetCookie(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = setCookie.find((cookie) =>
      cookie.startsWith('restaurant_session='),
    );
    if (!sessionCookie) {
      throw new Error('expected a restaurant_session Set-Cookie header');
    }
    return sessionCookie.split(';')[0];
  }

  function validBody(categoryId: string) {
    return {
      categoryId,
      name: 'برجر كلاسيك',
      description: 'برجر لحم بقري',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      basePrice: '250.00',
      displayOrder: 0,
      allowCustomerNotes: true,
      featured: false,
    };
  }

  function postCreateProduct(params: {
    restaurantId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/products`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  function getListProducts(params: {
    restaurantId: string;
    cookiePair?: string;
    categoryId?: string;
  }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/products`,
    );
    if (params.categoryId) req = req.query({ categoryId: params.categoryId });
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  function patchUpdateProduct(params: {
    restaurantId: string;
    productId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/products/${params.productId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  function patchUpdateAvailability(params: {
    restaurantId: string;
    productId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/products/${params.productId}/availability`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  async function countProducts(restaurantId: string): Promise<number> {
    return prisma.product.count({ where: { restaurantId } });
  }

  /** Full fixture chain: Restaurant -> Membership(OWNER) -> Menu -> Category, ready for Product creation. */
  async function setupAuthorizedContext(defaultLocale = 'ar') {
    const { id: userId, email } = await createTestUser();
    const restaurant = await createRestaurant(defaultLocale);
    const menu = await createMenuFixture(restaurant.id, defaultLocale);
    const category = await createCategoryFixture(
      restaurant.id,
      menu.id,
      defaultLocale,
    );
    await createMembership({ restaurantId: restaurant.id, userId });
    const cookiePair = await loginAndGetCookie(email);
    return { userId, email, restaurant, menu, category, cookiePair };
  }

  describe('AUTHORIZATION', () => {
    it('unauthenticated GET -> 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getListProducts({
        restaurantId: restaurant.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unauthenticated POST/PATCH/PATCH-availability -> 401, no mutation', async () => {
      const { restaurant, category } = await setupAuthorizedContext();

      const createResponse = await postCreateProduct({
        restaurantId: restaurant.id,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(401);
      expect(createResponse.body).toEqual(UNAUTHENTICATED_BODY);

      const updateResponse = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId: randomUUID(),
        origin: APPROVED_ORIGIN,
        body: { featured: true },
      }).expect(401);
      expect(updateResponse.body).toEqual(UNAUTHENTICATED_BODY);

      const availabilityResponse = await patchUpdateAvailability({
        restaurantId: restaurant.id,
        productId: randomUUID(),
        origin: APPROVED_ORIGIN,
        body: { availability: 'SOLD_OUT' },
      }).expect(401);
      expect(availabilityResponse.body).toEqual(UNAUTHENTICATED_BODY);

      expect(await countProducts(restaurant.id)).toBe(0);
    });

    it.each(['CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s has menu.view (GET succeeds) but not menu.manage (POST -> 403)',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        const category = await createCategoryFixture(restaurant.id, menu.id);
        await createMembership({ restaurantId: restaurant.id, userId, role });
        const cookiePair = await loginAndGetCookie(email);

        await getListProducts({
          restaurantId: restaurant.id,
          cookiePair,
        }).expect(200);
        const response = await postCreateProduct({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(category.id),
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(await countProducts(restaurant.id)).toBe(0);
      },
    );

    it('valid same-origin CSRF is allowed on Create', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
    });

    it('missing Origin -> 403 CSRF_VALIDATION_FAILED on Create/Update/Availability', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const createResponse = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        body: validBody(category.id),
      }).expect(403);
      expect(createResponse.body).toEqual(CSRF_VALIDATION_FAILED_BODY);

      const updateResponse = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        body: { featured: true },
      }).expect(403);
      expect(updateResponse.body).toEqual(CSRF_VALIDATION_FAILED_BODY);

      const availabilityResponse = await patchUpdateAvailability({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        body: { availability: 'SOLD_OUT' },
      }).expect(403);
      expect(availabilityResponse.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
    });
  });

  describe('RESTAURANT-WIDE MUTATION AUTHORITY (AllBranchesRequiredGuard)', () => {
    it('MANAGER + allBranches=true + menu.manage -> Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      const category = await createCategoryFixture(restaurant.id, menu.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
    });

    it('MANAGER + allBranches=false with a legitimate same-Restaurant Branch assignment -> 403 PERMISSION_DENIED, no Product created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      const category = await createCategoryFixture(restaurant.id, menu.id);
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(await countProducts(restaurant.id)).toBe(0);
    });

    it('the same Branch-scoped MANAGER can still call List', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getListProducts({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('TENANT', () => {
    it('creates a Product when categoryId belongs to the authorized Restaurant', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);

      expect(await countProducts(restaurant.id)).toBe(1);
    });

    it('unknown categoryId -> 404 CATEGORY_NOT_FOUND, no Product created', async () => {
      const { restaurant, cookiePair } = await setupAuthorizedContext();

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(randomUUID()),
      }).expect(404);

      expect(response.body).toEqual(CATEGORY_NOT_FOUND_BODY);
      expect(await countProducts(restaurant.id)).toBe(0);
    });

    it('foreign-Restaurant categoryId -> the identical 404 CATEGORY_NOT_FOUND', async () => {
      const { restaurant, cookiePair } = await setupAuthorizedContext();
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      const foreignCategory = await createCategoryFixture(
        foreignRestaurant.id,
        foreignMenu.id,
      );

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(foreignCategory.id),
      }).expect(404);

      expect(response.body).toEqual(CATEGORY_NOT_FOUND_BODY);
      expect(await countProducts(restaurant.id)).toBe(0);
      expect(await countProducts(foreignRestaurant.id)).toBe(0);
    });

    it("Update cannot target another Restaurant's Product -> 404 PRODUCT_NOT_FOUND", async () => {
      const { restaurant, cookiePair } = await setupAuthorizedContext();
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      const foreignCategory = await createCategoryFixture(
        foreignRestaurant.id,
        foreignMenu.id,
      );
      const { id: foreignUserId, email: foreignEmail } = await createTestUser();
      await createMembership({
        restaurantId: foreignRestaurant.id,
        userId: foreignUserId,
      });
      const foreignCookie = await loginAndGetCookie(foreignEmail);
      const foreignProduct = await postCreateProduct({
        restaurantId: foreignRestaurant.id,
        cookiePair: foreignCookie,
        origin: APPROVED_ORIGIN,
        body: validBody(foreignCategory.id),
      }).expect(201);
      const foreignProductId = (foreignProduct.body as { data: { id: string } })
        .data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId: foreignProductId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { featured: true },
      }).expect(404);

      expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    });

    it('Update cannot move a Product into a foreign-Restaurant Category', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      const foreignCategory = await createCategoryFixture(
        foreignRestaurant.id,
        foreignMenu.id,
      );

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { categoryId: foreignCategory.id },
      }).expect(404);

      expect(response.body).toEqual(CATEGORY_NOT_FOUND_BODY);
      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(persisted.categoryId).toBe(category.id);
    });

    it("List never returns another Restaurant's Products", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      const menuB = await createMenuFixture(restaurantB.id);
      const categoryB = await createCategoryFixture(restaurantB.id, menuB.id);
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateProduct({
        restaurantId: restaurantB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(categoryB.id),
      }).expect(201);

      const response = await getListProducts({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });

    it("the categoryId List filter remains Tenant-scoped -- a foreign Restaurant's real categoryId yields an empty result", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      const menuB = await createMenuFixture(restaurantB.id);
      const categoryB = await createCategoryFixture(restaurantB.id, menuB.id);
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePairB = await loginAndGetCookie(email);
      await postCreateProduct({
        restaurantId: restaurantB.id,
        cookiePair: cookiePairB,
        origin: APPROVED_ORIGIN,
        body: validBody(categoryB.id),
      }).expect(201);

      const response = await getListProducts({
        restaurantId: restaurantA.id,
        cookiePair: cookiePairB,
        categoryId: categoryB.id,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('DEFAULT LOCALE', () => {
    it('persists the translation under Restaurant.defaultLocale, ignoring a client-supplied locale', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext('ar');

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), locale: 'en' },
      }).expect(201);

      const data = (
        response.body as {
          data: { id: string; translation: { locale: string; name: string } };
        }
      ).data;
      expect(data.translation.locale).toBe('ar');
      const persisted = await prisma.productTranslation.findFirstOrThrow({
        where: { productId: data.id },
      });
      expect(persisted.locale).toBe('ar');
    });

    it('Product and its default-locale translation are created atomically -- exactly one of each row', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);

      const product = await prisma.product.findFirstOrThrow({
        where: { restaurantId: restaurant.id },
      });
      const translationCount = await prisma.productTranslation.count({
        where: { productId: product.id },
      });
      expect(translationCount).toBe(1);
    });

    it('Update changes the default-locale translation correctly', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'برجر مزدوج', description: 'وصف جديد' },
      }).expect(200);

      const translation = (
        response.body as {
          data: { translation: { name: string; description: string | null } };
        }
      ).data.translation;
      expect(translation.name).toBe('برجر مزدوج');
      expect(translation.description).toBe('وصف جديد');
      const persisted = await prisma.productTranslation.findFirstOrThrow({
        where: { productId },
      });
      expect(persisted.name).toBe('برجر مزدوج');
    });
  });

  describe('MONEY', () => {
    it.each(['0', '0.00', '10', '10.5', '10.50', '250.00'])(
      'accepts valid decimal string %s',
      async (basePrice) => {
        const { restaurant, category, cookiePair } =
          await setupAuthorizedContext();

        await postCreateProduct({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { ...validBody(category.id), basePrice },
        }).expect(201);
      },
    );

    it('response basePrice is always exactly 2 fractional digits', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), basePrice: '10.5' },
      }).expect(201);

      expect(
        (response.body as { data: { basePrice: string } }).data.basePrice,
      ).toBe('10.50');
    });

    it.each(['-1.00', '10.505', '1e5', '1E5', 'abc', '', '1000000000000.00'])(
      'rejects invalid decimal string %s -> 400 VALIDATION_ERROR',
      async (basePrice) => {
        const { restaurant, category, cookiePair } =
          await setupAuthorizedContext();

        const response = await postCreateProduct({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { ...validBody(category.id), basePrice },
        }).expect(400);

        expect((response.body as { error: { code: string } }).error.code).toBe(
          'VALIDATION_ERROR',
        );
        expect(await countProducts(restaurant.id)).toBe(0);
      },
    );

    it('rejects a JavaScript number body for basePrice, never treating it as authoritative', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), basePrice: 250 },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  describe('PRODUCT', () => {
    it('status and availability remain independent -- INACTIVE+AVAILABLE and ACTIVE+SOLD_OUT are both valid', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      const first = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          ...validBody(category.id),
          status: 'INACTIVE',
          availability: 'AVAILABLE',
        },
      }).expect(201);
      const firstData = (
        first.body as { data: { status: string; availability: string } }
      ).data;
      expect(firstData.status).toBe('INACTIVE');
      expect(firstData.availability).toBe('AVAILABLE');

      const second = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          ...validBody(category.id),
          status: 'ACTIVE',
          availability: 'SOLD_OUT',
        },
      }).expect(201);
      const secondData = (
        second.body as { data: { status: string; availability: string } }
      ).data;
      expect(secondData.status).toBe('ACTIVE');
      expect(secondData.availability).toBe('SOLD_OUT');
    });

    it('primaryImageAssetPath cannot be client-controlled -- always null on Create', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          ...validBody(category.id),
          primaryImageAssetPath: '/attacker/controlled.png',
        },
      }).expect(201);

      expect(
        (response.body as { data: { primaryImageAssetPath: string | null } })
          .data.primaryImageAssetPath,
      ).toBeNull();
    });

    it('a client-supplied publicId is ignored -- the server-generated value is authoritative', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const attackerPublicId = 'product-attacker-controlled-value';

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), publicId: attackerPublicId },
      }).expect(201);

      const productId = (response.body as { data: { id: string } }).data.id;
      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(persisted.publicId).not.toBe(attackerPublicId);
      expect(persisted.publicId).toMatch(/^product-[0-9a-f-]{36}$/i);
    });

    it('List orders deterministically by displayOrder asc, then id asc', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), name: 'Second', displayOrder: 2 },
      }).expect(201);
      await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), name: 'First', displayOrder: 1 },
      }).expect(201);

      const response = await getListProducts({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const names = (
        response.body as { data: { translation: { name: string } }[] }
      ).data.map((product) => product.translation.name);
      expect(names).toEqual(['First', 'Second']);
    });

    it('List returns an empty array when the Restaurant has no Products', async () => {
      const { restaurant, cookiePair } = await setupAuthorizedContext();

      const response = await getListProducts({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('UPDATE', () => {
    it('a partial update changes only the supplied fields', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { featured: true },
      }).expect(200);

      const data = (
        response.body as {
          data: {
            featured: boolean;
            basePrice: string;
            displayOrder: number;
            status: string;
          };
        }
      ).data;
      expect(data.featured).toBe(true);
      expect(data.basePrice).toBe('250.00');
      expect(data.displayOrder).toBe(0);
      expect(data.status).toBe('ACTIVE');
    });

    it('a Category move within the same Restaurant succeeds', async () => {
      const { restaurant, menu, category, cookiePair } =
        await setupAuthorizedContext();
      const otherCategory = await createCategoryFixture(restaurant.id, menu.id);
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { categoryId: otherCategory.id },
      }).expect(200);

      expect(
        (response.body as { data: { categoryId: string } }).data.categoryId,
      ).toBe(otherCategory.id);
    });

    it.each([
      ['malformed', 'not-a-uuid'],
      ['unknown', randomUUID()],
    ] as const)(
      '%s productId -> the identical 404 PRODUCT_NOT_FOUND',
      async (_label, productIdCase) => {
        const { restaurant, cookiePair } = await setupAuthorizedContext();

        const response = await patchUpdateProduct({
          restaurantId: restaurant.id,
          productId: productIdCase,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { featured: true },
        }).expect(404);

        expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
      },
    );

    it('availability cannot be modified through the generic PATCH', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { availability: 'SOLD_OUT' },
      }).expect(200);

      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(persisted.availability).toBe('AVAILABLE');
    });

    it('an empty PATCH body returns the unchanged safe representation', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      expect((response.body as { data: { id: string } }).data.id).toBe(
        productId,
      );
    });

    it.each([
      'categoryId',
      'name',
      'status',
      'basePrice',
      'displayOrder',
      'allowCustomerNotes',
      'featured',
    ] as const)(
      'explicit null for %s -> 400 VALIDATION_ERROR, Product left unchanged',
      async (field) => {
        const { restaurant, category, cookiePair } =
          await setupAuthorizedContext();
        const created = await postCreateProduct({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(category.id),
        }).expect(201);
        const productId = (created.body as { data: { id: string } }).data.id;
        const beforeUpdate = await prisma.product.findUniqueOrThrow({
          where: { id: productId },
        });

        const response = await patchUpdateProduct({
          restaurantId: restaurant.id,
          productId,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { [field]: null },
        }).expect(400);

        expect((response.body as { error: { code: string } }).error.code).toBe(
          'VALIDATION_ERROR',
        );
        const afterUpdate = await prisma.product.findUniqueOrThrow({
          where: { id: productId },
        });
        expect(afterUpdate.categoryId).toBe(beforeUpdate.categoryId);
        expect(afterUpdate.status).toBe(beforeUpdate.status);
        expect(afterUpdate.basePrice.toFixed(2)).toBe(
          beforeUpdate.basePrice.toFixed(2),
        );
        expect(afterUpdate.displayOrder).toBe(beforeUpdate.displayOrder);
        expect(afterUpdate.allowCustomerNotes).toBe(
          beforeUpdate.allowCustomerNotes,
        );
        expect(afterUpdate.featured).toBe(beforeUpdate.featured);
      },
    );

    it('{ description: null } -> 200, clears ProductTranslation.description', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateProduct({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { description: null },
      }).expect(200);

      expect(
        (
          response.body as {
            data: { translation: { description: string | null } };
          }
        ).data.translation.description,
      ).toBeNull();
      const persisted = await prisma.productTranslation.findFirstOrThrow({
        where: { productId },
      });
      expect(persisted.description).toBeNull();
    });
  });

  describe('AVAILABILITY', () => {
    it('AVAILABLE -> SOLD_OUT', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateAvailability({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { availability: 'SOLD_OUT' },
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: productId, availability: 'SOLD_OUT' },
      });
    });

    it('SOLD_OUT -> AVAILABLE', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(category.id), availability: 'SOLD_OUT' },
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateAvailability({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { availability: 'AVAILABLE' },
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: productId, availability: 'AVAILABLE' },
      });
    });

    it('changes only availability -- status/basePrice/category/translation/featured/allowCustomerNotes untouched', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();
      const created = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);
      const productId = (created.body as { data: { id: string } }).data.id;

      await patchUpdateAvailability({
        restaurantId: restaurant.id,
        productId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { availability: 'SOLD_OUT' },
      }).expect(200);

      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(persisted.status).toBe('ACTIVE');
      expect(persisted.basePrice.toFixed(2)).toBe('250.00');
      expect(persisted.categoryId).toBe(category.id);
      expect(persisted.featured).toBe(false);
      expect(persisted.allowCustomerNotes).toBe(true);
    });

    it.each([
      ['malformed', 'not-a-uuid'],
      ['unknown', randomUUID()],
    ] as const)(
      '%s productId -> the identical 404 PRODUCT_NOT_FOUND',
      async (_label, productIdCase) => {
        const { restaurant, cookiePair } = await setupAuthorizedContext();

        const response = await patchUpdateAvailability({
          restaurantId: restaurant.id,
          productId: productIdCase,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { availability: 'SOLD_OUT' },
        }).expect(404);

        expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
      },
    );
  });

  describe('RESPONSE SHAPE', () => {
    it('never exposes restaurantId, createdAt, updatedAt, or a raw ProductTranslation id/productId', async () => {
      const { restaurant, category, cookiePair } =
        await setupAuthorizedContext();

      const response = await postCreateProduct({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(category.id),
      }).expect(201);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
      const data = (response.body as { data: Record<string, unknown> }).data;
      // Product Discounts V1: a Product without a discount reports `discount: null`.
      expect(data.discount).toBeNull();
      expect(Object.keys(data).sort()).toEqual(
        [
          'allowCustomerNotes',
          'availability',
          'basePrice',
          'categoryId',
          'discount',
          'displayOrder',
          'featured',
          'id',
          'primaryImageAssetPath',
          'publicId',
          'status',
          'translation',
        ].sort(),
      );
    });
  });
});
