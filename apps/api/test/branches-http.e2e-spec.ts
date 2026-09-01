import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Business Foundation J: proves the first production Staff business
 * vertical end-to-end through the real
 * `GET /api/v1/restaurants/{restaurantId}/branches` endpoint -- HTTP Cookie
 * -> AuthGuard -> RestaurantAccessGuard -> PermissionGuard -> BranchesService
 * -> PrismaService -> PostgreSQL.
 *
 * Read-only: no CsrfGuard applies (AUTH_TENANCY_SPEC.md #106A), so the CSRF
 * and mutation-Tenant-scoping test categories in the Foundation J test plan
 * do not apply to this vertical -- covered instead by read-side Tenant
 * isolation (cross-Restaurant leakage) below.
 *
 * The list honors the caller's current ACTIVE RestaurantMembership Branch
 * scope (AUTH_TENANCY_SPEC.md #63A): allBranches=true sees every Restaurant
 * Branch, allBranches=false sees only explicitly assigned Branches (empty
 * scope -> empty list, never a fallback to all Branches), and a malformed
 * cross-Restaurant assignment can never surface a foreign Branch.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession rows and
 * removes them -- respecting `onDelete: Restrict` -- in afterEach, so the
 * database returns to its empty state regardless of test outcome.
 */
describe('GET /api/v1/restaurants/:restaurantId/branches (e2e)', () => {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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
    const uniqueEmail = `branches-${randomUUID()}@example.test`;
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
    name = 'Cairo Bites',
  ) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name,
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
    name = 'Maadi',
  ) {
    return prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId,
        name,
        status,
        timezone: 'Africa/Cairo',
        phone: '+20 100 000 0000',
        address: '1 Nile Street',
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

  async function createAssignment(membershipId: string, branchId: string) {
    return prisma.restaurantMembershipBranch.create({
      data: { restaurantMembershipId: membershipId, branchId },
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

  function getBranches(restaurantId: string, cookiePair?: string) {
    const req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${restaurantId}/branches`,
    );
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  describe('A. missing session', () => {
    it('returns the existing UNAUTHENTICATED 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getBranches(restaurant.id).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('B. foreign Restaurant', () => {
    it('404 RESTAURANT_NOT_FOUND, existence-hiding', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant('ACTIVE', 'Other Place');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(
        foreignRestaurant.id,
        cookiePair,
      ).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });
  });

  describe('C. non-operational Restaurant', () => {
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

        const response = await getBranches(restaurant.id, cookiePair).expect(
          409,
        );

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      },
    );
  });

  describe('D. allowed Permission -- every V1 Role holds branches.view', () => {
    it.each(['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s -> 200 with the Restaurant Branch list',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const branch = await createBranch(restaurant.id, 'ACTIVE', 'Maadi');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role,
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await getBranches(restaurant.id, cookiePair).expect(
          200,
        );

        expect(response.body).toEqual({
          data: [{ id: branch.id, name: 'Maadi', status: 'ACTIVE' }],
        });
      },
    );
  });

  describe('E. INACTIVE Branches are included, not hidden', () => {
    it('returns both ACTIVE and INACTIVE Branches', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const activeBranch = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const inactiveBranch = await createBranch(restaurant.id, 'INACTIVE', 'B');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: { id: string; status: string }[] })
        .data;
      expect(data.map((b) => b.id).sort()).toEqual(
        [activeBranch.id, inactiveBranch.id].sort(),
      );
      expect(data.find((b) => b.id === inactiveBranch.id)?.status).toBe(
        'INACTIVE',
      );
    });
  });

  describe('F. Restaurant with zero Branches', () => {
    it('200 with an empty array, not an error', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('G. cross-Tenant isolation', () => {
    it('Restaurant B Branches never appear when listing Restaurant A', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchA = await createBranch(restaurantA.id, 'ACTIVE', 'A Branch');
      const branchB = await createBranch(restaurantB.id, 'ACTIVE', 'B Branch');
      await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurantA.id, cookiePair).expect(
        200,
      );

      const data = (response.body as { data: { id: string }[] }).data;
      expect(data.map((b) => b.id)).toEqual([branchA.id]);
      expect(JSON.stringify(response.body)).not.toContain(branchB.id);
    });
  });

  describe('H. Branch collection honors Membership Branch scope (AUTH_TENANCY_SPEC.md #63A)', () => {
    it('A. allBranches=true -> sees every Branch in the authorized Restaurant', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchOne = await createBranch(restaurant.id, 'ACTIVE', 'One');
      const branchTwo = await createBranch(restaurant.id, 'ACTIVE', 'Two');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: { id: string }[] }).data;
      expect(data.map((b) => b.id).sort()).toEqual(
        [branchOne.id, branchTwo.id].sort(),
      );
    });

    it('B. allBranches=false with one assigned Branch -> sees only that Branch', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const assigned = await createBranch(restaurant.id, 'ACTIVE', 'Assigned');
      await createBranch(restaurant.id, 'ACTIVE', 'Unassigned');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await createAssignment(membership.id, assigned.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      expect(response.body).toEqual({
        data: [{ id: assigned.id, name: 'Assigned', status: 'ACTIVE' }],
      });
    });

    it('C. allBranches=false with multiple assigned Branches -> sees exactly those Branches', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const assignedOne = await createBranch(restaurant.id, 'ACTIVE', 'One');
      const assignedTwo = await createBranch(restaurant.id, 'ACTIVE', 'Two');
      await createBranch(restaurant.id, 'ACTIVE', 'Unassigned');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await createAssignment(membership.id, assignedOne.id);
      await createAssignment(membership.id, assignedTwo.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: { id: string }[] }).data;
      expect(data.map((b) => b.id).sort()).toEqual(
        [assignedOne.id, assignedTwo.id].sort(),
      );
    });

    it('D. allBranches=false with zero assignments -> 200 { data: [] }, never falls back to all Restaurant Branches', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createBranch(restaurant.id, 'ACTIVE', 'Exists');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      expect(response.body).toEqual({ data: [] });
    });

    it('E. same-Restaurant INACTIVE assigned Branch -> included with INACTIVE status', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const inactiveAssigned = await createBranch(
        restaurant.id,
        'INACTIVE',
        'Inactive Assigned',
      );
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await createAssignment(membership.id, inactiveAssigned.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      expect(response.body).toEqual({
        data: [
          {
            id: inactiveAssigned.id,
            name: 'Inactive Assigned',
            status: 'INACTIVE',
          },
        ],
      });
    });

    it('F. unassigned same-Restaurant Branch -> not returned', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const assigned = await createBranch(restaurant.id, 'ACTIVE', 'Assigned');
      const unassigned = await createBranch(
        restaurant.id,
        'ACTIVE',
        'Unassigned',
      );
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await createAssignment(membership.id, assigned.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: { id: string }[] }).data;
      expect(data.map((b) => b.id)).toEqual([assigned.id]);
      expect(JSON.stringify(response.body)).not.toContain(unassigned.id);
    });

    it('G. malformed cross-Restaurant assignment -> foreign Branch not returned', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const membership = await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: false,
      });
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const foreignBranch = await createBranch(
        restaurantB.id,
        'ACTIVE',
        'Foreign',
      );
      // The schema cannot prevent this at the column level
      // (AUTH_TENANCY_SPEC.md #61A) -- directly creates the malformed row to
      // prove the read boundary defends itself regardless.
      await createAssignment(membership.id, foreignBranch.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurantA.id, cookiePair).expect(
        200,
      );

      expect(response.body).toEqual({ data: [] });
      expect(JSON.stringify(response.body)).not.toContain(foreignBranch.id);
    });

    it('H. Role does not expand Branch scope -- a Role holding branches.view still only sees its own Membership scope', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const assigned = await createBranch(restaurant.id, 'ACTIVE', 'Assigned');
      await createBranch(restaurant.id, 'ACTIVE', 'Unassigned');
      // OWNER holds every Permission including branches.view, but scope here
      // comes from allBranches/assignment, never from Role.
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: false,
      });
      await createAssignment(membership.id, assigned.id);
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      expect(response.body).toEqual({
        data: [{ id: assigned.id, name: 'Assigned', status: 'ACTIVE' }],
      });
    });
  });

  describe('I. response field safety', () => {
    it('exposes only id, name, and status -- never restaurantId, timezone, phone, address, or timestamps', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createBranch(restaurant.id, 'ACTIVE', 'Maadi');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: Record<string, unknown>[] }).data;
      expect(data).toHaveLength(1);
      expect(Object.keys(data[0]).sort()).toEqual(['id', 'name', 'status']);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/timezone/i);
      expect(serialized).not.toMatch(/phone/i);
      expect(serialized).not.toMatch(/address/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
    });
  });

  describe('J. deterministic ordering', () => {
    it('Branches are ordered by id ascending', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchOne = await createBranch(restaurant.id, 'ACTIVE', 'One');
      const branchTwo = await createBranch(restaurant.id, 'ACTIVE', 'Two');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getBranches(restaurant.id, cookiePair).expect(200);

      const data = (response.body as { data: { id: string }[] }).data;
      expect(data.map((b) => b.id)).toEqual(
        [branchOne.id, branchTwo.id].sort(),
      );
    });
  });
});
