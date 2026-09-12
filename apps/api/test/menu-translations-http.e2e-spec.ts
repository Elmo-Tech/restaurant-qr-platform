import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { createProductPublicId } from './../src/menu/product-public-id';

// This suite's fixtures are heavier than most (Restaurant + RestaurantLocale
// + Menu + Category + Product + Membership + login, per test, sometimes
// twice for a foreign-Tenant case) -- the default 5000ms Jest timeout is
// occasionally too tight against real Postgres, mirroring the existing
// precedent elsewhere in this repo (menus-http.e2e-spec.ts's own explicit
// `20000` override for its one genuinely slow concurrency test).
jest.setTimeout(20000);

/**
 * LOC-2B: proves Menu/Category/Product Translation GET/PUT/DELETE
 * end-to-end through the real routes -- HTTP Cookie -> guard chain ->
 * Service -> PrismaService -> PostgreSQL -- plus the parent `updatedAt`
 * touch/no-touch behavior (Section 15/16) and the corrected existing
 * generic PATCH timestamp gap (Section 17), using real DB reads.
 *
 * Fixtures obey the LOC-2A standing invariant: every Restaurant is created
 * WITH its active default-locale `RestaurantLocale` row (never a bare
 * Restaurant), mirroring the corrected `restaurant-locales-http.e2e-spec.ts`
 * pattern. `ar` is enabled explicitly wherever a secondary-locale mutation
 * test needs it.
 *
 * Guard/permission exact-metadata coverage (guard order, absence of Branch
 * guards) is already proven per-route by menus.controller.spec.ts /
 * categories.controller.spec.ts / products.controller.spec.ts -- this suite
 * focuses on true end-to-end behavior: the real chain wired together, real
 * Tenant isolation, and real timestamp movement. The full
 * AUTHORIZATION/CSRF/role matrix is exercised once against Menu (the
 * representative case, since the guard decorators are identical across all
 * three controllers) and re-confirmed narrowly for Category/Product via
 * their own round-trip and Tenant-isolation tests.
 */
