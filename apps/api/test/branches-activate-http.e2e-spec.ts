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
 * Business Foundation M: proves Branch Activation end-to-end through the
 * real `POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/activate`
 * endpoint -- HTTP Cookie -> AuthGuard -> CsrfGuard -> RestaurantAccessGuard
 * -> BranchManagementAccessGuard -> PermissionGuard -> BranchesService ->
 * PrismaService -> PostgreSQL.
 *
 * The approved Origin under test is the real `CORS_ORIGIN` from the running
 * environment's `.env` (`http://localhost:3000`).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Table/QR
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('POST /api/v1/restaurants/:restaurantId/branches/:branchId/activate (e2e)', () => {
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
    const uniqueEmail = `branches-activate-${randomUUID()}@example.test`;
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
    status: 'ACTIVE' | 'INACTIVE' = 'INACTIVE',
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

  function postActivateBranch(params: {
    restaurantId: string;
    branchId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}/activate`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body ?? {});
  }

  interface ActivateBranchResponseBody {
    data: { id: string; status: string };
  }

  describe('A-D. success across Role/scope/transition combinations', () => {
    it('A. OWNER/allBranches=true + INACTIVE Branch -> 200, Branch becomes ACTIVE', async () => {
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

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: branch.id, status: 'ACTIVE' },
      });
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('ACTIVE');
    });

    it('B. MANAGER/allBranches=true + INACTIVE Branch -> 200', async () => {
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

      await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('ACTIVE');
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

      await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('ACTIVE');
    });

    it('D. already-ACTIVE Branch -> 200, remains ACTIVE, no activation-specific error', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      expect(response.body).toEqual({
        data: { id: branch.id, status: 'ACTIVE' },
      });
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('ACTIVE');
    });
  });

  describe('exact response shape', () => {
    it('contains only id and status -- no name, timezone, phone, address, restaurantId, publicId, or timestamps', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(Object.keys(data).sort()).toEqual(['id', 'status']);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/name/i);
      expect(serialized).not.toMatch(/timezone/i);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/publicId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
    });
  });

  describe('security', () => {
    it('unauthenticated -> 401, Branch remains INACTIVE', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        origin: APPROVED_ORIGIN,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('invalid/mismatched Origin -> 403 CSRF_VALIDATION_FAILED, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: randomUUID(),
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('authorized but SUSPENDED Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('SUSPENDED');
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
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

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('foreign-Restaurant Branch -> 404 BRANCH_NOT_FOUND, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const foreignBranch = await createBranch(
        foreignRestaurant.id,
        'INACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: foreignBranch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('allBranches=false + same-Restaurant unassigned Branch -> 403 BRANCH_ACCESS_DENIED, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });

    it('Role without branches.manage (WAITER) -> 403 PERMISSION_DENIED, Branch remains INACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });
  });

  describe('authority', () => {
    it('body-supplied branchId/restaurantId/status cannot change the target or transition', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const attackerRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      const attackerBranch = await createBranch(
        attackerRestaurant.id,
        'INACTIVE',
      );
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          branchId: attackerBranch.id,
          restaurantId: attackerRestaurant.id,
          status: 'INACTIVE',
        },
      }).expect(200);

      const body = response.body as ActivateBranchResponseBody;
      expect(body.data.id).toBe(branch.id);
      expect(body.data.status).toBe('ACTIVE');

      const persistedTarget = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persistedTarget.status).toBe('ACTIVE');

      const persistedAttackerBranch = await prisma.branch.findUniqueOrThrow({
        where: { id: attackerBranch.id },
      });
      expect(persistedAttackerBranch.status).toBe('INACTIVE');
    });
  });

  describe('side effects', () => {
    it('activation touches only Branch.status -- existing Table/QR are untouched, no extra rows', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'INACTIVE');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const table = await prisma.table.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableNumber: 'A1',
          status: 'ACTIVE',
        },
      });
      const qr = await prisma.qrCode.create({
        data: {
          publicCode: `activate-side-effect-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });

      await postActivateBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(200);

      const persistedBranch = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persistedBranch.status).toBe('ACTIVE');

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
      expect(
        await prisma.qrCode.count({ where: { restaurantId: restaurant.id } }),
      ).toBe(1);
    });
  });
});
