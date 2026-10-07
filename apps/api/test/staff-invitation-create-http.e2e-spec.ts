import { randomUUID, createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { ensureStarterRole } from './fixtures/ensure-starter-role';
import { StaffInvitationsService } from './../src/staff/staff-invitations.service';

/**
 * Business Foundation S: proves Staff Invitation Creation end-to-end through
 * the real `POST /api/v1/restaurants/{restaurantId}/invitations` endpoint --
 * HTTP Cookie -> AuthGuard -> CsrfGuard -> RestaurantAccessGuard ->
 * PermissionGuard -> StaffInvitationsService -> PrismaService -> PostgreSQL.
 *
 * INVITATION-ONLY lifecycle: no User or RestaurantMembership is ever created
 * or mutated by this endpoint.
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Invitation
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome.
 */
describe('POST /api/v1/restaurants/:restaurantId/invitations (e2e)', () => {
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
  const BRANCH_NOT_FOUND_BODY = {
    error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
  };
  const STAFF_SCOPE_EXCEEDS_AUTHORITY_BODY = {
    error: {
      code: 'STAFF_SCOPE_EXCEEDS_AUTHORITY',
      message:
        'You cannot grant Staff access beyond your authorized Branch scope.',
    },
  };
  const STAFF_INVITATION_CONFLICT_BODY = {
    error: {
      code: 'STAFF_INVITATION_CONFLICT',
      message: 'An invitation cannot be created for this email.',
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
      await prisma.restaurantInvitationBranch.deleteMany({
        where: { invitation: { restaurantId } },
      });
      await prisma.restaurantInvitation.deleteMany({ where: { restaurantId } });
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
    emailPrefix = 'staff-invite',
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
        roleId: (await ensureStarterRole(prisma, params.restaurantId, params.role ?? 'OWNER')).id,
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

  async function createPriorInvitation(params: {
    restaurantId: string;
    emailNormalized: string;
    invitedByUserId: string;
    acceptedAt?: Date;
    revokedAt?: Date;
    expiresAt?: Date;
  }) {
    return prisma.restaurantInvitation.create({
      data: {
        restaurantId: params.restaurantId,
        emailNormalized: params.emailNormalized,
        role: 'WAITER',
        allBranches: true,
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
        expiresAt: params.expiresAt ?? new Date(Date.now() + 7 * 86400000),
        acceptedAt: params.acceptedAt ?? null,
        revokedAt: params.revokedAt ?? null,
        invitedByUserId: params.invitedByUserId,
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

  function inviteeEmail(): string {
    return `invitee-${randomUUID()}@example.test`;
  }

  function postCreateInvitation(params: {
    restaurantId: string;
    cookiePair?: string;
    origin?: string;
    referer?: string;
    body: Record<string, unknown>;
  }) {
    let req = request(app.getHttpServer()).post(
      `/api/v1/restaurants/${params.restaurantId}/invitations`,
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req.send(params.body);
  }

  function validBody(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      email: inviteeEmail(),
      role: 'MANAGER',
      allBranches: true,
      branchIds: [],
      ...overrides,
    };
  }

  async function countInvitations(restaurantId: string): Promise<number> {
    return prisma.restaurantInvitation.count({ where: { restaurantId } });
  }

  interface InvitationResponseBody {
    data: {
      id: string;
      email: string;
      role: string;
      allBranches: boolean;
      branches: { id: string; name: string; status: string }[];
      expiresAt: string;
      invitationToken: string;
    };
  }

  describe('AUTHORIZED', () => {
    it('OWNER / allBranches=true creates a selected-Branch Invitation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [branch.id] }),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      expect(data.branches).toEqual([
        { id: branch.id, name: branch.name, status: 'ACTIVE' },
      ]);
      expect(await countInvitations(restaurant.id)).toBe(1);
    });

    it('OWNER creates an allBranches=true Invitation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createBranch(restaurant.id, 'ACTIVE', 'Branch A');
      await createBranch(restaurant.id, 'INACTIVE', 'Branch B');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: true, branchIds: [] }),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      expect(data.allBranches).toBe(true);
      expect(data.branches).toHaveLength(2);
    });

    it('Restaurant-wide MANAGER creates a valid Invitation', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      expect(await countInvitations(restaurant.id)).toBe(1);
    });

    describe('Branch-scoped MANAGER', () => {
      it('equal scope allowed', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
        const branchB = await createBranch(restaurant.id, 'ACTIVE', 'B');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branchA.id, branchB.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({
            allBranches: false,
            branchIds: [branchA.id, branchB.id],
          }),
        }).expect(201);
      });

      it('proper subset allowed', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
        const branchB = await createBranch(restaurant.id, 'ACTIVE', 'B');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branchA.id, branchB.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({ allBranches: false, branchIds: [branchA.id] }),
        }).expect(201);
      });

      it('out-of-scope Branch denied -> 403 STAFF_SCOPE_EXCEEDS_AUTHORITY', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
        const branchC = await createBranch(restaurant.id, 'ACTIVE', 'C');
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branchA.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({ allBranches: false, branchIds: [branchC.id] }),
        }).expect(403);

        expect(response.body).toEqual(STAFF_SCOPE_EXCEEDS_AUTHORITY_BODY);
        expect(await countInvitations(restaurant.id)).toBe(0);
      });

      it('allBranches=true grant denied', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        const branchA = await createBranch(restaurant.id);
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branchA.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({ allBranches: true, branchIds: [] }),
        }).expect(403);

        expect(response.body).toEqual(STAFF_SCOPE_EXCEEDS_AUTHORITY_BODY);
        expect(await countInvitations(restaurant.id)).toBe(0);
      });

      it('same assigned Branch requested with different letter casing is authorized, not STAFF_SCOPE_EXCEEDS_AUTHORITY', async () => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        // Deterministic id containing hexadecimal letters, not
        // randomUUID()-dependent, so the uppercase/lowercase forms are
        // guaranteed to actually differ as strings.
        const deterministicBranchId = 'aabbccdd-eeff-4abc-8def-112233445566';
        const branch = await prisma.branch.create({
          data: {
            id: deterministicBranchId,
            publicId: `branch-${randomUUID()}`,
            restaurantId: restaurant.id,
            name: 'Branch A',
            status: 'ACTIVE',
            timezone: 'Africa/Cairo',
          },
        });
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'MANAGER',
          allBranches: false,
          branchIds: [branch.id],
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({
            allBranches: false,
            branchIds: [deterministicBranchId.toUpperCase()],
          }),
        }).expect(201);

        const data = (response.body as InvitationResponseBody).data;
        expect(data.branches).toEqual([
          { id: deterministicBranchId, name: 'Branch A', status: 'ACTIVE' },
        ]);
        expect(await countInvitations(restaurant.id)).toBe(1);
        const branchRows = await prisma.restaurantInvitationBranch.findMany({
          where: { restaurantInvitationId: data.id },
          select: { branchId: true },
        });
        expect(branchRows).toEqual([{ branchId: deterministicBranchId }]);
      });
    });
  });

  describe('ROLE INPUT', () => {
    it.each(['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const)(
      '%s target allowed',
      async (role) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'OWNER',
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({ role }),
        }).expect(201);
      },
    );

    it('OWNER target -> 400 VALIDATION_ERROR', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ role: 'OWNER' }),
      }).expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
      expect(await countInvitations(restaurant.id)).toBe(0);
    });
  });

  describe('BRANCH', () => {
    it('ACTIVE Branch allowed', async () => {
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

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [branch.id] }),
      }).expect(201);
    });

    it('INACTIVE Branch allowed', async () => {
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

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [branch.id] }),
      }).expect(201);
    });

    it('unknown Branch -> 404 BRANCH_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [randomUUID()] }),
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      expect(await countInvitations(restaurant.id)).toBe(0);
    });

    it('foreign Restaurant Branch -> same 404 BRANCH_NOT_FOUND', async () => {
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
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [foreignBranch.id] }),
      }).expect(404);

      expect(response.body).toEqual(BRANCH_NOT_FOUND_BODY);
      expect(await countInvitations(restaurant.id)).toBe(0);
    });

    it('same-Restaurant out-of-authority Branch -> STAFF_SCOPE_EXCEEDS_AUTHORITY', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'B');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: false, branchIds: [branchB.id] }),
      }).expect(403);

      expect(response.body).toEqual(STAFF_SCOPE_EXCEEDS_AUTHORITY_BODY);
    });
  });

  describe('EMAIL/MEMBERSHIP', () => {
    it('email is trimmed and lowercased before persistence', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const mixedCaseEmail = `  Invitee-${randomUUID()}@Example.TEST  `;

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: mixedCaseEmail }),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      const expectedNormalized = mixedCaseEmail.trim().toLowerCase();
      expect(data.email).toBe(expectedNormalized);
      const persisted = await prisma.restaurantInvitation.findUniqueOrThrow({
        where: { id: data.id },
      });
      expect(persisted.emailNormalized).toBe(expectedNormalized);
    });

    it.each(['ACTIVE', 'INVITED', 'DISABLED'] as const)(
      'existing %s Membership -> 409 STAFF_INVITATION_CONFLICT',
      async (status) => {
        const { id: ownerId, email: ownerEmail } = await createTestUser();
        const { id: targetUserId, email: targetEmail } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({
          restaurantId: restaurant.id,
          userId: ownerId,
          role: 'OWNER',
          allBranches: true,
        });
        await createMembership({
          restaurantId: restaurant.id,
          userId: targetUserId,
          role: 'WAITER',
          status,
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(ownerEmail);

        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody({ email: targetEmail }),
        }).expect(409);

        expect(response.body).toEqual(STAFF_INVITATION_CONFLICT_BODY);
        expect(await countInvitations(restaurant.id)).toBe(0);
      },
    );

    it('existing global User belonging only to Restaurant B -> Invitation to A succeeds, B untouched, no A Membership created', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const { id: otherUserId, email: otherUserEmail } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      await createMembership({
        restaurantId: restaurantA.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const membershipB = await createMembership({
        restaurantId: restaurantB.id,
        userId: otherUserId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(ownerEmail);

      await postCreateInvitation({
        restaurantId: restaurantA.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: otherUserEmail }),
      }).expect(201);

      const persistedUser = await prisma.user.findUniqueOrThrow({
        where: { id: otherUserId },
      });
      expect(persistedUser.status).toBe('ACTIVE');
      const persistedMembershipB =
        await prisma.restaurantMembership.findUniqueOrThrow({
          where: { id: membershipB.id },
        });
      expect(persistedMembershipB.status).toBe('ACTIVE');
      const membershipsInA = await prisma.restaurantMembership.count({
        where: { restaurantId: restaurantA.id },
      });
      expect(membershipsInA).toBe(1); // only the OWNER's own Membership
    });

    it('completely new email -> Invitation succeeds, NO User row created, NO RestaurantMembership created', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const newEmail = inviteeEmail();
      const usersBefore = await prisma.user.count();

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: newEmail }),
      }).expect(201);

      const usersAfter = await prisma.user.count();
      expect(usersAfter).toBe(usersBefore);
      const membershipsInRestaurant = await prisma.restaurantMembership.count({
        where: { restaurantId: restaurant.id },
      });
      expect(membershipsInRestaurant).toBe(1); // only the OWNER's own Membership
    });
  });

  describe('SELF', () => {
    it("inviter's own email -> 409 STAFF_INVITATION_CONFLICT", async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email }),
      }).expect(409);

      expect(response.body).toEqual(STAFF_INVITATION_CONFLICT_BODY);
    });
  });

  describe('INVITATION HISTORY', () => {
    it('pending duplicate -> 409 STAFF_INVITATION_CONFLICT', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const targetEmail = inviteeEmail();
      await createPriorInvitation({
        restaurantId: restaurant.id,
        emailNormalized: targetEmail,
        invitedByUserId: userId,
      });

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: targetEmail }),
      }).expect(409);

      expect(response.body).toEqual(STAFF_INVITATION_CONFLICT_BODY);
      expect(await countInvitations(restaurant.id)).toBe(1);
    });

    it('expired prior Invitation -> new Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const targetEmail = inviteeEmail();
      await createPriorInvitation({
        restaurantId: restaurant.id,
        emailNormalized: targetEmail,
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() - 1000),
      });

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: targetEmail }),
      }).expect(201);

      expect(await countInvitations(restaurant.id)).toBe(2);
    });

    it('revoked prior Invitation -> new Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const targetEmail = inviteeEmail();
      await createPriorInvitation({
        restaurantId: restaurant.id,
        emailNormalized: targetEmail,
        invitedByUserId: userId,
        revokedAt: new Date(),
      });

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: targetEmail }),
      }).expect(201);

      expect(await countInvitations(restaurant.id)).toBe(2);
    });

    it('accepted prior Invitation (with no current Membership) -> new Create succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const targetEmail = inviteeEmail();
      await createPriorInvitation({
        restaurantId: restaurant.id,
        emailNormalized: targetEmail,
        invitedByUserId: userId,
        acceptedAt: new Date(),
      });

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ email: targetEmail }),
      }).expect(201);

      expect(await countInvitations(restaurant.id)).toBe(2);
    });
  });

  describe('CONCURRENCY', () => {
    it('two truly concurrent requests for the same Restaurant + email -> exactly one 201, one 409, exactly one pending Invitation remains', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);
      const targetEmail = inviteeEmail();
      const body = validBody({ email: targetEmail });

      const [first, second] = await Promise.all([
        postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body,
        }),
        postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body,
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
      const conflictResponse = [first, second].find(
        (response) => response.status === 409,
      );
      expect(conflictResponse?.body).toEqual(STAFF_INVITATION_CONFLICT_BODY);
      expect(await countInvitations(restaurant.id)).toBe(1);
    }, 20000);
  });

  describe('TOKEN', () => {
    it('201 returns a raw invitationToken whose hash matches the persisted tokenHash, and the hash never appears in the response', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      expect(data.invitationToken).toBeTruthy();
      const persisted = await prisma.restaurantInvitation.findUniqueOrThrow({
        where: { id: data.id },
      });
      const computedHash = createHash('sha256')
        .update(data.invitationToken)
        .digest('hex');
      expect(computedHash).toBe(persisted.tokenHash);
      expect(data.invitationToken).not.toBe(persisted.tokenHash);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(new RegExp(persisted.tokenHash));
      expect(serialized).not.toMatch(/tokenHash/i);
    });
  });

  describe('TTL', () => {
    it('expiresAt is approximately the configured 7-day default', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      const daysFromNow =
        (new Date(data.expiresAt).getTime() - Date.now()) / 86400000;
      expect(daysFromNow).toBeGreaterThan(6.9);
      expect(daysFromNow).toBeLessThan(7.1);
    });
  });

  describe('PERSISTENCE', () => {
    it('allBranches=true -> zero RestaurantInvitationBranch rows', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({ allBranches: true, branchIds: [] }),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      const branchRowCount = await prisma.restaurantInvitationBranch.count({
        where: { restaurantInvitationId: data.id },
      });
      expect(branchRowCount).toBe(0);
    });

    it('allBranches=false -> exact InvitationBranch rows', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'B');
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody({
          allBranches: false,
          branchIds: [branchA.id, branchB.id],
        }),
      }).expect(201);

      const data = (response.body as InvitationResponseBody).data;
      const branchRows = await prisma.restaurantInvitationBranch.findMany({
        where: { restaurantInvitationId: data.id },
        select: { branchId: true },
      });
      expect(branchRows.map((r) => r.branchId).sort()).toEqual(
        [branchA.id, branchB.id].sort(),
      );
    });
  });

  describe('Foundation R interaction', () => {
    it('a pending Invitation does NOT appear in GET /restaurants/:restaurantId/memberships', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      const membershipsResponse = await request(app.getHttpServer())
        .get(`/api/v1/restaurants/${restaurant.id}/memberships`)
        .set('Cookie', cookiePair)
        .expect(200);

      const memberships = (
        membershipsResponse.body as {
          data: { id: string }[];
        }
      ).data;
      expect(memberships).toHaveLength(1); // only the OWNER's own Membership
    });
  });

  describe('AUTHORIZATION', () => {
    it('unauthenticated -> 401 UNAUTHENTICATED', async () => {
      const restaurant = await createRestaurant();

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unsafe request without valid CSRF origin -> 403 CSRF_VALIDATION_FAILED', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: FOREIGN_ORIGIN,
        body: validBody(),
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countInvitations(restaurant.id)).toBe(0);
    });

    it('unknown/inaccessible Restaurant -> 404 RESTAURANT_NOT_FOUND', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: randomUUID(),
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(404);

      expect(response.body).toEqual(RESTAURANT_NOT_FOUND_BODY);
    });

    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'non-operational Restaurant %s -> 409 RESTAURANT_NOT_OPERATIONAL',
      async (status) => {
        const { id: userId, email } = await createTestUser();
        const restaurant = await createRestaurant(status);
        await createMembership({
          restaurantId: restaurant.id,
          userId,
          role: 'OWNER',
          allBranches: true,
        });
        const cookiePair = await loginAndGetCookie(email);

        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(),
        }).expect(409);

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
      },
    );

    it('Role without users.manage -> 403 PERMISSION_DENIED, and the business service is never called', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'WAITER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const staffInvitationsService = app.get(StaffInvitationsService);
      const spy = jest.spyOn(staffInvitationsService, 'createInvitation');
      try {
        const response = await postCreateInvitation({
          restaurantId: restaurant.id,
          cookiePair,
          origin: APPROVED_ORIGIN,
          body: validBody(),
        }).expect(403);

        expect(response.body).toEqual(PERMISSION_DENIED_BODY);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('SECURITY', () => {
    it('no passwordHash/tokenHash/User.status/other-Restaurant Membership/Platform Admin/restaurantId/invitedByUserId/timestamps leak', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      const response = await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/tokenHash/i);
      expect(serialized).not.toMatch(/platformAdmin/i);
      expect(serialized).not.toMatch(/restaurantId/i);
      expect(serialized).not.toMatch(/invitedByUserId/i);
      expect(serialized).not.toMatch(/createdAt/i);
      expect(serialized).not.toMatch(/acceptedAt/i);
      expect(serialized).not.toMatch(/revokedAt/i);

      const data = (response.body as InvitationResponseBody).data;
      expect(Object.keys(data).sort()).toEqual(
        [
          'id',
          'email',
          'role',
          'allBranches',
          'branches',
          'expiresAt',
          'invitationToken',
        ].sort(),
      );
    });
  });

  describe('no unrelated side effects', () => {
    it('creating an Invitation does not mutate any existing User or Membership row', async () => {
      const { id: userId, email } = await createTestUser();
      const restaurant = await createRestaurant();
      const ownerMembership = await createMembership({
        restaurantId: restaurant.id,
        userId,
        role: 'OWNER',
        allBranches: true,
      });
      const cookiePair = await loginAndGetCookie(email);

      await postCreateInvitation({
        restaurantId: restaurant.id,
        cookiePair,
        origin: APPROVED_ORIGIN,
        body: validBody(),
      }).expect(201);

      const persistedMembership =
        await prisma.restaurantMembership.findUniqueOrThrow({
          where: { id: ownerMembership.id },
        });
      expect(persistedMembership.updatedAt).toEqual(ownerMembership.updatedAt);
      const persistedUser = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(persistedUser.status).toBe('ACTIVE');
    });
  });
});
