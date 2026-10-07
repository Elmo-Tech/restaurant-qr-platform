import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import type { AuthContext } from './../src/auth/context/auth-context.service';
import { ROLE_PERMISSIONS } from './../src/auth/permission/role-permissions';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';

interface MeResponseBody {
  data: AuthContext;
}

/**
 * Proves the real wiring for Auth Foundation F: HTTP Cookie -> AuthGuard ->
 * AuthContextService -> PrismaService -> PostgreSQL, through the real
 * production `GET /api/v1/auth/me` endpoint.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession rows and
 * removes them -- respecting `onDelete: Restrict` -- in afterEach, so the
 * database returns to its empty state regardless of test outcome.
 */
describe('GET /api/v1/auth/me (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const UNAUTHENTICATED_BODY = {
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
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

  async function createTestUser(
    status: 'ACTIVE' | 'DISABLED' | 'INVITED' = 'ACTIVE',
  ): Promise<{ id: string; email: string }> {
    const uniqueEmail = `auth-me-${randomUUID()}@example.test`;
    const passwordHash = await passwordHasherService.hashPassword(PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        emailNormalized: uniqueEmail.toLowerCase(),
        passwordHash,
        status,
      },
    });
    createdUserIds.push(user.id);

    return { id: user.id, email: uniqueEmail };
  }

  async function createRestaurant(
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' = 'ACTIVE',
    name = 'Cairo Bites',
    defaultLocale = 'ar',
    currencyCode = 'EGP',
  ) {
    const restaurant = await prisma.restaurant.create({
      data: {
        publicId: `rest-${randomUUID()}`,
        name,
        status,
        defaultLocale,
        currencyCode,
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
        roleId: (await ensureStarterRole(prisma, params.restaurantId, params.role ?? 'OWNER')).id,
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

  function getMe(cookiePair?: string) {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  /** Calls the real endpoint, asserts 200, and returns the typed AuthContext. */
  async function getMeData(cookiePair: string): Promise<AuthContext> {
    const response = await getMe(cookiePair).expect(200);
    return (response.body as MeResponseBody).data;
  }

  describe('missing authentication', () => {
    it('no session cookie -> exact UNAUTHENTICATED 401', async () => {
      const response = await getMe().expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('valid ACTIVE User + zero ACTIVE memberships', () => {
    it('200 with empty memberships array', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const cookiePair = await loginAndGetCookie(email);

      const response = await getMe(cookiePair).expect(200);

      expect(response.body).toEqual({
        data: {
          user: { id: userId, email, preferredLocale: null },
          memberships: [],
        },
      });
    });

    it('never leaks passwordHash, tokenHash, or the raw session token', async () => {
      const { email } = await createTestUser('ACTIVE');
      const cookiePair = await loginAndGetCookie(email);
      const rawToken = cookiePair.split('=')[1];

      const response = await getMe(cookiePair).expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(rawToken);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/tokenHash/i);
    });
  });

  describe('ACTIVE Membership + ACTIVE Restaurant', () => {
    it('membership is returned with restaurant.status ACTIVE', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].restaurant).toMatchObject({
        id: restaurant.id,
        status: 'ACTIVE',
      });
    });
  });

  describe('ACTIVE Membership + INACTIVE Restaurant', () => {
    it('membership is still returned with restaurant.status INACTIVE, HTTP 200', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].restaurant.status).toBe('INACTIVE');
    });
  });

  describe('ACTIVE Membership + SUSPENDED Restaurant', () => {
    it('membership is still returned with restaurant.status SUSPENDED, HTTP 200', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('SUSPENDED');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].restaurant.status).toBe('SUSPENDED');
    });
  });

  describe('INVITED and DISABLED memberships are excluded', () => {
    it('an INVITED membership does not appear in /auth/me', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
        status: 'INVITED',
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toEqual([]);
    });

    it('a DISABLED membership does not appear in /auth/me', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
        status: 'DISABLED',
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toEqual([]);
    });
  });

  describe('Branch scope: allBranches=true', () => {
    it('returns every Restaurant Branch, ACTIVE and INACTIVE alike', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      const activeBranch = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const inactiveBranch = await createBranch(restaurant.id, 'INACTIVE', 'B');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      const branches = data.memberships[0].branches;
      expect(branches.map((b) => b.id).sort()).toEqual(
        [activeBranch.id, inactiveBranch.id].sort(),
      );
      expect(branches.find((b) => b.id === inactiveBranch.id)?.status).toBe(
        'INACTIVE',
      );
    });
  });

  describe('Branch scope: allBranches=false', () => {
    it('returns only the assigned Branches, regardless of ACTIVE/INACTIVE status', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      const assignedInactive = await createBranch(
        restaurant.id,
        'INACTIVE',
        'Assigned',
      );
      await createBranch(restaurant.id, 'ACTIVE', 'Unassigned');
      const membership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: membership.id,
          branchId: assignedInactive.id,
        },
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships[0].branches).toEqual([
        { id: assignedInactive.id, name: 'Assigned', status: 'INACTIVE' },
      ]);
    });

    it('zero assignment rows -> branches: [], HTTP 200 (not interpreted as all Branches)', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships[0].branches).toEqual([]);
    });
  });

  describe('all authorized Branches INACTIVE', () => {
    it('membership and its Branches both remain present with INACTIVE status', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toHaveLength(1);
      const branches = data.memberships[0].branches;
      expect(branches).toHaveLength(1);
      expect(branches[0].status).toBe('INACTIVE');
    });
  });

  describe('cross-Tenant / cross-User leakage', () => {
    it('User A never receives Restaurant/Membership/Branch data belonging to User B', async () => {
      const userA = await createTestUser('ACTIVE');
      const userB = await createTestUser('ACTIVE');
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchB = await createBranch(restaurantB.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurantA.id,
        userId: userA.id,
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurantB.id,
        userId: userB.id,
        allBranches: true,
      });
      const cookiePairA = await loginAndGetCookie(userA.email);

      const data = await getMeData(cookiePairA);

      expect(data.user.id).toBe(userA.id);
      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].restaurant.id).toBe(restaurantA.id);
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain(restaurantB.id);
      expect(serialized).not.toContain(branchB.id);
      expect(serialized).not.toContain(userB.id);
    });
  });

  describe('cross-Restaurant RestaurantMembershipBranch invariant', () => {
    it('a malformed assignment linking Membership A to a Branch in Restaurant B is never exposed', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const membershipA = await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: false,
      });
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchB = await createBranch(restaurantB.id, 'ACTIVE', 'Branch B');

      // The schema does not (and per DATABASE_SPEC.md/AUTH_TENANCY_SPEC.md
      // #61 cannot) enforce same-Restaurant ownership as a column
      // constraint -- it is an application/domain invariant. This directly
      // creates the malformed cross-Restaurant row to prove the READ
      // boundary defends itself regardless.
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: membershipA.id,
          branchId: branchB.id,
        },
      });

      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].id).toBe(membershipA.id);
      // Membership A has no legitimate same-Restaurant assignments, so its
      // branches must be empty -- Branch B must never appear here or
      // anywhere else in the response.
      expect(data.memberships[0].branches).toEqual([]);
      expect(JSON.stringify(data)).not.toContain(branchB.id);
    });
  });

  describe('multiple authorized memberships', () => {
    it('returns every authorized membership, each correctly scoped', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurantB.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      const restaurantIds = data.memberships.map((m) => m.restaurant.id);
      expect(restaurantIds.sort()).toEqual(
        [restaurantA.id, restaurantB.id].sort(),
      );
    });
  });

  describe('deterministic ordering', () => {
    it('memberships and their branches are ordered by id ascending', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      const branchOne = await createBranch(restaurant.id, 'ACTIVE', 'One');
      const branchTwo = await createBranch(restaurant.id, 'ACTIVE', 'Two');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      const branchIds = data.memberships[0].branches.map((b) => b.id);
      const expectedOrder = [branchOne.id, branchTwo.id].sort();
      expect(branchIds).toEqual(expectedOrder);
    });
  });

  describe('Batch G0: permissions + Restaurant currencyCode/defaultLocale', () => {
    it('membership.permissions equals the canonical effective set for its Role', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships[0].permissions).toEqual([
        ...ROLE_PERMISSIONS.MANAGER,
      ]);
    });

    it('restaurant.currencyCode and restaurant.defaultLocale reflect the real Restaurant row, not a fixed default', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant(
        'ACTIVE',
        'Alex Grill',
        'en',
        'USD',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships[0].restaurant).toMatchObject({
        currencyCode: 'USD',
        defaultLocale: 'en',
      });
    });

    it('the public response exposes only the documented safe Restaurant fields -- no publicId, createdAt, or updatedAt', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(Object.keys(data.memberships[0].restaurant).sort()).toEqual(
        ['currencyCode', 'defaultLocale', 'id', 'logoAssetPath', 'name', 'status'].sort(),
      );
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain('publicId');
      expect(serialized).not.toContain('createdAt');
      expect(serialized).not.toContain('updatedAt');
    });

    it('a lower Role (WAITER) never receives a MANAGER/OWNER-only permission over the real HTTP response', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const restaurant = await createRestaurant('ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const data = await getMeData(cookiePair);

      expect(data.memberships[0].permissions).toEqual([
        ...ROLE_PERMISSIONS.WAITER,
      ]);
      expect(data.memberships[0].permissions).not.toContain('menu.manage');
    });
  });
});
