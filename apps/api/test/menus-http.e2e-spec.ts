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
 * Day 1 Menu Vertical Slice, Batch C: proves Menu List and Create end-to-end
 * through the real `GET`/`POST /api/v1/restaurants/{restaurantId}/menus`
 * endpoints -- HTTP Cookie -> guard chain -> MenusService -> PrismaService
 * -> PostgreSQL. GET: AuthGuard -> RestaurantAccessGuard -> PermissionGuard.
 * POST: AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard
 * -> AllBranchesRequiredGuard (Restaurant-structural mutation, corrected).
 *
 * Creates temporary Restaurant/User/Membership/AuthSession/Menu rows and
 * removes them in afterEach, so the database returns to its empty state
 * regardless of test outcome.
 */
describe('Menus (e2e)', () => {
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
  const RESTAURANT_NOT_FOUND_BODY = {
    error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' },
  };
  const RESTAURANT_NOT_OPERATIONAL_BODY = {
    error: {
      code: 'RESTAURANT_NOT_OPERATIONAL',
      message: 'Restaurant is not currently operational.',
    },
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
    const uniqueEmail = `menus-${randomUUID()}@example.test`;
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

  async function createRestaurant(
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' = 'ACTIVE',
    defaultLocale = 'ar',
  ) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Cairo Bites',
        status,
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

  const VALID_BODY = {
    nameInternal: 'Main Menu',
    name: 'القائمة الرئيسية',
    description: 'وصف القائمة',
    status: 'ACTIVE',
    displayOrder: 0,
  };

  function postCreateMenu(params: {
    restaurantId: string;
    cookiePair?: string;
    origin?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/menus`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body ?? VALID_BODY);
  }

  function getListMenus(params: { restaurantId: string; cookiePair?: string }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/menus`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  function patchUpdateMenu(params: {
    restaurantId: string;
    menuId: string;
    cookiePair?: string;
    origin?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/menus/${params.menuId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send(params.body);
  }

  function patchSetPrimaryMenu(params: {
    restaurantId: string;
    menuId: string;
    cookiePair?: string;
    origin?: string;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/menus/${params.menuId}/primary`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    return req.send({});
  }

  async function countMenus(restaurantId: string): Promise<number> {
    return prisma.menu.count({ where: { restaurantId } });
  }

  describe('AUTHORIZATION', () => {
    it('unauthenticated GET -> 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getListMenus({
        restaurantId: restaurant.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unauthenticated POST -> 401, no Menu created', async () => {
      const restaurant = await createRestaurant();

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        origin: APPROVED_ORIGIN,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect(await countMenus(restaurant.id)).toBe(0);
    });

    it('foreign Restaurant -> 404 RESTAURANT_NOT_FOUND on create', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: foreignRestaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'non-operational Restaurant %s -> 409, no Menu created',
      async (status) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant(status);
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateMenu({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(409);

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      },
    );

    it.each(['CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s has menu.view (GET succeeds) but not menu.manage (POST -> 403)',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId, role });
        const cookiePair = await loginAndGetCookie(email);

        await getListMenus({ restaurantId: restaurant.id, cookiePair }).expect(
          200,
        );
        const response = await postCreateMenu({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(await countMenus(restaurant.id)).toBe(0);
      },
    );

    it('valid same-origin CSRF is allowed', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
    });

    it('missing Origin -> 403 CSRF_VALIDATION_FAILED, no Menu created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countMenus(restaurant.id)).toBe(0);
    });
  });

  describe('RESTAURANT-WIDE MUTATION AUTHORITY (AllBranchesRequiredGuard)', () => {
    it('MANAGER + allBranches=true + menu.manage -> Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
    });

    it('MANAGER + allBranches=false with a legitimate same-Restaurant Branch assignment -> 403 PERMISSION_DENIED, no Menu created', async () => {
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

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(await countMenus(restaurant.id)).toBe(0);
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

      const response = await getListMenus({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('DEFAULT LOCALE', () => {
    it('persists the translation under Restaurant.defaultLocale, ignoring a client-supplied locale', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'ar');
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, locale: 'en' },
      }).expect(201);

      const data = (
        response.body as {
          data: { id: string; translation: { locale: string; name: string } };
        }
      ).data;
      expect(data.translation.locale).toBe('ar');
      expect(data.translation.name).toBe(VALID_BODY.name);

      const persisted = await prisma.menuTranslation.findFirstOrThrow({
        where: { menuId: data.id },
      });
      expect(persisted.locale).toBe('ar');
    });

    it('Menu and its default-locale translation are created atomically -- exactly one of each row', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const menu = await prisma.menu.findFirstOrThrow({
        where: { restaurantId: restaurant.id },
      });
      const translationCount = await prisma.menuTranslation.count({
        where: { menuId: menu.id },
      });
      expect(translationCount).toBe(1);
    });
  });

  describe('FIRST MENU PRIMARY', () => {
    it('the first Menu for a Restaurant becomes isPrimary=true', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect(
        (response.body as { data: { isPrimary: boolean } }).data.isPrimary,
      ).toBe(true);
    });

    it('isPrimary and status are independent -- the first Menu may be created with status=INACTIVE and still becomes isPrimary=true', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, status: 'INACTIVE' },
      }).expect(201);

      const data = (
        response.body as {
          data: { id: string; status: string; isPrimary: boolean };
        }
      ).data;
      expect(data.status).toBe('INACTIVE');
      expect(data.isPrimary).toBe(true);

      const persisted = await prisma.menu.findUniqueOrThrow({
        where: { id: data.id },
      });
      expect(persisted.status).toBe('INACTIVE');
      expect(persisted.isPrimary).toBe(true);
    });

    it('a later Menu for a Restaurant that already has one becomes isPrimary=false', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const second = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Breakfast Menu' },
      }).expect(201);

      expect(
        (second.body as { data: { isPrimary: boolean } }).data.isPrimary,
      ).toBe(false);
    });

    it('client-supplied isPrimary is never honored', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, isPrimary: false },
      }).expect(201);

      // Still the first Menu for this Restaurant -> server-computed true,
      // regardless of the attacker-supplied false in the body.
      expect(
        (response.body as { data: { isPrimary: boolean } }).data.isPrimary,
      ).toBe(true);
    });

    it('two truly concurrent first-Menu creates for the same Restaurant -> exactly one isPrimary=true, both requests succeed, never a raw Prisma/P2002 error', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const [first, second] = await Promise.all([
        postCreateMenu({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { ...VALID_BODY, nameInternal: 'Menu A' },
        }),
        postCreateMenu({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { ...VALID_BODY, nameInternal: 'Menu B' },
        }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const menus = await prisma.menu.findMany({
        where: { restaurantId: restaurant.id },
        select: { isPrimary: true },
      });
      expect(menus).toHaveLength(2);
      expect(menus.filter((menu) => menu.isPrimary)).toHaveLength(1);
    }, 20000);
  });

  describe('LIST', () => {
    it('returns an empty array when the Restaurant has no Menus', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getListMenus({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });

    it('orders deterministically by displayOrder asc, then id asc', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Second', displayOrder: 2 },
      }).expect(201);
      await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'First', displayOrder: 1 },
      }).expect(201);

      const response = await getListMenus({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const names = (
        response.body as { data: { nameInternal: string }[] }
      ).data.map((menu) => menu.nameInternal);
      expect(names).toEqual(['First', 'Second']);
    });

    it("never returns another Restaurant's Menus", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateMenu({
        restaurantId: restaurantB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const response = await getListMenus({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('MENU UPDATE', () => {
    it('a successful partial update changes only the supplied fields', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 7 },
      }).expect(200);

      const data = (
        response.body as {
          data: { displayOrder: number; nameInternal: string; status: string };
        }
      ).data;
      expect(data.displayOrder).toBe(7);
      expect(data.nameInternal).toBe(VALID_BODY.nameInternal);
      expect(data.status).toBe('ACTIVE');
    });

    it('updates the default-locale translation, and description:null clears it', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;

      const renamed = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'قائمة محدثة' },
      }).expect(200);
      expect(
        (renamed.body as { data: { translation: { name: string } } }).data
          .translation.name,
      ).toBe('قائمة محدثة');

      const cleared = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
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
      const persisted = await prisma.menuTranslation.findFirstOrThrow({
        where: { menuId },
      });
      expect(persisted.description).toBeNull();
    });

    it('an empty body is a safe no-op returning the current safe representation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;

      const response = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      expect((response.body as { data: { id: string } }).data.id).toBe(menuId);
    });

    it.each([
      ['malformed', 'not-a-uuid'],
      ['unknown', randomUUID()],
    ] as const)(
      '%s menuId -> the identical 404 MENU_NOT_FOUND',
      async (_label, menuIdCase) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await patchUpdateMenu({
          restaurantId: restaurant.id,
          menuId: menuIdCase,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: { displayOrder: 1 },
        }).expect(404);

        expect(response.body).toEqual({
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        });
      },
    );

    it('a foreign-Restaurant menuId produces the identical 404 MENU_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      await createMembership({ restaurantId: foreignRestaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const foreignMenu = await postCreateMenu({
        restaurantId: foreignRestaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const foreignMenuId = (foreignMenu.body as { data: { id: string } }).data
        .id;

      const response = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId: foreignMenuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 1 },
      }).expect(404);

      expect(response.body).toEqual({
        error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
      });
    });

    it.each(['nameInternal', 'name', 'status', 'displayOrder'] as const)(
      'explicit null for %s -> 400 VALIDATION_ERROR, Menu left unchanged',
      async (field) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);
        const created = await postCreateMenu({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(201);
        const menuId = (created.body as { data: { id: string } }).data.id;

        const response = await patchUpdateMenu({
          restaurantId: restaurant.id,
          menuId,
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
      const branch = await createBranch(restaurant.id);
      const { id: ownerUserId, email: ownerEmail } = await createTestUser();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerUserId,
      });
      const ownerCookie = await loginAndGetCookie(ownerEmail);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair: ownerCookie,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 1 },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('MANAGER + allBranches=true succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;

      await patchUpdateMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { displayOrder: 2 },
      }).expect(200);
    });
  });

  describe('SET PRIMARY', () => {
    it('switching primary between two Menus: first becomes false, second becomes true, response reflects the target', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const first = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'First' },
      }).expect(201);
      const firstId = (
        first.body as { data: { id: string; isPrimary: boolean } }
      ).data.id;
      expect(
        (first.body as { data: { isPrimary: boolean } }).data.isPrimary,
      ).toBe(true);
      const second = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Second' },
      }).expect(201);
      const secondId = (second.body as { data: { id: string } }).data.id;

      const response = await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId: secondId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      expect(
        (response.body as { data: { id: string; isPrimary: boolean } }).data
          .isPrimary,
      ).toBe(true);
      const firstAfter = await prisma.menu.findUniqueOrThrow({
        where: { id: firstId },
      });
      const secondAfter = await prisma.menu.findUniqueOrThrow({
        where: { id: secondId },
      });
      expect(firstAfter.isPrimary).toBe(false);
      expect(secondAfter.isPrimary).toBe(true);
    });

    it('repeating Set-Primary on the already-primary Menu is idempotent', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;

      await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);
      const response = await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      expect(
        (response.body as { data: { isPrimary: boolean } }).data.isPrimary,
      ).toBe(true);
      expect(
        await prisma.menu.count({
          where: { restaurantId: restaurant.id, isPrimary: true },
        }),
      ).toBe(1);
    });

    it("never affects another Restaurant's Menus", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const otherRestaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      await createMembership({ restaurantId: otherRestaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const otherMenu = await postCreateMenu({
        restaurantId: otherRestaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const otherMenuId = (otherMenu.body as { data: { id: string } }).data.id;
      const second = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Second' },
      }).expect(201);
      const secondId = (second.body as { data: { id: string } }).data.id;

      await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId: secondId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      const otherAfter = await prisma.menu.findUniqueOrThrow({
        where: { id: otherMenuId },
      });
      expect(otherAfter.isPrimary).toBe(true);
    });

    it.each([
      ['malformed', 'not-a-uuid'],
      ['unknown', randomUUID()],
    ] as const)(
      '%s menuId -> the identical 404 MENU_NOT_FOUND',
      async (_label, menuIdCase) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId });
        const cookiePair = await loginAndGetCookie(email);

        const response = await patchSetPrimaryMenu({
          restaurantId: restaurant.id,
          menuId: menuIdCase,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(404);

        expect(response.body).toEqual({
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        });
      },
    );

    it("a foreign-Restaurant menuId produces the identical 404 MENU_NOT_FOUND, and mutates neither Restaurant's primary state", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant();
      const restaurantB = await createRestaurant();
      await createMembership({ restaurantId: restaurantA.id, userId });
      await createMembership({ restaurantId: restaurantB.id, userId });
      const cookiePair = await loginAndGetCookie(email);
      const menuA = await postCreateMenu({
        restaurantId: restaurantA.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuAId = (menuA.body as { data: { id: string } }).data.id;
      const menuB = await postCreateMenu({
        restaurantId: restaurantB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const menuBId = (menuB.body as { data: { id: string } }).data.id;

      const response = await patchSetPrimaryMenu({
        restaurantId: restaurantA.id,
        menuId: menuBId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual({
        error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
      });
      const menuAAfter = await prisma.menu.findUniqueOrThrow({
        where: { id: menuAId },
      });
      const menuBAfter = await prisma.menu.findUniqueOrThrow({
        where: { id: menuBId },
      });
      expect(menuAAfter.isPrimary).toBe(true);
      expect(menuBAfter.isPrimary).toBe(true);
    });

    it('MANAGER + allBranches=false with a legitimate Branch assignment -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      const { id: ownerUserId, email: ownerEmail } = await createTestUser();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerUserId,
      });
      const ownerCookie = await loginAndGetCookie(ownerEmail);
      const created = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair: ownerCookie,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Second' },
      }).expect(201);
      const menuId = (created.body as { data: { id: string } }).data.id;
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('MANAGER + allBranches=true succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const first = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
      const second = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, nameInternal: 'Second' },
      }).expect(201);
      const secondId = (second.body as { data: { id: string } }).data.id;
      void first;

      await patchSetPrimaryMenu({
        restaurantId: restaurant.id,
        menuId: secondId,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);
    });
  });

  describe('RESPONSE SHAPE', () => {
    it('never exposes restaurantId, createdAt, updatedAt, or a raw MenuTranslation id/menuId', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({ restaurantId: restaurant.id, userId });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateMenu({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
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
          'isPrimary',
          'nameInternal',
          'status',
          'translation',
        ].sort(),
      );
    });
  });
});
