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
 * Business Foundation K: proves Create Branch end-to-end through the real
 * `POST /api/v1/restaurants/{restaurantId}/branches` endpoint -- HTTP
 * Cookie -> AuthGuard -> CsrfGuard -> RestaurantAccessGuard ->
 * PermissionGuard -> AllBranchesRequiredGuard -> BranchesService ->
 * PrismaService -> PostgreSQL.
 *
 * The approved Origin under test is the real `CORS_ORIGIN` from the running
 * environment's `.env` (`http://localhost:3000`).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession rows and
 * removes them in afterEach, so the database returns to its empty state
 * regardless of test outcome.
 */
describe('POST /api/v1/restaurants/:restaurantId/branches (e2e)', () => {
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
  const CSRF_VALIDATION_FAILED_BODY = {
    error: {
      code: 'CSRF_VALIDATION_FAILED',
      message: 'Cross-origin request rejected.',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Mirrors main.ts's bootstrap() global pipe exactly, so this test
    // exercises the same DTO validation/normalization behavior Production
    // uses (trim, IsNotEmpty, IsTimeZone, whitelist stripping).
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

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const uniqueEmail = `branches-create-${randomUUID()}@example.test`;
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

  async function createMembership(params: {
    restaurantId: string;
    userId: string;
    role?: 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER';
    allBranches: boolean;
  }) {
    return prisma.restaurantMembership.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        role: params.role ?? 'OWNER',
        status: 'ACTIVE',
        allBranches: params.allBranches,
      },
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

  const VALID_BODY = {
    name: 'Maadi',
    timezone: 'Africa/Cairo',
    phone: '+20 100 000 0000',
    address: '1 Nile Street',
  };

  function postCreateBranch(params: {
    restaurantId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body?: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/branches`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body ?? VALID_BODY);
  }

  async function countBranches(restaurantId: string): Promise<number> {
    return prisma.branch.count({ where: { restaurantId } });
  }

  describe('A. unauthenticated', () => {
    it('401 UNAUTHENTICATED, no Branch created', async () => {
      const restaurant = await createRestaurant();

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        origin: APPROVED_ORIGIN,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('B. foreign Restaurant', () => {
    it('404 RESTAURANT_NOT_FOUND, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const foreignRestaurant = await createRestaurant('ACTIVE', 'Other Place');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: foreignRestaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
      expect(await countBranches(foreignRestaurant.id)).toBe(0);
    });
  });

  describe('C. non-operational Restaurant', () => {
    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'authorized Restaurant %s -> 409 RESTAURANT_NOT_OPERATIONAL, no Branch created',
      async (status) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant(status);
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateBranch({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(409);

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
        expect(await countBranches(restaurant.id)).toBe(0);
      },
    );
  });

  describe('D. Role without branches.manage', () => {
    it.each(['CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s -> 403 PERMISSION_DENIED, no Branch created',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role,
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateBranch({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(await countBranches(restaurant.id)).toBe(0);
      },
    );
  });

  describe('E. MANAGER with branches.manage but allBranches=false', () => {
    it('403 PERMISSION_DENIED, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(PERMISSION_DENIED_BODY);
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('F. MANAGER with branches.manage and allBranches=true', () => {
    it('201, Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect((response.body as { data: { name: string } }).data.name).toBe(
        'Maadi',
      );
      expect(await countBranches(restaurant.id)).toBe(1);
    });
  });

  describe('G. OWNER with allBranches=true', () => {
    it('201, Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect((response.body as { data: { status: string } }).data.status).toBe(
        'INACTIVE',
      );
      expect(await countBranches(restaurant.id)).toBe(1);
    });
  });

  describe('H. valid same-origin CSRF', () => {
    it('is allowed (covered by F/G above, asserted explicitly here too)', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);
    });
  });

  describe('I. invalid/mismatched Origin', () => {
    it('403 CSRF_VALIDATION_FAILED, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('J. missing Origin and Referer', () => {
    it('403 CSRF_VALIDATION_FAILED, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('K. mismatched Origin + valid Referer', () => {
    it('still 403, no Branch created (Origin precedence)', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
        referer: `${APPROVED_ORIGIN}/`,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('L. body restaurantId cannot override authorized Restaurant', () => {
    it('Branch belongs only to the authorized Restaurant, never the body-supplied one', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateBranch({
        restaurantId: restaurantA.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, restaurantId: restaurantB.id },
      }).expect(201);

      expect(await countBranches(restaurantA.id)).toBe(1);
      expect(await countBranches(restaurantB.id)).toBe(0);
    });
  });

  describe('M. body status cannot override server-derived INACTIVE', () => {
    it('persisted Branch remains INACTIVE even if the body sends status=ACTIVE', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, status: 'ACTIVE' },
      }).expect(201);

      expect((response.body as { data: { status: string } }).data.status).toBe(
        'INACTIVE',
      );
      const persisted = await prisma.branch.findFirstOrThrow({
        where: { restaurantId: restaurant.id },
      });
      expect(persisted.status).toBe('INACTIVE');
    });
  });

  describe('N. invalid / whitespace-only name', () => {
    it('400, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, name: '   ' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('O. invalid timezone', () => {
    it('400, no Branch created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, timezone: 'Not/AZone' },
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect(await countBranches(restaurant.id)).toBe(0);
    });
  });

  describe('P. phone/address trimming and empty-string-to-null behavior', () => {
    it('trims whitespace and normalizes empty strings to null', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: {
          name: '  Maadi  ',
          timezone: 'Africa/Cairo',
          phone: '   ',
          address: '  1 Nile Street  ',
        },
      }).expect(201);

      const data = (
        response.body as {
          data: { name: string; phone: string | null; address: string | null };
        }
      ).data;
      expect(data.name).toBe('Maadi');
      expect(data.phone).toBeNull();
      expect(data.address).toBe('1 Nile Street');
    });
  });

  describe('Q. exact response shape', () => {
    it('contains only id, name, status, timezone, phone, address', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

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

  describe('R. unrelated Restaurant and Branch rows remain unchanged', () => {
    it('creating a Branch for Restaurant A does not affect Restaurant B or its Branches', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      const existingBranchB = await prisma.branch.create({
        data: {
          publicId: `branch-${randomUUID()}`,
          restaurantId: restaurantB.id,
          name: 'Existing B Branch',
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
        },
      });
      await createMembership({
        restaurantId: restaurantA.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateBranch({
        restaurantId: restaurantA.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const stillB = await prisma.branch.findUniqueOrThrow({
        where: { id: existingBranchB.id },
      });
      expect(stillB.name).toBe('Existing B Branch');
      expect(await countBranches(restaurantB.id)).toBe(1);
    });
  });

  describe('publicId (Business Foundation K continuation)', () => {
    it('A/B. persisted publicId has the exact shape branch-<UUID>, generated by the Backend', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const createdId = (response.body as { data: { id: string } }).data.id;
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(persisted.publicId).toMatch(
        /^branch-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('C. publicId sent in the request body cannot override the generated value', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const attackerPublicId = 'branch-attacker-controlled-value';

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, publicId: attackerPublicId },
      }).expect(201);

      const createdId = (response.body as { data: { id: string } }).data.id;
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(persisted.publicId).not.toBe(attackerPublicId);
      expect(persisted.publicId).toMatch(/^branch-[0-9a-f-]{36}$/i);
    });

    it('D. two successfully created Branches receive distinct publicIds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, name: 'Branch One' },
      }).expect(201);
      await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: { ...VALID_BODY, name: 'Branch Two' },
      }).expect(201);

      const rows = await prisma.branch.findMany({
        where: { restaurantId: restaurant.id },
        select: { publicId: true },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].publicId).not.toBe(rows[1].publicId);
    });

    it('E. publicId is not present anywhere in the HTTP response', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      expect(JSON.stringify(response.body)).not.toMatch(/publicId/i);
    });

    it('F. publicId is independent from the internal Branch.id', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateBranch({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(201);

      const createdId = (response.body as { data: { id: string } }).data.id;
      const persisted = await prisma.branch.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(persisted.publicId).not.toContain(createdId);
    });
  });
});
