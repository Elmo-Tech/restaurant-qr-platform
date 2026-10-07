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
 * Business Foundation P: proves Table Detail end-to-end through the real
 * `GET /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}`
 * endpoint -- HTTP Cookie -> AuthGuard -> RestaurantAccessGuard ->
 * BranchManagementAccessGuard -> PermissionGuard -> TablesService ->
 * PrismaService -> PostgreSQL.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Table/QR
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('GET /api/v1/restaurants/:restaurantId/branches/:branchId/tables/:tableId (e2e)', () => {
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
  const TABLE_NOT_FOUND_BODY = {
    error: { code: 'TABLE_NOT_FOUND', message: 'Table not found.' },
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
    const uniqueEmail = `tables-detail-${randomUUID()}@example.test`;
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

  async function createQr(params: {
    restaurantId: string;
    branchId: string;
    tableId: string;
    status: 'ACTIVE' | 'INACTIVE';
    publicCode?: string;
  }) {
    return prisma.qrCode.create({
      data: {
        publicCode: params.publicCode ?? `qr-${randomUUID()}`,
        restaurantId: params.restaurantId,
        branchId: params.branchId,
        tableId: params.tableId,
        type: 'TABLE',
        status: params.status,
      },
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

  function getTableDetail(params: {
    restaurantId: string;
    branchId: string;
    tableId: string;
    cookiePair?: string;
  }) {
    let req = request(app.getHttpServer()).get(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}/tables/${params.tableId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req;
  }

  interface TableDetailResponseBody {
    data: {
      id: string;
      tableNumber: string;
      status: string;
      qr: { id: string; publicCode: string; status: string } | null;
    };
  }

  describe('success', () => {
    it('A. OWNER/allBranches=true + ACTIVE Branch + ACTIVE Table -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1', 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);
    });

    it('B. OWNER/allBranches=true + INACTIVE Branch + ACTIVE Table -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1', 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);
    });

    it('C. MANAGER/allBranches=false + assigned INACTIVE Branch + INACTIVE Table -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      const table = await createTable(
        restaurant.id,
        branch.id,
        'A1',
        'INACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);
    });

    it('D. INACTIVE Table is visible and its status is returned as INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(
        restaurant.id,
        branch.id,
        'A1',
        'INACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect((response.body as TableDetailResponseBody).data.status).toBe(
        'INACTIVE',
      );
    });
  });

  describe('active QR', () => {
    it('returns the exact Table + QR shape, no leaked internal fields', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const qr = await createQr({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        status: 'ACTIVE',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect(response.body).toEqual({
        data: {
          id: table.id,
          tableNumber: 'A1',
          status: 'ACTIVE',
          qr: { id: qr.id, publicCode: qr.publicCode, status: 'ACTIVE' },
        },
      });

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/branchId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
      expect(serialized).not.toMatch(/tableId/i);
      expect(serialized).not.toMatch(/"type"/i);
    });
  });

  describe('null QR', () => {
    it('a Table with no ACTIVE TABLE QR returns 200 with qr: null', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect((response.body as TableDetailResponseBody).data.qr).toBeNull();
    });
  });

  describe('historical QR', () => {
    it('case A: only an INACTIVE TABLE QR exists -> qr: null', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      await createQr({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        status: 'INACTIVE',
        publicCode: 'historical-only-code',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect((response.body as TableDetailResponseBody).data.qr).toBeNull();
      expect(JSON.stringify(response.body)).not.toMatch(/historical-only-code/);
    });

    it('case B: historical INACTIVE + one ACTIVE TABLE QR -> only the ACTIVE one is returned', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const historicalQr = await createQr({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        status: 'INACTIVE',
        publicCode: 'historical-code-b',
      });
      const activeQr = await createQr({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        status: 'ACTIVE',
        publicCode: 'active-code-b',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      const data = (response.body as TableDetailResponseBody).data;
      expect(data.qr).toEqual({
        id: activeQr.id,
        publicCode: 'active-code-b',
        status: 'ACTIVE',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/historical-code-b/);

      const persistedHistorical = await prisma.qrCode.findUniqueOrThrow({
        where: { id: historicalQr.id },
      });
      expect(persistedHistorical.status).toBe('INACTIVE');
    });
  });

  describe('malformed QR context (defense-in-depth)', () => {
    it('case A: ACTIVE TABLE QR whose own branchId points at a different Branch in the SAME Restaurant -> qr: null', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const otherBranch = await createBranch(
        restaurant.id,
        'ACTIVE',
        'Branch A-other',
      );
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const malformedQr = await createQr({
        restaurantId: restaurant.id,
        branchId: otherBranch.id,
        tableId: table.id,
        status: 'ACTIVE',
        publicCode: 'mismatched-branch-code',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect((response.body as TableDetailResponseBody).data.qr).toBeNull();
      expect(JSON.stringify(response.body)).not.toMatch(
        /mismatched-branch-code/,
      );

      const persistedMalformed = await prisma.qrCode.findUniqueOrThrow({
        where: { id: malformedQr.id },
      });
      expect(persistedMalformed.status).toBe('ACTIVE');
      expect(persistedMalformed.branchId).toBe(otherBranch.id);
    });

    it('case B: ACTIVE TABLE QR whose own restaurantId/branchId point at a completely foreign Restaurant/Branch -> qr: null', async () => {
      // Foreign Restaurant/Branch are created FIRST (and therefore pushed
      // first into createdRestaurantIds) so afterEach's targeted cleanup
      // deletes the foreign QR (scoped by its own restaurantId) before it
      // reaches the current Restaurant's Table deletion -- the QR's
      // `tableId` FK (onDelete: Restrict) would otherwise block deleting
      // Table A while this cross-Restaurant QR row still references it.
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Foreign Restaurant',
      );
      const foreignBranch = await createBranch(
        foreignRestaurant.id,
        'ACTIVE',
        'Foreign Branch',
      );

      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const branch = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const malformedQr = await createQr({
        restaurantId: foreignRestaurant.id,
        branchId: foreignBranch.id,
        tableId: table.id,
        status: 'ACTIVE',
        publicCode: 'foreign-restaurant-code',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      expect((response.body as TableDetailResponseBody).data.qr).toBeNull();
      expect(JSON.stringify(response.body)).not.toMatch(
        /foreign-restaurant-code/,
      );

      const persistedMalformed = await prisma.qrCode.findUniqueOrThrow({
        where: { id: malformedQr.id },
      });
      expect(persistedMalformed.status).toBe('ACTIVE');
      expect(persistedMalformed.restaurantId).toBe(foreignRestaurant.id);
      expect(persistedMalformed.branchId).toBe(foreignBranch.id);
    });
  });

  describe('Table identity', () => {
    it('A. malformed tableId -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: 'not-a-uuid',
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('B. well-formed nonexistent tableId -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: randomUUID(),
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('C. Table belongs to another Branch in the SAME Restaurant -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const otherBranch = await createBranch(
        restaurant.id,
        'ACTIVE',
        'Branch B',
      );
      const tableInOtherBranch = await createTable(
        restaurant.id,
        otherBranch.id,
        'X1',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: tableInOtherBranch.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('D. Table belongs to another Restaurant -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const branch = await createBranch(restaurant.id);
      const foreignBranch = await createBranch(foreignRestaurant.id);
      const foreignTable = await createTable(
        foreignRestaurant.id,
        foreignBranch.id,
        'Y1',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: foreignTable.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('E. URL uses Branch A but tableId belongs to Branch B -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'Branch B');
      const tableInB = await createTable(restaurant.id, branchB.id, 'B1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branchA.id,
        tableId: tableInB.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });
  });

  describe('authorization precedence', () => {
    it('unauthenticated -> 401', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: randomUUID(),
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });

    it('authorized but SUSPENDED Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('SUSPENDED');
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
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

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        tableId: randomUUID(),
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

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        tableId: randomUUID(),
        cookiePair,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('allBranches=false + unassigned Branch -> 403 BRANCH_ACCESS_DENIED', async () => {
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

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: randomUUID(),
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('Role without tables.view (KITCHEN) -> 403 PERMISSION_DENIED, even with a nonexistent tableId', async () => {
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

      const response = await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: 'not-a-uuid-either',
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  describe('no side effects', () => {
    it('Table Detail is read-only -- no row is created or modified', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');
      const qr = await createQr({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        status: 'ACTIVE',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await getTableDetail({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
      }).expect(200);

      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persistedTable.status).toBe('ACTIVE');
      expect(persistedTable.updatedAt).toEqual(table.updatedAt);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(persistedQr.status).toBe('ACTIVE');
      expect(persistedQr.publicCode).toBe(qr.publicCode);
      expect(persistedQr.updatedAt).toEqual(qr.updatedAt);

      expect(await prisma.table.count({ where: { branchId: branch.id } })).toBe(
        1,
      );
      expect(await prisma.qrCode.count({ where: { tableId: table.id } })).toBe(
        1,
      );
    });
  });
});