describe('Menu/Category/Product Translations (e2e)', () => {
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
  const LOCALE_NOT_ACTIVE_BODY = {
    error: {
      code: 'LOCALE_NOT_ACTIVE',
      message: 'The locale is not active for this Restaurant.',
    },
  };
  const DEFAULT_TRANSLATION_REQUIRED_BODY = {
    error: {
      code: 'DEFAULT_TRANSLATION_REQUIRED',
      message: 'The default locale translation cannot be deleted.',
    },
  };
  const MENU_NOT_FOUND_BODY = {
    error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
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
      await prisma.restaurantLocale.deleteMany({ where: { restaurantId } });
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { membership: { restaurantId } },
      });
      await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
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
    const uniqueEmail = `menu-translations-${randomUUID()}@example.test`;
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

  /** LOC-2A standing invariant: Restaurant + its active default-locale RestaurantLocale row, created atomically. */
  async function createRestaurant(defaultLocale = 'en') {
    const restaurant = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({
        data: {
          publicId: `rest-${randomUUID()}`,
          name: 'Cairo Bites',
          status: 'ACTIVE',
          defaultLocale,
          currencyCode: 'EGP',
        },
      });
      await tx.restaurantLocale.create({
        data: {
          restaurantId: created.id,
          locale: defaultLocale,
          isActive: true,
        },
      });
      return created;
    });
    createdRestaurantIds.push(restaurant.id);
    return restaurant;
  }

  async function enableRestaurantLocale(restaurantId: string, locale: string) {
    await prisma.restaurantLocale.upsert({
      where: { restaurantId_locale: { restaurantId, locale } },
      create: { restaurantId, locale, isActive: true },
      update: { isActive: true },
    });
  }

  async function disableRestaurantLocale(restaurantId: string, locale: string) {
    await prisma.restaurantLocale.updateMany({
      where: { restaurantId, locale },
      data: { isActive: false },
    });
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

  async function createMenuFixture(restaurantId: string, locale = 'en') {
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
      data: { menuId: menu.id, locale, name: 'Main Menu' },
    });
    return menu;
  }

  async function createCategoryFixture(
    restaurantId: string,
    menuId: string,
    locale = 'en',
  ) {
    const category = await prisma.category.create({
      data: { restaurantId, menuId, status: 'ACTIVE', displayOrder: 0 },
    });
    await prisma.categoryTranslation.create({
      data: { categoryId: category.id, locale, name: 'Appetizers' },
    });
    return category;
  }

  async function createProductFixture(
    restaurantId: string,
    categoryId: string,
    locale = 'en',
  ) {
    const product = await prisma.product.create({
      data: {
        restaurantId,
        categoryId,
        publicId: createProductPublicId(),
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '10.00',
        displayOrder: 0,
        allowCustomerNotes: true,
        featured: false,
      },
    });
    await prisma.productTranslation.create({
      data: { productId: product.id, locale, name: 'Burger' },
    });
    return product;
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

  type Resource = 'menus' | 'categories' | 'products';

  function getTranslations(params: {
    resource: Resource;
    restaurantId: string;
    entityId: string;
    cookiePair?: string;
  }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/${params.resource}/${params.entityId}/translations`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  function putTranslation(params: {
    resource: Resource;
    restaurantId: string;
    entityId: string;
    locale: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).put(
      `/api/v1/restaurants/${params.restaurantId}/${params.resource}/${params.entityId}/translations/${params.locale}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  function deleteTranslation(params: {
    resource: Resource;
    restaurantId: string;
    entityId: string;
    locale: string;
    cookiePair?: string;
    origin?: string;
  }) {
    let req = request(app.getHttpServer()).delete(
      `/api/v1/restaurants/${params.restaurantId}/${params.resource}/${params.entityId}/translations/${params.locale}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req;
  }

  function patchEntity(params: {
    resource: Resource;
    restaurantId: string;
    entityId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/${params.resource}/${params.entityId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  // ==========================================================================
  // MENU TRANSLATIONS -- full contract coverage (representative entity)
  // ==========================================================================
  describe('Menu Translations', () => {
    describe('GET', () => {
      it('unauthenticated -> 401', async () => {
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);

        const response = await getTranslations({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
        }).expect(401);

        expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      });

      it('an authorized member with menu.view can GET, and it returns every existing raw translation row', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: menu.id, locale: 'ar', name: 'القائمة الرئيسية' },
        });
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getTranslations({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          cookiePair,
        }).expect(200);

        expect(response.body).toEqual({
          data: [
            { locale: 'ar', name: 'القائمة الرئيسية', description: null },
            { locale: 'en', name: 'Main Menu', description: null },
          ],
        });
      });

      it.each(['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const)(
        '%s has menu.view and can GET',
        async (role) => {
          const { id: userId, email } = await createTestUser();
          const restaurant = await createRestaurant();
          const menu = await createMenuFixture(restaurant.id);
          await createMembership({ restaurantId: restaurant.id, userId, role });
          const cookiePair = await loginAndGetCookie(email);

          await getTranslations({
            resource: 'menus',
            restaurantId: restaurant.id,
            entityId: menu.id,
            cookiePair,
          }).expect(200);
        },
      );

      it('a disabled secondary locale still returns its existing stored translation (disabling is non-destructive)', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: menu.id, locale: 'ar', name: 'القائمة الرئيسية' },
        });
        await disableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getTranslations({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          cookiePair,
        }).expect(200);

        expect(response.body).toEqual({
          data: [
            { locale: 'ar', name: 'القائمة الرئيسية', description: null },
            { locale: 'en', name: 'Main Menu', description: null },
          ],
        });
      });

      it('a foreign-Restaurant menuId -> 404 MENU_NOT_FOUND, never leaks existence', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const foreignRestaurant = await createRestaurant();
        const foreignMenu = await createMenuFixture(foreignRestaurant.id);
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getTranslations({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: foreignMenu.id,
          cookiePair,
        }).expect(404);

        expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
      });

      it('never exposes an internal translation id or menuId', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getTranslations({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          cookiePair,
        }).expect(200);

        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toMatch(/menuId/i);
        expect(serialized).not.toContain(menu.id);
      });
    });

    describe('PUT', () => {
      it('unauthenticated -> 401, no row created', async () => {
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(401);

        expect(response.body).toEqual(UNAUTHENTICATED_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('OWNER + allBranches can PUT an active secondary locale -- creates, then replaces on a second call', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const created = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية', description: null },
        }).expect(200);
        expect(created.body).toEqual({
          data: { locale: 'ar', name: 'الرئيسية', description: null },
        });

        const replaced = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'القائمة المحدثة', description: 'وصف' },
        }).expect(200);
        expect(replaced.body).toEqual({
          data: { locale: 'ar', name: 'القائمة المحدثة', description: 'وصف' },
        });

        const persisted = await prisma.menuTranslation.findFirstOrThrow({
          where: { menuId: menu.id, locale: 'ar' },
        });
        expect(persisted.name).toBe('القائمة المحدثة');
        expect(persisted.description).toBe('وصف');
      });

      it('PUT on the default locale is allowed (writing the default locale is allowed by policy)', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'en',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'Updated Main Menu' },
        }).expect(200);
      });

      it('MANAGER + allBranches=true has menu.manage and CAN PUT', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(200);
      });

      it('a scoped MANAGER (allBranches=false) cannot PUT -> 403 PERMISSION_DENIED, zero writes', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        const branch = await createBranch(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branch.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('an OWNER scoped to allBranches=false cannot PUT -> 403 PERMISSION_DENIED', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        const branch = await createBranch(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'OWNER',
          allBranches: false,
          branchIds: [branch.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      });

      it('missing Origin -> 403 CSRF_VALIDATION_FAILED, zero writes', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          body: { name: 'الرئيسية' },
        }).expect(403);

        expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('an unsupported locale -> 400 VALIDATION_ERROR, zero writes', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'fr',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'Le Menu' },
        }).expect(400);

        expect((response.body as { error: { code: string } }).error.code).toBe(
          'VALIDATION_ERROR',
        );
        expect(
          await prisma.menuTranslation.count({ where: { menuId: menu.id } }),
        ).toBe(1); // only the fixture's own default-locale row
      });

      it('an inactive secondary locale -> 409 LOCALE_NOT_ACTIVE, zero writes', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(409);

        expect(response.body).toEqual(LOCALE_NOT_ACTIVE_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('a foreign-Restaurant menuId -> 404 MENU_NOT_FOUND, never a cross-Tenant write', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const foreignRestaurant = await createRestaurant('en');
        const foreignMenu = await createMenuFixture(foreignRestaurant.id, 'en');
        await enableRestaurantLocale(foreignRestaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: foreignMenu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(404);

        expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: foreignMenu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('never exposes an internal translation id or menuId in the response', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const menu = await createMenuFixture(restaurant.id);
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await putTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { name: 'الرئيسية' },
        }).expect(200);

        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toMatch(/menuId/i);
        expect(serialized).not.toContain(menu.id);
        expect(
          Object.keys((response.body as { data: object }).data).sort(),
        ).toEqual(['description', 'locale', 'name']);
      });
    });

    describe('DELETE', () => {
      it('unauthenticated -> 401, row untouched', async () => {
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: menu.id, locale: 'ar', name: 'الرئيسية' },
        });

        const response = await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          origin: APPROVED_ORIGIN,
        }).expect(401);

        expect(response.body).toEqual(UNAUTHENTICATED_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(1);
      });

      it('an existing active secondary translation is deleted -> 204', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: menu.id, locale: 'ar', name: 'الرئيسية' },
        });
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(204);

        expect(response.body).toEqual({});
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('a missing active secondary translation is a safe no-op -> 204, never creates a row', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(204);

        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(0);
      });

      it('an inactive secondary locale -> 409 LOCALE_NOT_ACTIVE, existing row untouched', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await enableRestaurantLocale(restaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: menu.id, locale: 'ar', name: 'الرئيسية' },
        });
        await disableRestaurantLocale(restaurant.id, 'ar');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(409);

        expect(response.body).toEqual(LOCALE_NOT_ACTIVE_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'ar' },
          }),
        ).toBe(1);
      });

      it('the default locale can never be deleted -> 409 DEFAULT_TRANSLATION_REQUIRED, regardless of row existence', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant('en');
        const menu = await createMenuFixture(restaurant.id, 'en');
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: menu.id,
          locale: 'en',
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(409);

        expect(response.body).toEqual(DEFAULT_TRANSLATION_REQUIRED_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: menu.id, locale: 'en' },
          }),
        ).toBe(1);
      });

      it('a foreign-Restaurant menuId -> 404 MENU_NOT_FOUND, never a cross-Tenant delete', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const foreignRestaurant = await createRestaurant('en');
        const foreignMenu = await createMenuFixture(foreignRestaurant.id, 'en');
        await enableRestaurantLocale(foreignRestaurant.id, 'ar');
        await prisma.menuTranslation.create({
          data: { menuId: foreignMenu.id, locale: 'ar', name: 'الرئيسية' },
        });
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await deleteTranslation({
          resource: 'menus',
          restaurantId: restaurant.id,
          entityId: foreignMenu.id,
          locale: 'ar',
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(404);

        expect(response.body).toEqual(MENU_NOT_FOUND_BODY);
        expect(
          await prisma.menuTranslation.count({
            where: { menuId: foreignMenu.id, locale: 'ar' },
          }),
        ).toBe(1);
      });
    });
  });

  // ==========================================================================
  // CATEGORY TRANSLATIONS -- round-trip + key scenarios
  // ==========================================================================
  describe('Category Translations', () => {
    it('GET returns every existing raw translation row for an authorized Category', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTranslations({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: [{ locale: 'en', name: 'Appetizers', description: null }],
      });
    });

    it('a foreign-Restaurant categoryId -> 404 CATEGORY_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant('en');
      const foreignMenu = await createMenuFixture(foreignRestaurant.id, 'en');
      const foreignCategory = await createCategoryFixture(
        foreignRestaurant.id,
        foreignMenu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTranslations({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: foreignCategory.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(CATEGORY_NOT_FOUND_BODY);
    });

    it('PUT active secondary locale round trip, then DELETE it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const putResponse = await putTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'المقبلات', description: null },
      }).expect(200);
      expect(putResponse.body).toEqual({
        data: { locale: 'ar', name: 'المقبلات', description: null },
      });

      const deleteResponse = await deleteTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);
      expect(deleteResponse.body).toEqual({});
      expect(
        await prisma.categoryTranslation.count({
          where: { categoryId: category.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('an inactive secondary locale -> 409 LOCALE_NOT_ACTIVE on PUT, zero writes', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'المقبلات' },
      }).expect(409);

      expect(response.body).toEqual(LOCALE_NOT_ACTIVE_BODY);
    });

    it('the default locale can never be deleted -> 409 DEFAULT_TRANSLATION_REQUIRED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await deleteTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'en',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(DEFAULT_TRANSLATION_REQUIRED_BODY);
    });

    it('a scoped MANAGER (allBranches=false) cannot PUT -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const branch = await createBranch(restaurant.id);
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'المقبلات' },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  // ==========================================================================
  // PRODUCT TRANSLATIONS -- round-trip + key scenarios
  // ==========================================================================
  describe('Product Translations', () => {
    it('GET returns every existing raw translation row for an authorized Product', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTranslations({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: [{ locale: 'en', name: 'Burger', description: null }],
      });
    });

    it('a foreign-Restaurant productId -> 404 PRODUCT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant('en');
      const foreignMenu = await createMenuFixture(foreignRestaurant.id, 'en');
      const foreignCategory = await createCategoryFixture(
        foreignRestaurant.id,
        foreignMenu.id,
        'en',
      );
      const foreignProduct = await createProductFixture(
        foreignRestaurant.id,
        foreignCategory.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTranslations({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: foreignProduct.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    });

    it('PUT active secondary locale round trip, then DELETE it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const putResponse = await putTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'برجر', description: null },
      }).expect(200);
      expect(putResponse.body).toEqual({
        data: { locale: 'ar', name: 'برجر', description: null },
      });

      const deleteResponse = await deleteTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);
      expect(deleteResponse.body).toEqual({});
      expect(
        await prisma.productTranslation.count({
          where: { productId: product.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('an inactive secondary locale -> 409 LOCALE_NOT_ACTIVE on PUT, zero writes', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'برجر' },
      }).expect(409);

      expect(response.body).toEqual(LOCALE_NOT_ACTIVE_BODY);
    });

    it('the default locale can never be deleted -> 409 DEFAULT_TRANSLATION_REQUIRED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await deleteTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'en',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(DEFAULT_TRANSLATION_REQUIRED_BODY);
    });

    it('a scoped MANAGER (allBranches=false) cannot PUT -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      const branch = await createBranch(restaurant.id);
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'برجر' },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  // ==========================================================================
  // TIMESTAMP PROOF -- real DB reads, for all three entities
  // ==========================================================================
  describe('parent.updatedAt via the new Translation endpoints', () => {
    it('Menu: a real secondary PUT change moves Menu.updatedAt; the identical repeat PUT does not', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await putTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'الرئيسية' },
      }).expect(200);
      const afterCreate = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(afterCreate.getTime()).toBeGreaterThan(before.getTime());

      await putTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'الرئيسية' },
      }).expect(200);
      const afterNoOp = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(afterNoOp.getTime()).toBe(afterCreate.getTime());
    });

    it('Menu: DELETE of an existing secondary translation moves updatedAt; DELETE of a missing one does not', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await enableRestaurantLocale(restaurant.id, 'ar');
      await prisma.menuTranslation.create({
        data: { menuId: menu.id, locale: 'ar', name: 'الرئيسية' },
      });
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await deleteTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);
      const afterDelete = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(afterDelete.getTime()).toBeGreaterThan(before.getTime());

      await deleteTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);
      const afterMissingDelete = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(afterMissingDelete.getTime()).toBe(afterDelete.getTime());
    });

    it('Category: a real secondary PUT change moves Category.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await putTranslation({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'المقبلات' },
      }).expect(200);

      const after = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('Product: a real secondary PUT change moves Product.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await enableRestaurantLocale(restaurant.id, 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await putTranslation({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'برجر' },
      }).expect(200);

      const after = (
        await prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('a rejected LOCALE_NOT_ACTIVE PUT never touches parent.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await putTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'الرئيسية' },
      }).expect(409);

      const after = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBe(before.getTime());
    });

    it('a rejected DEFAULT_TRANSLATION_REQUIRED DELETE never touches parent.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await deleteTranslation({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        locale: 'en',
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      const after = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBe(before.getTime());
    });
  });

  // ==========================================================================
  // TIMESTAMP PROOF -- the corrected EXISTING generic PATCH endpoints
  // ==========================================================================
  describe('parent.updatedAt via the corrected existing generic PATCH', () => {
    it('Menu: a translation-only PATCH (no parent field) moves Menu.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await patchEntity({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'Renamed Menu' },
      }).expect(200);

      const after = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('Menu: an ordinary parent-field-only PATCH still works and still moves updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      const response = await patchEntity({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 5 },
      }).expect(200);

      expect(
        (response.body as { data: { displayOrder: number } }).data.displayOrder,
      ).toBe(5);
      const after = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('Menu: a mixed parent + translation PATCH performs both mutations without breaking the response, moving updatedAt once', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchEntity({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 3, name: 'Combined Update' },
      }).expect(200);

      const body = response.body as {
        data: { displayOrder: number; translation: { name: string } };
      };
      expect(body.data.displayOrder).toBe(3);
      expect(body.data.translation.name).toBe('Combined Update');
      const persistedTranslation =
        await prisma.menuTranslation.findFirstOrThrow({
          where: { menuId: menu.id, locale: 'en' },
        });
      expect(persistedTranslation.name).toBe('Combined Update');
    });

    it('Menu: an empty-body PATCH is a true no-op -- updatedAt does not move, no translation created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await patchEntity({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: menu.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      const after = (
        await prisma.menu.findUniqueOrThrow({
          where: { id: menu.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBe(before.getTime());
      expect(
        await prisma.menuTranslation.count({ where: { menuId: menu.id } }),
      ).toBe(1);
    });

    it('Menu: a rejected PATCH (unknown menuId) never touches updatedAt or creates a translation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await patchEntity({
        resource: 'menus',
        restaurantId: restaurant.id,
        entityId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'Should not persist' },
      }).expect(404);

      expect(
        await prisma.menuTranslation.count({
          where: { name: 'Should not persist' },
        }),
      ).toBe(0);
    });

    it('Category: a translation-only PATCH moves Category.updatedAt', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await patchEntity({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'Renamed Category' },
      }).expect(200);

      const after = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('Category: an empty-body PATCH is a true no-op -- updatedAt does not move', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await patchEntity({
        resource: 'categories',
        restaurantId: restaurant.id,
        entityId: category.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      const after = (
        await prisma.category.findUniqueOrThrow({
          where: { id: category.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBe(before.getTime());
    });

    it('Product: a translation-only PATCH moves Product.updatedAt, and money/basePrice is untouched', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { updatedAt: true, basePrice: true },
      });

      const response = await patchEntity({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'Renamed Burger' },
      }).expect(200);

      expect(
        (response.body as { data: { basePrice: string } }).data.basePrice,
      ).toBe('10.00');
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { updatedAt: true, basePrice: true },
      });
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
      expect(after.basePrice.toString()).toBe(before.basePrice.toString());
    });

    it('Product: an empty-body PATCH is a true no-op -- updatedAt does not move', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      const menu = await createMenuFixture(restaurant.id, 'en');
      const category = await createCategoryFixture(
        restaurant.id,
        menu.id,
        'en',
      );
      const product = await createProductFixture(
        restaurant.id,
        category.id,
        'en',
      );
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const before = (
        await prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { updatedAt: true },
        })
      ).updatedAt;

      await patchEntity({
        resource: 'products',
        restaurantId: restaurant.id,
        entityId: product.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      const after = (
        await prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { updatedAt: true },
        })
      ).updatedAt;
      expect(after.getTime()).toBe(before.getTime());
    });
  });
});
