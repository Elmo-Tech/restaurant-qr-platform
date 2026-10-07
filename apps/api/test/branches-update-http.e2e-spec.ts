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
 * Business Foundation N: proves Branch Basic Info Update end-to-end through
 * the real `PATCH /api/v1/restaurants/{restaurantId}/branches/{branchId}`
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
describe('PATCH /api/v1/restaurants/:restaurantId/branches/:branchId (e2e)', () => {
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
    const uniqueEmail = `branches-update-${randomUUID()}@example.test`;
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

  async function createBranch(params: {
    restaurantId: string;
    status?: 'ACTIVE' | 'INACTIVE';
    name?: string;
    timezone?: string;
    phone?: string | null;
    address?: string | null;
  }) {
    return prisma.branch.create({
      data: {
        publicId: `branch-${randomUUID()}`,
        restaurantId: params.restaurantId,
        name: params.name ?? 'Old Name',
        status: params.status ?? 'ACTIVE',
        timezone: params.timezone ?? 'Africa/Cairo',
        phone: params.phone ?? null,
        address: params.address ?? null,
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

  function patchBranch(params: {
    restaurantId: string;
    branchId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).patch(
      `/api/v1/restaurants/${params.restaurantId}/branches/${params.branchId}`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body ?? {});
  }

  interface UpdateBranchResponseBody {
    data: {
      id: string;
      name: string;
      status: string;
      timezone: string;
      phone: string | null;
      address: string | null;
    };
  }

  describe('success across Role/scope combinations', () => {
    it('OWNER/allBranches=true + ACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'ACTIVE',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'New Name' },
      }).expect(200);

      expect((response.body as UpdateBranchResponseBody).data.name).toBe(
        'New Name',
      );
    });

    it('OWNER/allBranches=true + INACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'INACTIVE',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'New Name' },
      }).expect(200);

      expect((response.body as UpdateBranchResponseBody).data.status).toBe(
        'INACTIVE',
      );
    });

    it('MANAGER/allBranches=false + assigned INACTIVE Branch -> 200', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'INACTIVE',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branch.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          name: 'New Name',
          timezone: 'Africa/Cairo',
          phone: '+20 100 000 0000',
          address: '1 Nile Street',
        },
      }).expect(200);

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.name).toBe('New Name');
      expect(persisted.timezone).toBe('Africa/Cairo');
      expect(persisted.phone).toBe('+20 100 000 0000');
      expect(persisted.address).toBe('1 Nile Street');
    });
  });

  describe('PATCH semantics', () => {
    it('updating only name leaves timezone/phone/address/status unchanged', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'ACTIVE',
        name: 'Old Name',
        timezone: 'Africa/Cairo',
        phone: '123',
        address: 'Old Address',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: '  New Name  ' },
      }).expect(200);

      const data = (response.body as UpdateBranchResponseBody).data;
      expect(data.name).toBe('New Name');
      expect(data.timezone).toBe('Africa/Cairo');
      expect(data.phone).toBe('123');
      expect(data.address).toBe('Old Address');
      expect(data.status).toBe('ACTIVE');

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.name).toBe('New Name');
      expect(persisted.timezone).toBe('Africa/Cairo');
      expect(persisted.phone).toBe('123');
      expect(persisted.address).toBe('Old Address');
      expect(persisted.status).toBe('ACTIVE');
    });

    it('explicit phone: null and address: "   " both clear, without changing other fields', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        name: 'Kept Name',
        timezone: 'Africa/Cairo',
        phone: '123',
        address: 'Old Address',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { phone: null, address: '   ' },
      }).expect(200);

      const data = (response.body as UpdateBranchResponseBody).data;
      expect(data.phone).toBeNull();
      expect(data.address).toBeNull();
      expect(data.name).toBe('Kept Name');
      expect(data.timezone).toBe('Africa/Cairo');

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.phone).toBeNull();
      expect(persisted.address).toBeNull();
      expect(persisted.name).toBe('Kept Name');
    });
  });

  describe('empty PATCH', () => {
    it('{} -> 200, exact current Branch state, nothing changed', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        name: 'Unchanged Name',
        timezone: 'Africa/Cairo',
        phone: '123',
        address: 'Some Address',
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {},
      }).expect(200);

      const data = (response.body as UpdateBranchResponseBody).data;
      expect(data).toEqual({
        id: branch.id,
        name: 'Unchanged Name',
        status: 'ACTIVE',
        timezone: 'Africa/Cairo',
        phone: '123',
        address: 'Some Address',
      });

      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.name).toBe('Unchanged Name');
      expect(persisted.timezone).toBe('Africa/Cairo');
      expect(persisted.phone).toBe('123');
      expect(persisted.address).toBe('Some Address');
    });
  });

  describe('exact response shape', () => {
    it('contains only id, name, status, timezone, phone, address', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'New Name' },
      }).expect(200);

      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(Object.keys(data).sort()).toEqual(
        ['address', 'id', 'name', 'phone', 'status', 'timezone'].sort(),
      );
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/publicId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/updatedAt/i);
    });
  });

  describe('authority', () => {
    it('body-supplied branchId/restaurantId/status/publicId cannot control persistence or target', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const attackerRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'ACTIVE',
      });
      const attackerBranch = await createBranch({
        restaurantId: attackerRestaurant.id,
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          name: 'Legitimate Name',
          branchId: attackerBranch.id,
          restaurantId: attackerRestaurant.id,
          status: 'INACTIVE',
          publicId: 'attacker-public-id',
        },
      }).expect(200);

      const data = (response.body as UpdateBranchResponseBody).data;
      expect(data.id).toBe(branch.id);
      expect(data.name).toBe('Legitimate Name');
      expect(data.status).toBe('ACTIVE');

      const persistedTarget = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persistedTarget.name).toBe('Legitimate Name');
      expect(persistedTarget.status).toBe('ACTIVE');

      const persistedAttackerBranch = await prisma.branch.findUniqueOrThrow({
        where: { id: attackerBranch.id },
      });
      expect(persistedAttackerBranch.name).not.toBe('Legitimate Name');
    });
  });

  describe('security', () => {
    it('unauthenticated -> 401, Branch unchanged', async () => {
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        origin: APPROVED_ORIGIN,
        body: { name: 'Attempted Name' },
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persisted.name).not.toBe('Attempted Name');
    });

    it('invalid/mismatched Origin -> 403 CSRF_VALIDATION_FAILED, Branch unchanged', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
        body: { name: 'Attempted Name' },
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
    });

    it('unknown Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: randomUUID(),
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it('authorized but INACTIVE Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('INACTIVE');
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(409);

      expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
    });

    it('authorized but SUSPENDED Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('SUSPENDED');
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
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

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
    });

    it('foreign-Restaurant Branch -> 404 BRANCH_NOT_FOUND, Branch unchanged', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const foreignBranch = await createBranch({
        restaurantId: foreignRestaurant.id,
      });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: foreignBranch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'Attempted Name' },
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: foreignBranch.id },
      });
      expect(persisted.name).not.toBe('Attempted Name');
    });

    it('allBranches=false + same-Restaurant unassigned Branch -> 403 BRANCH_ACCESS_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(BRANCH_ACCESS_DENIED_BODY);
    });

    it('Role without branches.manage (WAITER) -> 403 PERMISSION_DENIED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
    });

    it('whitespace-only name -> 400 VALIDATION_ERROR', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: '   ' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });

    it('invalid timezone -> 400 VALIDATION_ERROR', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({ restaurantId: restaurant.id });
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { timezone: 'Not/AZone' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  describe('side effects', () => {
    it('update touches only Branch basic-info fields -- existing Table/QR are untouched', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch({
        restaurantId: restaurant.id,
        status: 'ACTIVE',
      });
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
          publicCode: `update-side-effect-${randomUUID()}`,
          restaurantId: restaurant.id,
          branchId: branch.id,
          tableId: table.id,
          type: 'TABLE',
          status: 'ACTIVE',
        },
      });

      await patchBranch({
        restaurantId: restaurant.id,
        branchId: branch.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { name: 'New Name' },
      }).expect(200);

      const persistedBranch = await prisma.branch.findUniqueOrThrow({
        where: { id: branch.id },
      });
      expect(persistedBranch.name).toBe('New Name');
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
