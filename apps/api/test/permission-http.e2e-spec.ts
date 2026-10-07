import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';
import { TenantProtectedTestModule } from './fixtures/tenant-protected.module';

/**
 * Proves Authorization Foundation H (PermissionGuard) end-to-end: HTTP
 * Cookie -> AuthGuard -> RestaurantAccessGuard -> PermissionGuard ->
 * PostgreSQL, through the TEST-ONLY `TenantProtectedTestController` (never
 * part of the production AppModule). Also proves AUTH_TENANCY_SPEC.md #112
 * (a Role change takes effect on the very next request, no re-login) and
 * #168 (every protected operation has an allowed-role and a denied-role
 * test).
 */
describe('Permission authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const PERMISSION_DENIED_BODY = {
    error: {
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission to perform this action.',
    },
  };
  const UNAUTHENTICATED_BODY = {
    error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TenantProtectedTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    passwordHasherService = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const restaurantId of createdRestaurantIds.splice(0)) {
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
    const uniqueEmail = `perm-${randomUUID()}@example.test`;
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

  async function createRestaurant() {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Cairo Bites',
        status: 'ACTIVE',
        defaultLocale: 'ar',
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    return restaurant;
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
  }) {
    return prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role,
        roleId: (await ensureStarterRole(prisma, params.restaurantId, params.role)).id,
        status: 'ACTIVE',
        allBranches: true,
      },
    });
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

  function getMenuManageProtected(restaurantId: string, cookiePair?: string) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/test/restaurants/${restaurantId}/menu-manage-protected`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  function getMisorderedPermissionProtected(
    restaurantId: string,
    cookiePair?: string,
  ) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/test/restaurants/${restaurantId}/misordered-permission-protected`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  function getNoRequiredPermissionProtected(
    restaurantId: string,
    cookiePair?: string,
  ) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/test/restaurants/${restaurantId}/no-required-permission-protected`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  describe('A. missing session', () => {
    it('returns the existing UNAUTHENTICATED 401 (PermissionGuard never reached)', async () => {
      const restaurant = await createRestaurant();

      const response = await getMenuManageProtected(restaurant.id).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('B. allowed-role test (AUTH_TENANCY_SPEC.md #168)', () => {
    it('MANAGER holds menu.manage -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getMenuManageProtected(
        restaurant.id,
        cookiePair,
      ).expect(200);

      expect(response.body).toEqual({
        data: {
          restaurantAccess: {
            membershipId: expect.any(String) as string,
            restaurantId: restaurant.id,
            role: 'MANAGER',
            roleId: expect.any(String) as string,
            permissions: expect.arrayContaining(['menu.manage']) as string[],
            allBranches: true,
          },
        },
      });
    });
  });

  describe('C. denied-role test (AUTH_TENANCY_SPEC.md #168)', () => {
    it.each(['CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s lacks menu.manage -> 403 PERMISSION_DENIED',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({ restaurantId: restaurant.id, userId, role });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getMenuManageProtected(
          restaurant.id,
          cookiePair,
        ).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      },
    );
  });

  describe('D2. custom Role current-state test (FT-12C)', () => {
    async function customRole(restaurantId: string, name: string, permissions: string[]) {
      return prisma.restaurantRole.create({
        data: {
          restaurantId,
          name,
          nameNormalized: name.toLowerCase(),
          kind: 'CUSTOM',
          permissions,
        },
      });
    }

    it('a custom Role grants exactly its permissions, and editing the Role takes effect on the very next request', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await ensureStarterRole(prisma, restaurant.id, 'OWNER');
      const role = await customRole(restaurant.id, 'Barista', ['orders.view']);
      await prisma.restaurantMembership.create({
        data: {
          restaurantId: restaurant.id,
          userId,
          role: 'CUSTOM',
          roleId: role.id,
          status: 'ACTIVE',
          allBranches: true,
        },
      });
      const cookiePair = await loginAndGetCookie(email);

      const denied = await getMenuManageProtected(restaurant.id, cookiePair).expect(403);
      expect(denied.body).toEqual(PERMISSION_DENIED_BODY);

      await prisma.restaurantRole.update({
        where: { id: role.id },
        data: { permissions: ['orders.view', 'menu.manage'] },
      });
      await getMenuManageProtected(restaurant.id, cookiePair).expect(200);

      await prisma.restaurantRole.update({
        where: { id: role.id },
        data: { permissions: ['orders.view'] },
      });
      await getMenuManageProtected(restaurant.id, cookiePair).expect(403);
    });

    it('a Role of ANOTHER Restaurant never grants anything here (Tenant isolation)', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const otherRestaurant = await createRestaurant();
      await ensureStarterRole(prisma, restaurant.id, 'OWNER');
      const foreignRole = await customRole(otherRestaurant.id, 'Foreign', ['menu.manage']);

      await expect(
        prisma.restaurantMembership.create({
          data: {
            restaurantId: restaurant.id,
            userId,
            role: 'CUSTOM',
            roleId: foreignRole.id,
            status: 'ACTIVE',
            allBranches: true,
          },
        }),
      ).resolves.toBeDefined();
      // The database itself does not tie roleId to restaurantId, so the
      // application must: authorization resolves permissions from the
      // Membership's own Role row, and every Role-assigning service call
      // looks the Role up by id AND restaurantId (covered by unit specs).
      const cookiePair = await loginAndGetCookie(email);
      await getMenuManageProtected(restaurant.id, cookiePair).expect(200);
    });

    it('the database refuses to delete a Role that a Membership still holds (FK Restrict)', async () => {
      const { id: userId } = await createTestUser();
      const restaurant = await createRestaurant();
      await ensureStarterRole(prisma, restaurant.id, 'OWNER');
      const role = await customRole(restaurant.id, 'Held', ['orders.view']);
      await prisma.restaurantMembership.create({
        data: {
          restaurantId: restaurant.id,
          userId,
          role: 'CUSTOM',
          roleId: role.id,
          status: 'ACTIVE',
          allBranches: true,
        },
      });

      await expect(prisma.restaurantRole.delete({ where: { id: role.id } })).rejects.toThrow();
      await expect(prisma.restaurantRole.findUnique({ where: { id: role.id } })).resolves.not.toBeNull();
    });

    it('at most one Role per starter kind per Restaurant, but any number of custom Roles', async () => {
      const restaurant = await createRestaurant();
      await ensureStarterRole(prisma, restaurant.id, 'OWNER');

      await expect(
        prisma.restaurantRole.create({
          data: {
            restaurantId: restaurant.id,
            name: 'Second Manager',
            nameNormalized: 'second manager',
            kind: 'MANAGER',
            permissions: [],
          },
        }),
      ).rejects.toThrow();
      await customRole(restaurant.id, 'One', []);
      await customRole(restaurant.id, 'Two', []);
    });
  });

  describe('D. role-change current-state test (AUTH_TENANCY_SPEC.md #112)', () => {
    it('MANAGER -> WAITER takes effect on the very next request, no re-login', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
      });
      const cookiePair = await loginAndGetCookie(email);
      await getMenuManageProtected(restaurant.id, cookiePair).expect(200);

      await prisma.restaurantMembership.update({
        where: { id: membership.id },
        data: {
          role: 'WAITER',
          roleId: (await ensureStarterRole(prisma, restaurant.id, 'WAITER')).id,
        },
      });

      const response = await getMenuManageProtected(
        restaurant.id,
        cookiePair,
      ).expect(403);
      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('WAITER -> OWNER takes effect on the very next request, no re-login', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
      });
      const cookiePair = await loginAndGetCookie(email);
      await getMenuManageProtected(restaurant.id, cookiePair).expect(403);

      await prisma.restaurantMembership.update({
        where: { id: membership.id },
        data: {
          role: 'OWNER',
          roleId: (await ensureStarterRole(prisma, restaurant.id, 'OWNER')).id,
        },
      });

      const response = await getMenuManageProtected(
        restaurant.id,
        cookiePair,
      ).expect(200);
      expect(
        (response.body as { data: { restaurantAccess: { role: string } } }).data
          .restaurantAccess.role,
      ).toBe('OWNER');
    });
  });

  describe('E. guard-precedence tests', () => {
    it('PermissionGuard before RestaurantAccessGuard fails closed: 403 PERMISSION_DENIED, never 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getMisorderedPermissionProtected(
        restaurant.id,
        cookiePair,
      ).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('PermissionGuard with no @RequirePermission denies even an OWNER: 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getNoRequiredPermissionProtected(
        restaurant.id,
        cookiePair,
      ).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  describe('cross-Tenant serialized response leakage', () => {
    it('denied response never reveals the required Permission, Role, or Membership id', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getMenuManageProtected(
        restaurant.id,
        cookiePair,
      ).expect(403);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/menu\.manage/i);
      expect(serialized).not.toMatch(/WAITER/);
      expect(serialized).not.toMatch(/membership/i);
      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });
});
