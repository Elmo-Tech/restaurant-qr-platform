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
 * Business Foundation O: proves Table List end-to-end through the real
 * `GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`
 * endpoint -- HTTP Cookie -> AuthGuard -> RestaurantAccessGuard ->
 * BranchManagementAccessGuard -> PermissionGuard -> TablesService ->
 * PrismaService -> PostgreSQL.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Table/QR
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('GET /api/v1/restaurants/:restaurantId/branches/:branchId/tables (e2e)', () => {
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
      await prisma.qrCode.deleteMany({ where: { restaurantId } });
      await prisma.table.deleteMany({ where: { restaurantId } });
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
    const uniqueEmail = `tables-list-${randomUUID()}@example.test`;
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

  async function createTable(
    restaurantId: string,
    branchId: string,
    tableNumber: string,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ) {
    return prisma.table.create({
      data: { restaurantId, branchId, tableNumber, status },
    });
  }

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
    allBranches: boolean;
    branchIds?: string[];
  }) {
    const membership = await prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role ?? 'OWNER',
        roleId: (await ensureStarterRole(prisma, params.restaurantId, params.role ?? 'OWNER')).id,
        status: 'ACTIVE',
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

  function getTables(params: {
    restaurantId: string;
    branchId: string;
    cookiePair?: string;
  }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}/tables`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  interface TableListResponseBody {
    data: { id: string; tableNumber: string; status: string }[];
  }

  describe('success', () => {
    it('A. OWNER/allBranches=true + ACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);
    });

    it('B. OWNER/allBranches=true + INACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);
    });

    it('C. MANAGER/allBranches=false + assigned INACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);
    });

    it('D. Branch with zero Tables -> exact { "data": [] }', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe('Table statuses', () => {
    it('returns both ACTIVE and INACTIVE Tables, exact item shape', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const activeTable = await createTable(
        restaurant.id,
        branch.id,
        'A1',
        'ACTIVE',
      );
      const inactiveTable = await createTable(
        restaurant.id,
        branch.id,
        'A2',
        'INACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as TableListResponseBody).data;
      const ids = data.map((item) => item.id).sort();
      expect(ids).toEqual([activeTable.id, inactiveTable.id].sort());
      for (const item of data) {
        expect(Object.keys(item).sort()).toEqual(
          ['id', 'status', 'tableNumber'].sort(),
        );
      }
    });
  });

  describe('ordering', () => {
    it('returns Tables in fixed tableNumber ascending (string) order', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createTable(restaurant.id, branch.id, 'B2');
      await createTable(restaurant.id, branch.id, 'A2');
      await createTable(restaurant.id, branch.id, 'A1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as TableListResponseBody).data;
      expect(data.map((item) => item.tableNumber)).toEqual(['A1', 'A2', 'B2']);
    });
  });

  describe('Tenant isolation', () => {
    it('returns only the requested Branch Tables -- no cross-Restaurant or cross-Branch leakage', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const branchA = await createBranch(restaurantA.id, 'ACTIVE', 'Branch A');
      const otherBranchA = await createBranch(
        restaurantA.id,
        'ACTIVE',
        'Other Branch A',
      );
      const branchB = await createBranch(restaurantB.id, 'ACTIVE', 'Branch B');

      const tableA = await createTable(restaurantA.id, branchA.id, 'A1');
      await createTable(restaurantA.id, otherBranchA.id, 'X1');
      await createTable(restaurantB.id, branchB.id, 'Y1');

      await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurantA.id,
        branchId: branchA.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as TableListResponseBody).data;
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(tableA.id);
    });
  });

  describe('security', () => {
    it('unauthenticated -> 401', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: randomUUID(),
        branchId: branch.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });

    it('authorized but SUSPENDED Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('SUSPENDED');
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });

    it('unknown Branch -> 404 BRANCH_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('foreign-Restaurant Branch -> 404 BRANCH_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const foreignBranch = await createBranch(foreignRestaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('allBranches=false + same-Restaurant unassigned Branch -> 403 BRANCH_ACCESS_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('Role without tables.view (KITCHEN) -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'KITCHEN',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  describe('QR non-inclusion', () => {
    it('a Table with its TABLE QR present still returns exactly id/tableNumber/status, no QR data or mutation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `list-qr-non-inclusion-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTables({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as TableListResponseBody).data;
      expect(data).toHaveLength(1);
      expect(Object.keys(data[0]).sort()).toEqual(
        ['id', 'status', 'tableNumber'].sort(),
      );
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/publicCode/i);
      expect(serialized).not.toMatch(/"qr"/i);
      expect(serialized).not.toMatch(/qrStatus/i);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(persistedQr.status).toBe('ACTIVE');
      expect(persistedQr.updatedAt).toEqual(qr.updatedAt);
      expect(await prisma.qrCode.count({ where: { tableId: table.id } })).toBe(
        1,
      );
    });
  });
});
