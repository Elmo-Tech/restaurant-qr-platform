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
 * Business Foundation L3: proves Table Creation end-to-end through the real
 * `POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`
 * endpoint -- HTTP Cookie -> AuthGuard -> CsrfGuard -> RestaurantAccessGuard
 * -> BranchManagementAccessGuard -> PermissionGuard -> TablesService ->
 * PrismaService -> PostgreSQL, including the atomic Table + initial TABLE
 * QR transaction.
 *
 * The approved Origin under test is the real `CORS_ORIGIN` from the running
 * environment's `.env` (`http://localhost:3000`).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Table/QR
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('POST /api/v1/restaurants/:restaurantId/branches/:branchId/tables (e2e)', () => {
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
    const uniqueEmail = `tables-create-${randomUUID()}@example.test`;
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

  function postCreateTable(params: {
    restaurantId: string;
    branchId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}/tables`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body ?? { tableNumber: 'A1' });
  }

  async function countTables(branchId: string): Promise<number> {
    return prisma.table.count({ where: { branchId } });
  }

  async function countQrCodes(restaurantId: string): Promise<number> {
    return prisma.qrCode.count({ where: { restaurantId } });
  }

  interface CreateTableResponseBody {
    data: {
      table: { id: string; tableNumber: string; status: string };
      qr: { id: string; publicCode: string; status: string };
    };
  }

  describe('A-D. success across Role/scope/Branch-status combinations', () => {
    it('A. OWNER/allBranches=true + ACTIVE Branch -> 201', async () => {
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

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const body = response.body as CreateTableResponseBody;
      expect(body.data.table.status).toBe('ACTIVE');
      expect(body.data.qr.status).toBe('ACTIVE');
    });

    it('B. OWNER/allBranches=true + INACTIVE Branch -> 201', async () => {
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

      await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect(await countTables(branch.id)).toBe(1);
    });

    it('C. MANAGER/allBranches=true + INACTIVE Branch -> 201', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect(await countTables(branch.id)).toBe(1);
    });

    it('D. MANAGER/allBranches=false + assigned INACTIVE Branch -> 201', async () => {
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

      await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect(await countTables(branch.id)).toBe(1);
    });
  });

  describe('exact persistence/response invariants', () => {
    it('normalizes tableNumber, persists Table ACTIVE + QR TABLE/ACTIVE, links correctly, exactly one row each, no unrelated rows', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: '  A1  ' },
      }).expect(201);

      const body = response.body as CreateTableResponseBody;
      expect(body.data.table.tableNumber).toBe('A1');
      expect(Object.keys(body.data).sort()).toEqual(['qr', 'table']);
      expect(Object.keys(body.data.table).sort()).toEqual([
        'id',
        'status',
        'tableNumber',
      ]);
      expect(Object.keys(body.data.qr).sort()).toEqual([
        'id',
        'publicCode',
        'status',
      ]);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/branchId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
      expect(serialized).not.toMatch(/"type"/i);

      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: body.data.table.id },
      });
      expect(persistedTable.status).toBe('ACTIVE');
      expect(persistedTable.tableNumber).toBe('A1');
      expect(persistedTable.restaurantId).toBe(restaurant.id);
      expect(persistedTable.branchId).toBe(branch.id);

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: body.data.qr.id },
      });
      expect(persistedQr.status).toBe('ACTIVE');
      expect(persistedQr.type).toBe('TABLE');
      expect(persistedQr.restaurantId).toBe(persistedTable.restaurantId);
      expect(persistedQr.branchId).toBe(persistedTable.branchId);
      expect(persistedQr.tableId).toBe(persistedTable.id);
      expect(persistedQr.publicCode).toHaveLength(43);
      expect(persistedQr.publicCode).toMatch(/^[A-Za-z0-9_-]{43}$/);

      expect(await countTables(branch.id)).toBe(1);
      expect(await countQrCodes(restaurant.id)).toBe(1);
    });
  });

  describe('authorization / security', () => {
    it('unauthenticated -> 401, no Table created', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        origin: APPROVED_ORIGIN,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });

    it('invalid/mismatched Origin -> 403 CSRF_VALIDATION_FAILED, no Table created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND, no Table created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: randomUUID(),
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL, no Table created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });

    it('unknown Branch -> 404 BRANCH_NOT_FOUND, no Table created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('foreign-Restaurant Branch -> 404 BRANCH_NOT_FOUND, no Table created', async () => {
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

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      expect(await countTables(foreignBranch.id)).toBe(0);
    });

    it('same Restaurant, allBranches=false, unassigned Branch -> 403 BRANCH_ACCESS_DENIED, no Table created', async () => {
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

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });

    it('Role without tables.manage (WAITER) -> 403 PERMISSION_DENIED, no Table created', async () => {
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

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(await countTables(branch.id)).toBe(0);
    });
  });

  describe('body authority / validation', () => {
    it('missing tableNumber -> 400', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect(await countTables(branch.id)).toBe(0);
    });

    it('non-string tableNumber -> 400', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 123 },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('whitespace-only tableNumber -> 400', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: '   ' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('body cannot override restaurantId/branchId/status/publicId/publicCode/type', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const attackerRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      const attackerBranch = await createBranch(
        attackerRestaurant.id,
        'ACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          tableNumber: 'A1',
          restaurantId: attackerRestaurant.id,
          branchId: attackerBranch.id,
          status: 'INACTIVE',
          publicId: 'attacker-public-id',
          publicCode: 'chosen-by-client',
          type: 'GENERIC',
        },
      }).expect(201);

      const body = response.body as CreateTableResponseBody;
      const persistedTable = await prisma.table.findUniqueOrThrow({
        where: { id: body.data.table.id },
      });
      expect(persistedTable.restaurantId).toBe(restaurant.id);
      expect(persistedTable.branchId).toBe(branch.id);
      expect(persistedTable.status).toBe('ACTIVE');

      const persistedQr = await prisma.qrCode.findUniqueOrThrow({
        where: { id: body.data.qr.id },
      });
      expect(persistedQr.publicCode).not.toBe('chosen-by-client');
      expect(persistedQr.type).toBe('TABLE');
      expect(await countTables(attackerBranch.id)).toBe(0);
    });
  });

  describe('uniqueness', () => {
    it('duplicate tableNumber in same Branch -> 409 TABLE_NUMBER_ALREADY_EXISTS, no orphan QR; different Branch is allowed', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      const otherBranch = await createBranch(
        restaurant.id,
        'ACTIVE',
        'Branch B',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(201);

      const response = await postCreateTable({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(409);

      expect(response.body).toEqual(TABLE_NUMBER_ALREADY_EXISTS_BODY);
      expect(await countTables(branch.id)).toBe(1);
      expect(await countQrCodes(restaurant.id)).toBe(1);

      await postCreateTable({
        restaurantId: restaurant.id,
        branchId: otherBranch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { tableNumber: 'A1' },
      }).expect(201);

      expect(await countTables(otherBranch.id)).toBe(1);
    });
  });
});
