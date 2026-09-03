import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { StaffService } from './../src/staff/staff.service';

/**
 * Business Foundation R: proves the Restaurant Staff Membership List
 * end-to-end through the real
 * `GET /api/v1/restaurants/{restaurantId}/memberships` endpoint -- HTTP
 * Cookie -> AuthGuard -> RestaurantAccessGuard -> PermissionGuard ->
 * StaffService -> PrismaService -> PostgreSQL.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession rows and
 * removes them in afterEach, so the database returns to its empty state
 * regardless of test outcome.
 */
describe('GET /api/v1/restaurants/:restaurantId/memberships (e2e)', () => {
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
  const PERMISSION_DENIED_BODY = {
    error: {
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission to perform this action.',
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

  async function createTestUser(
    emailPrefix = 'staff-list',
  ): Promise<{ id: string; email: string }> {
    const uniqueEmail = `${emailPrefix}-${randomUUID()}@example.test`;
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
      },
    });
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
    status?: 'ACTIVE' | 'INVITED' | 'DISABLED';
    allBranches: boolean;
    branchIds?: string[];
  }) {
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role ?? 'OWNER',
        status: params.status ?? 'ACTIVE',
        allBranches: params.allBranches,
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

  function getStaffList(params: { restaurantId: string; cookiePair?: string }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/memberships`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  interface StaffListResponseBody {
    data: {
      id: string;
      user: { id: string; email: string };
      role: string;
      status: string;
      allBranches: boolean;
      branches: { id: string; name: string; status: string }[];
    }[];
  }

  describe('OWNER / allBranches=true', () => {
    it('sees the full Restaurant Staff Membership list', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const { id: cashierId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId: cashierId,
        role: 'CASHIER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      expect(data).toHaveLength(2);
    });
  });

  describe('MANAGER / allBranches=true', () => {
    it('has the same Restaurant-wide read visibility as OWNER', async () => {
      const { id: managerId, email: managerEmail } = await createTestUser();
      const { id: waiterId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId: waiterId,
        role: 'WAITER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(managerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      expect(data).toHaveLength(2);
    });
  });

  describe('MANAGER / allBranches=false subset visibility', () => {
    it('sees self, same/subset Branch-scoped Staff, but not partial-overlap, other-Branch, allBranches=true, OWNER, or zero-Branch targets', async () => {
      const { id: managerId, email: managerEmail } = await createTestUser();
      const { id: sameId } = await createTestUser();
      const { id: subsetId } = await createTestUser();
      const { id: partialOverlapId } = await createTestUser();
      const { id: otherBranchId } = await createTestUser();
      const { id: ownerId } = await createTestUser();
      const { id: zeroBranchId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'Branch B');

      const manager = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const same = await createMembership({
        restaurantId: restaurant.id,
        userId: sameId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const subset = await createMembership({
        restaurantId: restaurant.id,
        userId: subsetId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [],
      });
      const partialOverlap = await createMembership({
        restaurantId: restaurant.id,
        userId: partialOverlapId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [branchA.id, branchB.id],
      });
      const otherBranch = await createMembership({
        restaurantId: restaurant.id,
        userId: otherBranchId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [branchB.id],
      });
      const owner = await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const zeroBranch = await createMembership({
        restaurantId: restaurant.id,
        userId: zeroBranchId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [],
      });
      const cookiePair = await loginAndGetCookie(managerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const visibleIds = (response.body as StaffListResponseBody).data.map(
        (item) => item.id,
      );
      expect(visibleIds.sort()).toEqual([manager.id, same.id].sort());
      expect(visibleIds).not.toContain(subset.id);
      expect(visibleIds).not.toContain(partialOverlap.id);
      expect(visibleIds).not.toContain(otherBranch.id);
      expect(visibleIds).not.toContain(owner.id);
      expect(visibleIds).not.toContain(zeroBranch.id);
    });

    it('proper subset: caller scope [A, B], target scope [A] (not equal, strictly smaller) -> target IS visible', async () => {
      const { id: managerId, email: managerEmail } = await createTestUser();
      const { id: targetId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'Branch B');

      const manager = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id, branchB.id],
      });
      const target = await createMembership({
        restaurantId: restaurant.id,
        userId: targetId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const cookiePair = await loginAndGetCookie(managerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const visibleIds = (response.body as StaffListResponseBody).data.map(
        (item) => item.id,
      );
      expect(visibleIds).toContain(manager.id);
      expect(visibleIds).toContain(target.id);
    });
  });

  describe('Permissions', () => {
    it('role without users.view (KITCHEN) -> exact 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'KITCHEN',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('permission denial occurs before the Staff Membership list business query runs -- StaffService.listStaffMemberships is never called', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      // The real AuthGuard/RestaurantAccessGuard/PermissionGuard chain
      // stays fully active -- only the business service method is spied on,
      // proving PermissionGuard rejects the request before StaffService is
      // ever invoked, not merely that the HTTP response happens to be 403.
      const staffService = app.get(StaffService);
      const spy = jest.spyOn(staffService, 'listStaffMemberships');
      try {
        const response = await getStaffList({
          restaurantId: restaurant.id,
          cookiePair,
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('Tenant isolation', () => {
    it('Restaurant B Membership never appears; a multi-Restaurant User exposes only the authorized Restaurant Membership', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const { id: otherUserBId } = await createTestUser();

      const membershipA = await createMembership({
        restaurantId: restaurantA.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurantB.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      await createMembership({
        restaurantId: restaurantB.id,
        userId: otherUserBId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getStaffList({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(membershipA.id);
    });
  });

  describe('Membership status inclusion', () => {
    it('ACTIVE, INVITED, and DISABLED persisted Membership rows all appear', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const { id: invitedId } = await createTestUser();
      const { id: disabledId } = await createTestUser();
      const restaurant = await createRestaurant();
      const active = await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        status: 'ACTIVE',
        allBranches: true,
      });
      const invited = await createMembership({
        restaurantId: restaurant.id,
        userId: invitedId,
        role: 'WAITER',
        status: 'INVITED',
        allBranches: true,
      });
      const disabled = await createMembership({
        restaurantId: restaurant.id,
        userId: disabledId,
        role: 'WAITER',
        status: 'DISABLED',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      const byId = new Map(data.map((item) => [item.id, item]));
      expect(byId.get(active.id)?.status).toBe('ACTIVE');
      expect(byId.get(invited.id)?.status).toBe('INVITED');
      expect(byId.get(disabled.id)?.status).toBe('DISABLED');
    });
  });

  describe('Branches', () => {
    it('allBranches=true returns same-Restaurant ACTIVE and INACTIVE Branches', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const restaurant = await createRestaurant();
      const activeBranch = await createBranch(
        restaurant.id,
        'ACTIVE',
        'Active Branch',
      );
      const inactiveBranch = await createBranch(
        restaurant.id,
        'INACTIVE',
        'Inactive Branch',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      const branchIds = data[0].branches.map((b) => b.id).sort();
      expect(branchIds).toEqual([activeBranch.id, inactiveBranch.id].sort());
    });

    it('scoped Membership returns exact valid Branch assignments only', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const { id: managerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      await createBranch(restaurant.id, 'ACTIVE', 'Branch B');
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const manager = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      const managerItem = data.find((item) => item.id === manager.id);
      expect(managerItem?.branches).toEqual([
        { id: branchA.id, name: 'Branch A', status: 'ACTIVE' },
      ]);
    });
  });

  describe('malformed cross-Restaurant Branch assignment defense-in-depth', () => {
    // Deliberately malformed historical data: a RestaurantMembershipBranch
    // row whose Membership belongs to Restaurant A but whose Branch belongs
    // to Restaurant B. The schema's independent foreign keys allow this row
    // to exist (AUTH_TENANCY_SPEC.md #61A) -- plain Prisma is sufficient to
    // create it, no raw SQL required.
    it('CASE 1: target with only a malformed foreign-Restaurant Branch assignment is never visible to a Branch-scoped caller', async () => {
      const { id: callerId, email: callerEmail } = await createTestUser();
      const { id: targetId } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchA = await createBranch(restaurantA.id, 'ACTIVE', 'Branch A');
      const foreignBranchB = await createBranch(
        restaurantB.id,
        'ACTIVE',
        'Foreign Branch B',
      );

      const caller = await createMembership({
        restaurantId: restaurantA.id,
        userId: callerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const target = await createMembership({
        restaurantId: restaurantA.id,
        userId: targetId,
        role: 'WAITER',
        allBranches: false,
      });
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: target.id,
          branchId: foreignBranchB.id,
        },
      });
      const cookiePair = await loginAndGetCookie(callerEmail);

      const response = await getStaffList({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      const visibleIds = (response.body as StaffListResponseBody).data.map(
        (item) => item.id,
      );
      expect(visibleIds).toContain(caller.id);
      expect(visibleIds).not.toContain(target.id);
    });

    it('CASE 2: target with valid Branch A + malformed foreign Branch B remains visible via its valid set only -- the foreign Branch is never surfaced', async () => {
      const { id: callerId, email: callerEmail } = await createTestUser();
      const { id: targetId } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchA = await createBranch(restaurantA.id, 'ACTIVE', 'Branch A');
      const foreignBranchB = await createBranch(
        restaurantB.id,
        'ACTIVE',
        'Foreign Branch B',
      );

      const caller = await createMembership({
        restaurantId: restaurantA.id,
        userId: callerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const target = await createMembership({
        restaurantId: restaurantA.id,
        userId: targetId,
        role: 'WAITER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: target.id,
          branchId: foreignBranchB.id,
        },
      });
      const cookiePair = await loginAndGetCookie(callerEmail);

      const response = await getStaffList({
        restaurantId: restaurantA.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as StaffListResponseBody).data;
      const visibleIds = data.map((item) => item.id);
      expect(visibleIds).toContain(caller.id);
      expect(visibleIds).toContain(target.id);

      const targetItem = data.find((item) => item.id === target.id);
      expect(targetItem?.branches).toEqual([
        { id: branchA.id, name: 'Branch A', status: 'ACTIVE' },
      ]);
      expect(targetItem?.branches.map((b) => b.id)).not.toContain(
        foreignBranchB.id,
      );
    });
  });

  describe('security', () => {
    it('no passwordHash/emailNormalized/preferredLocale/User.status/Platform Admin/token/restaurantId/timestamp leak', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/emailNormalized/i);
      expect(serialized).not.toMatch(/preferredLocale/i);
      expect(serialized).not.toMatch(/platformAdmin/i);
      expect(serialized).not.toMatch(/tokenHash/i);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);

      const data = (response.body as StaffListResponseBody).data;
      expect(Object.keys(data[0]).sort()).toEqual(
        ['allBranches', 'branches', 'id', 'role', 'status', 'user'].sort(),
      );
      expect(Object.keys(data[0].user).sort()).toEqual(['email', 'id']);
    });

    it('unauthenticated -> 401', async () => {
      const restaurant = await createRestaurant();

      const response = await getStaffList({
        restaurantId: restaurant.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getStaffList({
        restaurantId: randomUUID(),
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });

    it('authorized but SUSPENDED Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('SUSPENDED');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getStaffList({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });
  });

  describe('no mutation side effects', () => {
    it('GET does not modify any persisted Membership/Branch/User row', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const restaurant = await createRestaurant();
      const ownerMembership = await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      await getStaffList({ restaurantId: restaurant.id, cookiePair }).expect(
        200,
      );

      const persisted = await prisma.restaurantMembership.findUniqueOrThrow({
        where: { id: ownerMembership.id },
      });
      expect(persisted.updatedAt).toEqual(ownerMembership.updatedAt);
      expect(persisted.status).toBe('ACTIVE');
    });
  });
});
