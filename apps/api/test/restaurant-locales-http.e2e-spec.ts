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
 * LOC-2A, approved LOC-1 contract: proves Restaurant Language Settings
 * end-to-end through the real `GET`/`PUT
 * /api/v1/restaurants/{restaurantId}/locales[/:locale]` endpoints -- HTTP
 * Cookie -> guard chain -> RestaurantLocalesService -> PrismaService ->
 * PostgreSQL. GET: AuthGuard -> RestaurantAccessGuard -> PermissionGuard.
 * PUT: AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard ->
 * AllBranchesRequiredGuard.
 *
 * Creates temporary Restaurant/User/Membership/AuthSession rows and removes
 * them (along with any RestaurantLocale rows) in afterEach, so the database
 * returns to its empty state regardless of test outcome.
 */
describe('Restaurant Locales (e2e)', () => {
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
  const DEFAULT_LOCALE_REQUIRED_BODY = {
    error: {
      code: 'DEFAULT_LOCALE_REQUIRED',
      message: 'The default locale cannot be disabled.',
    },
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

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const uniqueEmail = `restaurant-locales-${randomUUID()}@example.test`;
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

  /**
   * The approved standing invariant (LOC-2A Section 8/18): every Restaurant
   * has an active `RestaurantLocale` row matching its `defaultLocale`. A
   * normal fixture must reflect that invariant, not merely a bare
   * `Restaurant` row -- otherwise tests would be exercising a Restaurant
   * shape that can never legitimately exist for a Restaurant created after
   * this feature shipped. Created in one transaction, mirroring the
   * standing invariant that Restaurant creation must establish both rows
   * atomically.
   */
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

  /**
   * Deliberately constructs the LEGACY/broken state the standing invariant
   * above forbids for normal fixtures: a Restaurant with no
   * `RestaurantLocale` row at all for its `defaultLocale`. Exists only for
   * tests that specifically need to prove GET's read-only, non-repairing
   * behavior against exactly this pre-LOC-2A data shape (Section 8: "GET
   * must NOT add lazy repair"). Never used as the default/ordinary fixture.
   */
  async function createLegacyRestaurantWithoutDefaultLocale(
    defaultLocale = 'en',
  ) {
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

  function getLocales(params: { restaurantId: string; cookiePair?: string }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/locales`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  function putLocale(params: {
    restaurantId: string;
    locale: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).put(
      `/api/v1/restaurants/${params.restaurantId}/locales/${params.locale}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  describe('GET (list locales)', () => {
    it('unauthenticated -> 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getLocales({
        restaurantId: restaurant.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('OWNER can GET, and the response merges the Platform registry with the backfilled active default locale', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getLocales({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: {
          defaultLocale: 'en',
          locales: [
            { locale: 'en', isDefault: true, isActive: true },
            { locale: 'ar', isDefault: false, isActive: false },
          ],
        },
      });
    });

    it('a legacy Restaurant without a backfilled default-locale row still returns a correct, merged response -- GET never lazily repairs it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createLegacyRestaurantWithoutDefaultLocale('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getLocales({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: {
          defaultLocale: 'en',
          locales: [
            { locale: 'en', isDefault: true, isActive: false },
            { locale: 'ar', isDefault: false, isActive: false },
          ],
        },
      });
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id },
        }),
      ).toBe(0);
    });

    it.each(['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s has restaurant.view and can GET',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId, role });
        const cookiePair = await loginAndGetCookie(email);

        await getLocales({ restaurantId: restaurant.id, cookiePair }).expect(
          200,
        );
      },
    );

    it("never returns another Restaurant's locale state", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('en');
      const restaurantB = await createRestaurant('ar');
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getLocales({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: {
          defaultLocale: 'en',
          locales: [
            { locale: 'en', isDefault: true, isActive: true },
            { locale: 'ar', isDefault: false, isActive: false },
          ],
        },
      });
    });

    it('never exposes internal RestaurantLocale id or restaurantId', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getLocales({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toContain(restaurant.id);
    });
  });

  describe('PUT :locale (enable/disable)', () => {
    it('unauthenticated -> 401, no secondary locale row created', async () => {
      const restaurant = await createRestaurant();

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('OWNER can enable a secondary locale, then disable it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const enableResponse = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(200);
      expect(enableResponse.body).toEqual({
        data: { locale: 'ar', isActive: true },
      });
      const enabledRow = await prisma.restaurantLocale.findFirstOrThrow({
        where: { restaurantId: restaurant.id, locale: 'ar' },
      });
      expect(enabledRow.isActive).toBe(true);

      const disableResponse = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: false },
      }).expect(200);
      expect(disableResponse.body).toEqual({
        data: { locale: 'ar', isActive: false },
      });
      const disabledRow = await prisma.restaurantLocale.findFirstOrThrow({
        where: { restaurantId: restaurant.id, locale: 'ar' },
      });
      expect(disabledRow.isActive).toBe(false);
    });

    it('disabling a never-enabled locale is a safe no-op and creates no row', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: false },
      }).expect(200);

      expect(response.body).toEqual({
        data: { locale: 'ar', isActive: false },
      });
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('MANAGER cannot PUT under the current Role matrix -> 403 PERMISSION_DENIED, no row created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('OWNER scoped to allBranches=false cannot PUT -> 403 PERMISSION_DENIED, no row created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('missing Origin -> 403 CSRF_VALIDATION_FAILED, no row created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        body: { isActive: true },
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('the default locale cannot be disabled -> 409 DEFAULT_LOCALE_REQUIRED, Restaurant.defaultLocale unchanged', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'en',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: false },
      }).expect(409);

      expect(response.body).toEqual(DEFAULT_LOCALE_REQUIRED_BODY);
      const row = await prisma.restaurantLocale.findFirstOrThrow({
        where: { restaurantId: restaurant.id, locale: 'en' },
      });
      expect(row.isActive).toBe(true);
      const persistedRestaurant = await prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurant.id },
      });
      expect(persistedRestaurant.defaultLocale).toBe('en');
    });

    it('enabling the default locale (already active) remains a success, never the conflict', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('en');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await putLocale({
        restaurantId: restaurant.id,
        locale: 'en',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(200);
    });

    it.each(['fr', 'en-US', 'en-us', 'ar-EG', 'english'])(
      'unsupported locale %s -> 400 VALIDATION_ERROR, no additional row created',
      async (locale) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);
        const rowCountBefore = await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id },
        });

        const response = await putLocale({
          restaurantId: restaurant.id,
          locale,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { isActive: true },
        }).expect(400);

        expect((response.body as { error: { code: string } }).error.code).toBe(
          'VALIDATION_ERROR',
        );
        expect(
          await prisma.restaurantLocale.count({
            where: { restaurantId: restaurant.id },
          }),
        ).toBe(rowCountBefore);
      },
    );

    it('a non-boolean isActive -> 400 VALIDATION_ERROR, no row created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: 'yes' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: restaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it("cannot enable another Restaurant's locale via a foreign restaurantId in the route -- 404/authorization boundary, never a cross-Tenant write", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await putLocale({
        restaurantId: foreignRestaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(404);

      expect(
        await prisma.restaurantLocale.count({
          where: { restaurantId: foreignRestaurant.id, locale: 'ar' },
        }),
      ).toBe(0);
    });

    it('never exposes internal RestaurantLocale id or restaurantId in the response', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await putLocale({
        restaurantId: restaurant.id,
        locale: 'ar',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { isActive: true },
      }).expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toContain(restaurant.id);
      expect(Object.keys(response.body as object)).toEqual(['data']);
      expect(
        Object.keys((response.body as { data: object }).data).sort(),
      ).toEqual(['isActive', 'locale']);
    });
  });
});
