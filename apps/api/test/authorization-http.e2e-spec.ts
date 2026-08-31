import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { BranchAccessContext } from './../src/auth/context/branch-access.service';
import type { RestaurantAccessContext } from './../src/auth/context/restaurant-access.service';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { TenantProtectedTestModule } from './fixtures/tenant-protected.module';

interface BranchProtectedResponseBody {
  data: {
    restaurantAccess: RestaurantAccessContext;
    branchAccess: BranchAccessContext;
  };
}

/**
 * Proves the real wiring for Authorization Foundation G: HTTP Cookie ->
 * AuthGuard -> RestaurantAccessGuard -> BranchAccessGuard -> PostgreSQL,
 * through the TEST-ONLY `TenantProtectedTestController` (never part of the
 * production AppModule).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession rows and
 * removes them -- respecting `onDelete: Restrict` -- in afterEach, so the
 * database returns to its empty state regardless of test outcome.
 */
describe('Restaurant/Branch authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
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
  const BRANCH_NOT_FOUND_BODY = {
    error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
  };
  const BRANCH_ACCESS_DENIED_BODY = {
    error: {
      code: 'BRANCH_ACCESS_DENIED',
      message: 'You do not have access to this Branch.',
    },
  };
  const BRANCH_NOT_OPERATIONAL_BODY = {
    error: {
      code: 'BRANCH_NOT_OPERATIONAL',
      message: 'Branch is not currently operational.',
    },
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
    const uniqueEmail = `authz-${randomUUID()}@example.test`;
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
  ) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name: 'Cairo Bites',
        status,
        defaultLocale: 'ar',
        currencyCode: 'EGP',
      },
    });
    createdRestaurantIds.push(restaurant.id);
    return restaurant;
  }

  async function createBranch(
    restaurantId: string,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ) {
    return prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId,
        name: 'Maadi',
        status,
        timezone: 'Africa/Cairo',
      },
    });
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
    status?: 'ACTIVE' | 'INVITED' | 'DISABLED';
    allBranches: boolean;
  }) {
    return prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role ?? 'OWNER',
        status: params.status ?? 'ACTIVE',
        allBranches: params.allBranches,
      },
    });
  }

  /** Logs in for real via the HTTP endpoint and returns the raw session cookie pair. */
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

  function getRestaurantProtected(restaurantId: string, cookiePair?: string) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/test/restaurants/${restaurantId}/protected`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  function getBranchProtected(
    restaurantId: string,
    branchId: string,
    cookiePair?: string,
  ) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/test/restaurants/${restaurantId}/branches/${branchId}/protected`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  describe('A. missing session', () => {
    it('returns the existing UNAUTHENTICATED 401', async () => {
      const restaurant = await createRestaurant('ACTIVE');

      const response = await getRestaurantProtected(restaurant.id).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('B. valid User + ACTIVE Membership + ACTIVE Restaurant', () => {
    it('succeeds with the safe Restaurant context', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getRestaurantProtected(
        restaurant.id,
        cookiePair,
      ).expect(200);

      expect(response.body).toEqual({
        data: {
          restaurantAccess: {
            membershipId: membership.id,
            restaurantId: restaurant.id,
            role: 'MANAGER',
            allBranches: true,
          },
        },
      });
    });
  });

  describe('C. User A requests Restaurant B', () => {
    it('returns the approved safe failure: 404 RESTAURANT_NOT_FOUND, no foreign data', async () => {
      const userA = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurantA.id,
        userId: userA.id,
        allBranches: true,
      });
      const restaurantB = await createRestaurant('ACTIVE');
      const cookiePairA = await loginAndGetCookie(userA.email);

      const response = await getRestaurantProtected(
        restaurantB.id,
        cookiePairA,
      ).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });
  });

  describe('D. Membership becomes DISABLED after authentication', () => {
    it('the next request fails authorization with 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      await getRestaurantProtected(restaurant.id, cookiePair).expect(200);

      await prisma.restaurantMembership.update({
        where: { id: membership.id },
        data: { status: 'DISABLED' },
      });

      const response = await getRestaurantProtected(
        restaurant.id,
        cookiePair,
      ).expect(404);
      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });
  });

  describe('E/F. Restaurant becomes INACTIVE / SUSPENDED', () => {
    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'authorized Restaurant %s -> 409 RESTAURANT_NOT_OPERATIONAL',
      async (status) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant(status);
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getRestaurantProtected(
          restaurant.id,
          cookiePair,
        ).expect(409);

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      },
    );

    it('the next request reflects a live status change from ACTIVE to SUSPENDED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      await getRestaurantProtected(restaurant.id, cookiePair).expect(200);

      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { status: 'SUSPENDED' },
      });

      const response = await getRestaurantProtected(
        restaurant.id,
        cookiePair,
      ).expect(409);
      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });
  });

  describe('G. allBranches=true + ACTIVE same-Restaurant Branch', () => {
    it('succeeds with the safe Branch context', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(200);

      expect(
        (response.body as BranchProtectedResponseBody).data.branchAccess,
      ).toEqual({ branchId: branch.id });
    });
  });

  describe('H. allBranches=true + foreign Restaurant Branch', () => {
    it('404 BRANCH_NOT_FOUND, never authorized via allBranches', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const foreignRestaurant = await createRestaurant('ACTIVE');
      const foreignBranch = await createBranch(foreignRestaurant.id, 'ACTIVE');
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        foreignBranch.id,
        cookiePair,
      ).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });
  });

  describe('I. allBranches=false + assigned same-Restaurant Branch', () => {
    it('succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId: branch.id },
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(200);

      expect(
        (response.body as BranchProtectedResponseBody).data.branchAccess,
      ).toEqual({ branchId: branch.id });
    });
  });

  describe('J. allBranches=false + unassigned Branch', () => {
    it('403 BRANCH_ACCESS_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });
  });

  describe('K. allBranches=false + zero assignments', () => {
    it('fails Branch access with 403 BRANCH_ACCESS_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });
  });

  describe('L. malformed cross-Restaurant RestaurantMembershipBranch assignment', () => {
    it('never authorizes the foreign Branch -> 404 BRANCH_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const foreignRestaurant = await createRestaurant('ACTIVE');
      const foreignBranch = await createBranch(foreignRestaurant.id, 'ACTIVE');
      // Directly creates the malformed row: schema cannot prevent this
      // (AUTH_TENANCY_SPEC.md #61A) -- the read boundary must defend itself.
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: membership.id,
          branchId: foreignBranch.id,
        },
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        foreignBranch.id,
        cookiePair,
      ).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      expect(JSON.stringify(response.body)).not.toContain(foreignBranch.id);
    });
  });

  describe('M. assigned Branch becomes INACTIVE', () => {
    it('409 BRANCH_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId: branch.id },
      });
      const cookiePair = await loginAndGetCookie(email);
      await getBranchProtected(restaurant.id, branch.id, cookiePair).expect(
        200,
      );

      await prisma.branch.update({
        where: { id: branch.id },
        data: { status: 'INACTIVE' },
      });

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(409);
      expect(response.body).toEqual(BRANCH_NOT_OPERATIONAL_BODY);
    });

    it('same-Restaurant + unassigned + INACTIVE Branch -> 403, NOT 409', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(403);
      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('foreign INACTIVE Branch -> 404, NOT 409', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const foreignRestaurant = await createRestaurant('ACTIVE');
      const foreignBranch = await createBranch(
        foreignRestaurant.id,
        'INACTIVE',
      );
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranchProtected(
        restaurant.id,
        foreignBranch.id,
        cookiePair,
      ).expect(404);
      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });
  });

  describe('N. assignment removed after a previous successful request', () => {
    it('the next request fails -- no stale authorization cache', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await prisma.restaurantMembershipBranch.create({
        data: { restaurantMembershipId: membership.id, branchId: branch.id },
      });
      const cookiePair = await loginAndGetCookie(email);
      await getBranchProtected(restaurant.id, branch.id, cookiePair).expect(
        200,
      );

      await prisma.restaurantMembershipBranch.delete({
        where: {
          restaurantMembershipId_branchId: {
            restaurantMembershipId: membership.id,
            branchId: branch.id,
          },
        },
      });

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(403);
      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('allBranches true -> false is honored on the very next request', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      await getBranchProtected(restaurant.id, branch.id, cookiePair).expect(
        200,
      );

      await prisma.restaurantMembership.update({
        where: { id: membership.id },
        data: { allBranches: false },
      });

      const response = await getBranchProtected(
        restaurant.id,
        branch.id,
        cookiePair,
      ).expect(403);
      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });
  });

  describe('cross-Tenant serialized response leakage', () => {
    it('no foreign Restaurant name, Branch name, Membership ID, or Role appears in any failure body', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const foreignRestaurant = await prisma.restaurant.create({
        data: {
          publicId: `rest-${randomUUID()}`,
          name: 'Secret Foreign Restaurant Name',
          status: 'ACTIVE',
          defaultLocale: 'ar',
          currencyCode: 'EGP',
        },
      });
      createdRestaurantIds.push(foreignRestaurant.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getRestaurantProtected(
        foreignRestaurant.id,
        cookiePair,
      ).expect(404);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('Secret Foreign Restaurant Name');
      expect(serialized).not.toMatch(/membership/i);
      expect(serialized).not.toMatch(/OWNER/);
      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });
  });
});
