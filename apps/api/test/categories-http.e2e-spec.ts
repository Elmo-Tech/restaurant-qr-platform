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
 * Day 1 Menu Vertical Slice, Batch C: proves Category List and Create
 * end-to-end through the real
 * `GET`/`POST /api/v1/restaurants/{restaurantId}/categories` endpoints --
 * HTTP Cookie -> guard chain -> CategoriesService -> PrismaService ->
 * PostgreSQL. GET: AuthGuard -> RestaurantAccessGuard -> PermissionGuard.
 * POST: AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard
 * -> AllBranchesRequiredGuard (Restaurant-structural mutation, corrected).
 *
 * Creates temporary Restaurant/User/Membership/AuthSession/Menu/Category
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('Categories (e2e)', () => {
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
  const MENU_NOT_FOUND_BODY = {
    error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
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
    const uniqueEmail = `categories-${randomUUID()}@example.test`;
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

  function validBody(menuId: string) {
    return {
      menuId,
      name: 'المقبلات',
      description: 'وصف الفئة',
      status: 'ACTIVE',
      displayOrder: 0,
    };
  }

  function postCreateCategory(params: {
    restaurantId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/categories`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  function getListCategories(params: {
    restaurantId: string;
    cookiePair?: string;
    menuId?: string;
  }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/categories`,
    );
    if (params.menuId) req = req.query({ menuId: params.menuId });
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  function patchUpdateCategory(params: {
    restaurantId: string;
    categoryId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/categories/${params.categoryId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  async function countCategories(restaurantId: string): Promise<number> {
    return prisma.category.count({ where: { restaurantId } });
  }

  describe('AUTHORIZATION', () => {
    it('unauthenticated GET -> 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getListCategories({
        restaurantId: restaurant.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unauthenticated POST -> 401, no Category created', async () => {
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect(await countCategories(restaurant.id)).toBe(0);
    });

    it.each(['CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s has menu.view (GET succeeds) but not menu.manage (POST -> 403)',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await createMembership({ restaurantId: restaurant.id, userId, role });
        const cookiePair = await loginAndGetCookie(email);

        await getListCategories({
          restaurantId: restaurant.id,
          cookiePair,
        }).expect(200);
        const response = await postCreateCategory({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(menu.id),
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(await countCategories(restaurant.id)).toBe(0);
      },
    );

    it('valid same-origin CSRF is allowed', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
    });

    it('missing Origin -> 403 CSRF_VALIDATION_FAILED, no Category created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        body: validBody(menu.id),
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countCategories(restaurant.id)).toBe(0);
    });
  });

  describe('RESTAURANT-WIDE MUTATION AUTHORITY (AllBranchesRequiredGuard)', () => {
    it('MANAGER + allBranches=true + menu.manage -> Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
    });

    it('MANAGER + allBranches=false with a legitimate same-Restaurant Branch assignment -> 403 PERMISSION_DENIED, no Category created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(await countCategories(restaurant.id)).toBe(0);
    });

    it('the same Branch-scoped MANAGER can still call List (menu.view is unaffected by AllBranchesRequiredGuard)', async () => {
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

      const response = await getListCategories({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('TENANT', () => {
    it('creates a Category when menuId belongs to the authorized Restaurant', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);

      expect(await countCategories(restaurant.id)).toBe(1);
    });

    it('unknown menuId -> 404 MENU_NOT_FOUND, no Category created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(randomUUID()),
      }).expect(404);

      expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
      expect(await countCategories(restaurant.id)).toBe(0);
    });

    it('foreign-Restaurant menuId -> the identical 404 MENU_NOT_FOUND, no cross-Tenant existence leak', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(foreignMenu.id),
      }).expect(404);

      expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
      expect(await countCategories(restaurant.id)).toBe(0);
      expect(await countCategories(foreignRestaurant.id)).toBe(0);
    });

    it("List never returns another Restaurant's Categories", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      const menuB = await createMenuFixture(restaurantB.id);
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurantB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menuB.id),
      }).expect(201);

      const response = await getListCategories({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });

    it("the menuId List filter remains Tenant-scoped -- a foreign Restaurant's real menuId yields an empty result, never that Category", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      const menuB = await createMenuFixture(restaurantB.id);
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePairB = await loginAndGetCookie(email);
      await postCreateCategory({
        restaurantId: restaurantB.id,
        cookiePair: cookiePairB,
        origin: APPROVED_ORIGIN,
        body: validBody(menuB.id),
      }).expect(201);

      const response = await getListCategories({
        restaurantId: restaurantA.id,
        cookiePair: cookiePairB,
        menuId: menuB.id,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('DEFAULT LOCALE', () => {
    it('persists the translation under Restaurant.defaultLocale, ignoring a client-supplied locale', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ar');
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(menu.id), locale: 'en' },
      }).expect(201);

      const data = (
        response.body as {
          data: { id: string; translation: { locale: string } };
        }
      ).data;
      expect(data.translation.locale).toBe('ar');
      const persisted = await prisma.categoryTranslation.findFirstOrThrow({
        where: { categoryId: data.id },
      });
      expect(persisted.locale).toBe('ar');
    });

    it('Category and its default-locale translation are created atomically -- exactly one of each row', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);

      const category = await prisma.category.findFirstOrThrow({
        where: { restaurantId: restaurant.id },
      });
      const translationCount = await prisma.categoryTranslation.count({
        where: { categoryId: category.id },
      });
      expect(translationCount).toBe(1);
    });
  });

  describe('IMAGE ASSET PATH', () => {
    it('is always persisted as null, even if the client attempts to send it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          ...validBody(menu.id),
          imageAssetPath: '/attacker/controlled.png',
        },
      }).expect(201);

      expect(
        (response.body as { data: { imageAssetPath: string | null } }).data
          .imageAssetPath,
      ).toBeNull();
    });
  });

  describe('LIST', () => {
    it('returns an empty array when the Restaurant has no Categories', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getListCategories({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });

    it('orders deterministically by displayOrder asc, then id asc', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(menu.id), name: 'Second', displayOrder: 2 },
      }).expect(201);
      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(menu.id), name: 'First', displayOrder: 1 },
      }).expect(201);

      const response = await getListCategories({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const names = (
        response.body as { data: { translation: { name: string } }[] }
      ).data.map((category) => category.translation.name);
      expect(names).toEqual(['First', 'Second']);
    });

    it('the optional menuId filter returns only Categories for that Menu', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menuA = await createMenuFixture(restaurant.id);
      const menuB = await prisma.menu.create({
        data: {
          restaurantId: restaurant.id,
          nameInternal: 'Second Menu',
          status: 'ACTIVE',
          displayOrder: 1,
          isPrimary: false,
        },
      });
      await prisma.menuTranslation.create({
        data: { menuId: menuB.id, locale: 'ar', name: 'القائمة الثانية' },
      });
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(menuA.id), name: 'From Menu A' },
      }).expect(201);
      await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...validBody(menuB.id), name: 'From Menu B' },
      }).expect(201);

      const response = await getListCategories({
        restaurantId: restaurant.id,
        cookiePair,
        menuId: menuA.id,
      }).expect(200);

      const names = (
        response.body as { data: { translation: { name: string } }[] }
      ).data.map((category) => category.translation.name);
      expect(names).toEqual(['From Menu A']);
    });
  });

  describe('CATEGORY UPDATE', () => {
    it('a successful partial update changes only the supplied fields', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 4 },
      }).expect(200);

      const data = (
        response.body as { data: { displayOrder: number; status: string } }
      ).data;
      expect(data.displayOrder).toBe(4);
      expect(data.status).toBe('ACTIVE');
    });

    it('updates the default-locale translation, and description:null clears it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;

      const renamed = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'فئة محدثة' },
      }).expect(200);
      expect(
        (renamed.body as { data: { translation: { name: string } } }).data
          .translation.name,
      ).toBe('فئة محدثة');

      const cleared = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { description: null },
      }).expect(200);
      expect(
        (
          cleared.body as {
            data: { translation: { description: string | null } };
          }
        ).data.translation.description,
      ).toBeNull();
      const persisted = await prisma.categoryTranslation.findFirstOrThrow({
        where: { categoryId },
      });
      expect(persisted.description).toBeNull();
    });

    it('moves the Category to another same-Restaurant Menu', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menuA = await createMenuFixture(restaurant.id);
      const menuB = await prisma.menu.create({
        data: {
          restaurantId: restaurant.id,
          nameInternal: 'Second Menu',
          status: 'ACTIVE',
          displayOrder: 1,
          isPrimary: false,
        },
      });
      await prisma.menuTranslation.create({
        data: { menuId: menuB.id, locale: 'ar', name: 'القائمة الثانية' },
      });
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menuA.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { menuId: menuB.id },
      }).expect(200);

      expect((response.body as { data: { menuId: string } }).data.menuId).toBe(
        menuB.id,
      );
      const persisted = await prisma.category.findUniqueOrThrow({
        where: { id: categoryId },
      });
      expect(persisted.menuId).toBe(menuB.id);
    });

    it('a foreign-Restaurant target Menu -> 404 MENU_NOT_FOUND, no mutation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { menuId: foreignMenu.id },
      }).expect(404);

      expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
      const persisted = await prisma.category.findUniqueOrThrow({
        where: { id: categoryId },
      });
      expect(persisted.menuId).toBe(menu.id);
    });

    it.each([
      ['malformed', 'not-a-uuid'],
      ['unknown', randomUUID()],
    ] as const)(
      '%s categoryId -> the identical 404 CATEGORY_NOT_FOUND',
      async (_label, categoryIdCase) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await patchUpdateCategory({
          restaurantId: restaurant.id,
          categoryId: categoryIdCase,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { displayOrder: 1 },
        }).expect(404);

        expect(response.body).toEqual({
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        });
      },
    );

    it('a foreign-Restaurant categoryId produces the identical 404 CATEGORY_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant();
      const foreignMenu = await createMenuFixture(foreignRestaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      await createMembership({ restaurantId: foreignRestaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const foreignCategory = await postCreateCategory({
        restaurantId: foreignRestaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(foreignMenu.id),
      }).expect(201);
      const foreignCategoryId = (
        foreignCategory.body as { data: { id: string } }
      ).data.id;

      const response = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId: foreignCategoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 1 },
      }).expect(404);

      expect(response.body).toEqual({
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
      });
    });

    it.each(['menuId', 'name', 'status', 'displayOrder'] as const)(
      'explicit null for %s -> 400 VALIDATION_ERROR, Category left unchanged',
      async (field) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);
        const created = await postCreateCategory({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(menu.id),
        }).expect(201);
        const categoryId = (created.body as { data: { id: string } }).data.id;

        const response = await patchUpdateCategory({
          restaurantId: restaurant.id,
          categoryId,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { [field]: null },
        }).expect(400);

        expect((response.body as { error: { code: string } }).error.code).toBe(
          'VALIDATION_ERROR',
        );
      },
    );

    it('MANAGER + allBranches=false with a legitimate Branch assignment -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      const branch = await createBranch(restaurant.id);
      const { id: ownerUserId, email: ownerEmail } = await createTestUser();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerUserId,
      });
      const ownerCookie = await loginAndGetCookie(ownerEmail);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair: ownerCookie,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 1 },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('MANAGER + allBranches=true succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);
      const categoryId = (created.body as { data: { id: string } }).data.id;

      await patchUpdateCategory({
        restaurantId: restaurant.id,
        categoryId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 2 },
      }).expect(200);
    });
  });

  describe('RESPONSE SHAPE', () => {
    it('never exposes restaurantId, createdAt, updatedAt, or a raw CategoryTranslation id/categoryId', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const menu = await createMenuFixture(restaurant.id);
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateCategory({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(menu.id),
      }).expect(201);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(Object.keys(data).sort()).toEqual(
        [
          'displayOrder',
          'id',
          'imageAssetPath',
          'menuId',
          'status',
          'translation',
        ].sort(),
      );
    });
  });
});
