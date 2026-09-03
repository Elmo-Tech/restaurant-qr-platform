import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Business Foundation Q: proves Table Basic Info Update end-to-end through
 * the real
 * `PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables/{tableId}`
 * endpoint -- HTTP Cookie -> AuthGuard -> CsrfGuard -> RestaurantAccessGuard
 * -> BranchManagementAccessGuard -> PermissionGuard -> TablesService ->
 * PrismaService -> PostgreSQL.
 *
 * The approved Origin under test is the real `CORS_ORIGIN` from the running
 * environment's `.env` (`http://localhost:3000`).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Table/QR
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('PATCH /api/v1/restaurants/:restaurantId/branches/:branchId/tables/:tableId (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const APPROVED_ORIGIN = 'http://localhost:3000';
  const FOREIGN_ORIGIN = 'https://evil.com';

  const UNAUTHENTICATED_BODY = {
    error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
  };
  const CSRF_VALIDATION_FAILED_BODY = {
    error: {
      code: 'CSRF_VALIDATION_FAILED',
      message: 'Cross-origin request rejected.',
    },
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
  const TABLE_NUMBER_ALREADY_EXISTS_BODY = {
    error: {
      code: 'TABLE_NUMBER_ALREADY_EXISTS',
      message: 'Table number already exists in this Branch.',
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
    const uniqueEmail = `tables-update-${randomUUID()}@example.test`;
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

  function patchTable(params: {
    restaurantId: string;
    branchId: string;
    tableId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}/tables/${params.tableId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body ?? {});
  }

  interface UpdateTableResponseBody {
    data: { id: string; tableNumber: string; status: string };
  }

  describe('success', () => {
    it('A. OWNER/allBranches=true + ACTIVE Branch + ACTIVE Table: A1 -> A2 -> 200', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: table.id, tableNumber: 'A2', status: 'ACTIVE' },
      });
    });

    it('B. OWNER/allBranches=true + INACTIVE Branch + ACTIVE Table -> rename allowed', async () => {
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

      await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);
    });

    it('C. MANAGER/allBranches=false + assigned INACTIVE Branch + INACTIVE Table -> rename allowed', async () => {
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

      await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);
    });

    it('D. INACTIVE Table remains INACTIVE after rename', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);

      expect((response.body as UpdateTableResponseBody).data.status).toBe(
        'INACTIVE',
      );
      const persisted = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('E. exact response fields only: id, tableNumber, status', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);

      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(Object.keys(data).sort()).toEqual(
        ['id', 'status', 'tableNumber'].sort(),
      );
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/branchId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
      expect(serialized).not.toMatch(/"qr"/i);
    });
  });

  describe('empty body', () => {
    it('{} -> 200, unchanged tableNumber/status/updatedAt/QR, no rows created', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: table.id, tableNumber: 'A1', status: 'ACTIVE' },
      });

      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persistedTable.tableNumber).toBe('A1');
      expect(persistedTable.status).toBe('ACTIVE');
      expect(persistedTable.updatedAt).toEqual(table.updatedAt);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(persistedQr.publicCode).toBe(qr.publicCode);
      expect(persistedQr.status).toBe('ACTIVE');
      expect(persistedQr.updatedAt).toEqual(qr.updatedAt);

      expect(await prisma.table.count({ where: { branchId: branch.id } })).toBe(
        1,
      );
    });
  });

  describe('same value', () => {
    it('exact same tableNumber -> 200 true no-op, updatedAt/QR unchanged, no conflict', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: table.id, tableNumber: 'A1', status: 'ACTIVE' },
      });

      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persistedTable.updatedAt).toEqual(table.updatedAt);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(persistedQr.updatedAt).toEqual(qr.updatedAt);
    });

    it('whitespace-padded same value ("  A1  ") -> true no-op after trim', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: '  A1  ' },
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: table.id, tableNumber: 'A1', status: 'ACTIVE' },
      });

      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persistedTable.updatedAt).toEqual(table.updatedAt);
    });
  });

  describe('duplicate', () => {
    it("renaming to another Table's number in the same Branch -> 409, target Table unchanged", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createTable(restaurant.id, branch.id, 'A1');
      const table2 = await createTable(restaurant.id, branch.id, 'A2');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table2.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(409);

      expect(response.body).toEqual(TABLE_NUMBER_ALREADY_EXISTS_BODY);

      const persisted = await prisma.table.findUniqueOrThrow({
        where: { id: table2.id },
      });
      expect(persisted.tableNumber).toBe('A2');
    });
  });

  describe('other Branch', () => {
    it('renaming to a number already used in a DIFFERENT Branch is allowed', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'Branch B');
      await createTable(restaurant.id, branchA.id, 'A1');
      const tableB = await createTable(restaurant.id, branchB.id, 'B1');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await patchTable({
        restaurantId: restaurant.id,
        branchId: branchB.id,
        tableId: tableB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(200);
    });
  });

  describe('validation', () => {
    it('null tableNumber -> 400', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: null },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('empty string -> 400', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: '' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('whitespace-only -> 400', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: '   ' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('non-string -> 400', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 123 },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  describe('Table identity', () => {
    it('malformed tableId -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: 'not-a-uuid',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('unknown tableId -> 404 TABLE_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('same-Restaurant other-Branch Table -> 404 TABLE_NOT_FOUND, Table unchanged', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: tableInOtherBranch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
      const persisted = await prisma.table.findUniqueOrThrow({
        where: { id: tableInOtherBranch.id },
      });
      expect(persisted.tableNumber).toBe('X1');
    });

    it('foreign-Restaurant Table -> 404 TABLE_NOT_FOUND', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: foreignTable.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });

    it('Branch/Table URL mismatch -> 404 TABLE_NOT_FOUND', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branchA.id,
        tableId: tableInB.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(TABLE_NOT_FOUND_BODY);
    });
  });

  describe('auth / CSRF / scope', () => {
    it('unauthenticated -> 401', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      const table = await createTable(restaurant.id, branch.id, 'A1');

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('foreign/malformed Origin -> 403 CSRF_VALIDATION_FAILED', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);

      const persisted = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persisted.tableNumber).toBe('A1');
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

      const response = await patchTable({
        restaurantId: randomUUID(),
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        tableId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('foreign Branch -> 404 BRANCH_NOT_FOUND', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        tableId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('unassigned same-Restaurant Branch -> 403 BRANCH_ACCESS_DENIED', async () => {
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

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('role without tables.manage (WAITER) -> 403 PERMISSION_DENIED, even with unknown tableId', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: 'not-a-uuid-either',
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });
  });

  describe('QR non-mutation', () => {
    it('renaming a Table with an ACTIVE TABLE QR leaves the QR byte-for-byte unchanged', async () => {
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

      await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(persistedQr.publicCode).toBe(qr.publicCode);
      expect(persistedQr.status).toBe('ACTIVE');
      expect(persistedQr.updatedAt).toEqual(qr.updatedAt);
      expect(await prisma.qrCode.count({ where: { tableId: table.id } })).toBe(
        1,
      );
    });
  });

  describe('Table identity non-mutation', () => {
    it('only tableNumber changes -- id, restaurantId, branchId, status remain identical', async () => {
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

      await patchTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        tableId: table.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A2' },
      }).expect(200);

      const persisted = await prisma.table.findUniqueOrThrow({
        where: { id: table.id },
      });
      expect(persisted.id).toBe(table.id);
      expect(persisted.restaurantId).toBe(table.restaurantId);
      expect(persisted.branchId).toBe(table.branchId);
      expect(persisted.status).toBe(table.status);
      expect(persisted.tableNumber).toBe('A2');
    });
  });
});
