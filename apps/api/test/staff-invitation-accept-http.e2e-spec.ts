import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationExceptionFactory } from './../src/common/http/validation-exception.factory';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Business Foundation T: proves Staff Invitation Acceptance end-to-end
 * through the real `POST /api/v1/auth/invitations/accept` endpoint -- HTTP
 * -> InvitationAcceptanceService -> PrismaService -> PostgreSQL. No guard of
 * any kind protects this route (public, token-authorized).
 *
 * Creates temporary Restaurant/Branch/User/Membership/AuthSession/Invitation
 * rows and removes them in afterEach, so the database returns to its empty
 * state regardless of test outcome. New Users created BY the endpoint itself
 * (not tracked via an explicit id) are cleaned up by normalized email.
 */
describe('POST /api/v1/auth/invitations/accept (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdRestaurantIds: string[] = [];
  const createdUserIds: string[] = [];
  const invitationEmails: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const NEW_PASSWORD = 'a brand new password value';

  const INVITATION_NOT_FOUND_BODY = {
    error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' },
  };
  const RESTAURANT_NOT_OPERATIONAL_BODY = {
    error: {
      code: 'RESTAURANT_NOT_OPERATIONAL',
      message: 'Restaurant is not currently operational.',
    },
  };
  const INVALID_CREDENTIALS_BODY = {
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
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
      await prisma.branch.deleteMany({ where: { restaurantId } });
      await prisma.restaurant.delete({ where: { id: restaurantId } });
    }
    for (const userId of createdUserIds.splice(0)) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    for (const email of invitationEmails.splice(0)) {
      const user = await prisma.user.findUnique({
        where: { emailNormalized: email },
        select: { id: true },
      });
      if (user) {
        await prisma.authSession.deleteMany({ where: { userId: user.id } });
        await prisma.user.deleteMany({ where: { id: user.id } });
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(
    emailPrefix = 'staff-accept',
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

  function generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }
  function hashRawToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async function createInvitation(params: {
    restaurantId: string;
    emailNormalized: string;
    role?: 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'WAITER' | 'OWNER';
    allBranches: boolean;
    invitedByUserId: string;
    branchIds?: string[];
    expiresAt?: Date;
    acceptedAt?: Date;
    revokedAt?: Date;
  }): Promise<{ id: string; rawToken: string }> {
    invitationEmails.push(params.emailNormalized);
    const rawToken = generateRawToken();
    const tokenHash = hashRawToken(rawToken);
    const invitation = await prisma.restaurantInvitation.create({
      data: {
        restaurantId: params.restaurantId,
        emailNormalized: params.emailNormalized,
        role: params.role ?? 'WAITER',
        allBranches: params.allBranches,
        tokenHash,
        expiresAt: params.expiresAt ?? new Date(Date.now() + 7 * 86400000),
        acceptedAt: params.acceptedAt ?? null,
        revokedAt: params.revokedAt ?? null,
        invitedByUserId: params.invitedByUserId,
      },
    });
    for (const branchId of params.branchIds ?? []) {
      await prisma.restaurantInvitationBranch.create({
        data: { restaurantInvitationId: invitation.id, branchId },
      });
    }
    return { id: invitation.id, rawToken };
  }

  function inviteeEmail(): string {
    return `invitee-${randomUUID()}@example.test`;
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

  function postAccept(params: {
    token: string;
    password: string;
    cookiePair?: string;
  }) {
    let req = request(app.getHttpServer()).post(
      '/api/v1/auth/invitations/accept',
    );
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    return req.send({ token: params.token, password: params.password });
  }

  describe('HTTP success', () => {
    it('204 No Content, no response body, no Set-Cookie', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(204);

      expect(response.body).toEqual({});
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('no authority guards', () => {
    it('succeeds with no Staff session at all', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);
    });

    it('an ambient session cookie belonging to a DIFFERENT User has zero effect on which User the Invitation resolves to', async () => {
      const { id: ownerId } = await createTestUser();
      const { id: bystanderUserId, email: bystanderEmail } =
        await createTestUser('bystander');
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const invitedEmail = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: invitedEmail,
        allBranches: true,
        invitedByUserId: ownerId,
      });
      const bystanderCookie = await loginAndGetCookie(bystanderEmail);

      await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
        cookiePair: bystanderCookie,
      }).expect(204);

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: invitedEmail },
      });
      const membership = await prisma.restaurantMembership.findFirst({
        where: { restaurantId: restaurant.id, userId: createdUser.id },
      });
      expect(membership).not.toBeNull();
      // The bystander never gained anything from this request.
      const bystanderMembership = await prisma.restaurantMembership.findFirst({
        where: { restaurantId: restaurant.id, userId: bystanderUserId },
      });
      expect(bystanderMembership).toBeNull();
    });
  });

  describe('TOKEN states -> identical generic 404', () => {
    it('malformed token', async () => {
      const response = await postAccept({
        token: 'not-a-real-token-shape',
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('unknown (well-formed but never-issued) token', async () => {
      const response = await postAccept({
        token: generateRawToken(),
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('expired Invitation', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
        expiresAt: new Date(Date.now() - 1000),
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('revoked Invitation', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
        revokedAt: new Date(),
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('already-accepted Invitation', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
        acceptedAt: new Date(),
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });
  });

  describe('NEW USER', () => {
    it('creates exactly one User with normalized email, hashed verifiable password, ACTIVE status; Membership ACTIVE with Role/allBranches copied; acceptedAt set', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        role: 'MANAGER',
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: email },
      });
      expect(createdUser.email).toBe(email);
      expect(createdUser.status).toBe('ACTIVE');
      expect(createdUser.preferredLocale).toBeNull();
      const passwordMatches = await passwordHasherService.verifyPassword(
        NEW_PASSWORD,
        createdUser.passwordHash,
      );
      expect(passwordMatches).toBe(true);

      const membership = await prisma.restaurantMembership.findFirstOrThrow({
        where: { restaurantId: restaurant.id, userId: createdUser.id },
      });
      expect(membership.role).toBe('MANAGER');
      expect(membership.allBranches).toBe(true);
      expect(membership.status).toBe('ACTIVE');

      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).not.toBeNull();
    });

    it('exactly one User row exists for the invited email after acceptance', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const count = await prisma.user.count({
        where: { emailNormalized: email },
      });
      expect(count).toBe(1);
    });
  });

  describe('EXISTING ACTIVE USER', () => {
    it('correct current password succeeds; passwordHash remains byte-for-byte unchanged', async () => {
      const { id: ownerId } = await createTestUser();
      const { id: existingUserId } = await createTestUser('existing');
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const beforeUser = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: beforeUser.emailNormalized,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: PASSWORD }).expect(204);

      const afterUser = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });
      expect(afterUser.passwordHash).toBe(beforeUser.passwordHash);
      const membership = await prisma.restaurantMembership.findFirstOrThrow({
        where: { restaurantId: restaurant.id, userId: existingUserId },
      });
      expect(membership.status).toBe('ACTIVE');
    });

    it('wrong current password -> exact existing 401 INVALID_CREDENTIALS, no mutation', async () => {
      const { id: ownerId } = await createTestUser();
      const { id: existingUserId } = await createTestUser('existing');
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const beforeUser = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: beforeUser.emailNormalized,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      const response = await postAccept({
        token: rawToken,
        password: 'definitely the wrong password',
      }).expect(401);

      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      const afterUser = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });
      expect(afterUser.passwordHash).toBe(beforeUser.passwordHash);
      const membership = await prisma.restaurantMembership.findFirst({
        where: { restaurantId: restaurant.id, userId: existingUserId },
      });
      expect(membership).toBeNull();
      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).toBeNull();
    });

    it("existing User's other-Restaurant Membership and AuthSession remain untouched", async () => {
      const { id: ownerId } = await createTestUser();
      const { id: existingUserId, email: existingEmail } =
        await createTestUser('existing');
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
        userId: existingUserId,
        role: 'WAITER',
        allBranches: true,
      });
      const existingCookie = await loginAndGetCookie(existingEmail);
      const beforeUser = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurantA.id,
        emailNormalized: beforeUser.emailNormalized,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: PASSWORD }).expect(204);

      const persistedMembershipB =
        await prisma.restaurantMembership.findUniqueOrThrow({
          where: { id: membershipB.id },
        });
      expect(persistedMembershipB.status).toBe('ACTIVE');
      expect(persistedMembershipB.updatedAt).toEqual(membershipB.updatedAt);
      const session = await prisma.authSession.findFirst({
        where: { userId: existingUserId },
      });
      expect(session).not.toBeNull();
      void existingCookie;
    });
  });

  describe('GLOBAL USER STATUS', () => {
    it.each(['INVITED', 'DISABLED'] as const)(
      'existing global User %s -> generic 404, no password check side effect observable',
      async (status) => {
        const { id: ownerId } = await createTestUser();
        const restaurant = await createRestaurant();
        await createMembership({
          restaurantId: restaurant.id,
          userId: ownerId,
          role: 'OWNER',
          allBranches: true,
        });
        const email = inviteeEmail();
        const passwordHash = await passwordHasherService.hashPassword(PASSWORD);
        const blockedUser = await prisma.user.create({
          data: {
            email,
            emailNormalized: email,
            passwordHash,
            status,
          },
        });
        createdUserIds.push(blockedUser.id);
        const { rawToken } = await createInvitation({
          restaurantId: restaurant.id,
          emailNormalized: email,
          allBranches: true,
          invitedByUserId: ownerId,
        });

        const response = await postAccept({
          token: rawToken,
          password: PASSWORD,
        }).expect(404);

        expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
        const membership = await prisma.restaurantMembership.findFirst({
          where: { restaurantId: restaurant.id, userId: blockedUser.id },
        });
        expect(membership).toBeNull();
      },
    );
  });

  describe('TARGET MEMBERSHIP already exists', () => {
    it.each(['ACTIVE', 'INVITED', 'DISABLED'] as const)(
      'existing target-Restaurant Membership status=%s -> generic 404, row unchanged',
      async (status) => {
        const { id: ownerId } = await createTestUser();
        const { id: existingUserId } = await createTestUser('existing');
        const restaurant = await createRestaurant();
        await createMembership({
          restaurantId: restaurant.id,
          userId: ownerId,
          role: 'OWNER',
          allBranches: true,
        });
        const existingMembership = await createMembership({
          restaurantId: restaurant.id,
          userId: existingUserId,
          role: 'WAITER',
          status,
          allBranches: true,
        });
        const existingUser = await prisma.user.findUniqueOrThrow({
          where: { id: existingUserId },
        });
        const { rawToken } = await createInvitation({
          restaurantId: restaurant.id,
          emailNormalized: existingUser.emailNormalized,
          allBranches: true,
          invitedByUserId: ownerId,
        });

        const response = await postAccept({
          token: rawToken,
          password: PASSWORD,
        }).expect(404);

        expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
        const persisted = await prisma.restaurantMembership.findUniqueOrThrow({
          where: { id: existingMembership.id },
        });
        expect(persisted.status).toBe(status);
        expect(persisted.updatedAt).toEqual(existingMembership.updatedAt);
      },
    );
  });

  describe('INVITER current authority revalidation', () => {
    it('still-authorized inviter (unchanged) succeeds', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);
    });

    it('inviter Membership disabled after Create -> generic 404, no mutation', async () => {
      const { id: managerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const managerMembership = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: true,
      });
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: managerId,
      });
      await prisma.restaurantMembership.update({
        where: { id: managerMembership.id },
        data: { status: 'DISABLED' },
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).toBeNull();
    });

    it('inviter Role changed to one without users.manage after Create -> generic 404', async () => {
      const { id: managerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const managerMembership = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: managerId,
      });
      await prisma.restaurantMembership.update({
        where: { id: managerMembership.id },
        data: { role: 'WAITER' },
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('Branch-scoped inviter who lost the granted Branch after Create -> generic 404', async () => {
      const { id: managerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const branchB = await createBranch(restaurant.id, 'ACTIVE', 'B');
      const managerMembership = await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: false,
        invitedByUserId: managerId,
        branchIds: [branchA.id],
      });
      // Inviter's scope narrows to Branch B only, after Create.
      await prisma.restaurantMembershipBranch.deleteMany({
        where: { restaurantMembershipId: managerMembership.id },
      });
      await prisma.restaurantMembershipBranch.create({
        data: {
          restaurantMembershipId: managerMembership.id,
          branchId: branchB.id,
        },
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
    });

    it('Branch-scoped inviter retaining the granted Branch still succeeds', async () => {
      const { id: managerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
      await createMembership({
        restaurantId: restaurant.id,
        userId: managerId,
        role: 'MANAGER',
        allBranches: false,
        branchIds: [branchA.id],
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: false,
        invitedByUserId: managerId,
        branchIds: [branchA.id],
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);
    });
  });

  describe('BRANCH', () => {
    it('allBranches=true -> zero MembershipBranch rows created', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: email },
      });
      const membership = await prisma.restaurantMembership.findFirstOrThrow({
        where: { restaurantId: restaurant.id, userId: createdUser.id },
      });
      const branchRows = await prisma.restaurantMembershipBranch.count({
        where: { restaurantMembershipId: membership.id },
      });
      expect(branchRows).toBe(0);
    });

    it('allBranches=false materializes exactly the validated InvitationBranch rows (INACTIVE Branch included)', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branchA = await createBranch(restaurant.id, 'ACTIVE', 'A');
      const branchB = await createBranch(restaurant.id, 'INACTIVE', 'B');
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: false,
        invitedByUserId: ownerId,
        branchIds: [branchA.id, branchB.id],
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: email },
      });
      const membership = await prisma.restaurantMembership.findFirstOrThrow({
        where: { restaurantId: restaurant.id, userId: createdUser.id },
      });
      expect(membership.allBranches).toBe(false);
      const branchRows = await prisma.restaurantMembershipBranch.findMany({
        where: { restaurantMembershipId: membership.id },
        select: { branchId: true },
      });
      expect(branchRows.map((r) => r.branchId).sort()).toEqual(
        [branchA.id, branchB.id].sort(),
      );
    });

    it('corrupt: allBranches=false with zero InvitationBranch rows -> fails closed, no User/Membership created', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      // Directly constructed corrupt fixture: Foundation S itself would
      // never allow a scoped Invitation with zero Branch rows.
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: false,
        invitedByUserId: ownerId,
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
      const userCount = await prisma.user.count({
        where: { emailNormalized: email },
      });
      expect(userCount).toBe(0);
      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).toBeNull();
    });

    it('corrupt: allBranches=false InvitationBranch row points at a foreign Restaurant -> fails closed, never leaks the foreign Branch', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant('ACTIVE', 'Restaurant A');
      const foreignRestaurant = await createRestaurant(
        'ACTIVE',
        'Restaurant B',
      );
      const foreignBranch = await createBranch(foreignRestaurant.id);
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      // Directly constructed corrupt fixture: a malformed cross-Restaurant
      // join row that normal Create validation would never allow.
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: false,
        invitedByUserId: ownerId,
        branchIds: [foreignBranch.id],
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(404);

      expect(response.body).toEqual(INVITATION_NOT_FOUND_BODY);
      const userCount = await prisma.user.count({
        where: { emailNormalized: email },
      });
      expect(userCount).toBe(0);
      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).toBeNull();
    });
  });

  describe('RESTAURANT operational state', () => {
    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      '%s Restaurant -> 409 RESTAURANT_NOT_OPERATIONAL, Invitation left unconsumed',
      async (status) => {
        const { id: ownerId } = await createTestUser();
        const restaurant = await createRestaurant('ACTIVE');
        await createMembership({
          restaurantId: restaurant.id,
          userId: ownerId,
          role: 'OWNER',
          allBranches: true,
        });
        const { id: invitationId, rawToken } = await createInvitation({
          restaurantId: restaurant.id,
          emailNormalized: inviteeEmail(),
          allBranches: true,
          invitedByUserId: ownerId,
        });
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { status },
        });

        const response = await postAccept({
          token: rawToken,
          password: NEW_PASSWORD,
        }).expect(409);

        expect(response.body).toEqual(RESTAURANT_NOT_OPERATIONAL_BODY);
        const persistedInvitation =
          await prisma.restaurantInvitation.findUniqueOrThrow({
            where: { id: invitationId },
          });
        expect(persistedInvitation.acceptedAt).toBeNull();
      },
    );
  });

  describe('CONCURRENCY', () => {
    it('two truly concurrent accepts of the same token -> exactly one 204, one generic 404, exactly one resulting User/Membership', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      const branch = await createBranch(restaurant.id, 'ACTIVE', 'A');
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { id: invitationId, rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        allBranches: false,
        invitedByUserId: ownerId,
        branchIds: [branch.id],
      });

      const [first, second] = await Promise.all([
        postAccept({ token: rawToken, password: NEW_PASSWORD }),
        postAccept({ token: rawToken, password: NEW_PASSWORD }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([204, 404]);
      const notFoundResponse = [first, second].find((r) => r.status === 404);
      expect(notFoundResponse?.body).toEqual(INVITATION_NOT_FOUND_BODY);

      const userCount = await prisma.user.count({
        where: { emailNormalized: email },
      });
      expect(userCount).toBe(1);
      const membershipCount = await prisma.restaurantMembership.count({
        where: { restaurantId: restaurant.id },
      });
      // OWNER's own pre-existing Membership + exactly one new invitee
      // Membership -- never two invitee Memberships from the concurrent race.
      expect(membershipCount).toBe(2);
      const inviteeMembership =
        await prisma.restaurantMembership.findFirstOrThrow({
          where: { restaurantId: restaurant.id, userId: { not: ownerId } },
        });
      const inviteeMembershipCount = await prisma.restaurantMembership.count({
        where: { restaurantId: restaurant.id, userId: { not: ownerId } },
      });
      expect(inviteeMembershipCount).toBe(1);
      expect(inviteeMembership.allBranches).toBe(false);
      const branchRows = await prisma.restaurantMembershipBranch.findMany({
        where: { restaurantMembershipId: inviteeMembership.id },
        select: { branchId: true },
      });
      // Exactly one MembershipBranch row, matching the invited Branch --
      // never duplicated by the concurrent race.
      expect(branchRows).toHaveLength(1);
      expect(branchRows[0]?.branchId).toBe(branch.id);
      const persistedInvitation =
        await prisma.restaurantInvitation.findUniqueOrThrow({
          where: { id: invitationId },
        });
      expect(persistedInvitation.acceptedAt).not.toBeNull();
    }, 20000);
  });

  describe('Foundation R interaction', () => {
    it('the resulting Membership appears in GET /restaurants/:restaurantId/memberships after acceptance', async () => {
      const { id: ownerId, email: ownerEmail } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const email = inviteeEmail();
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: email,
        role: 'WAITER',
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const ownerCookie = await loginAndGetCookie(ownerEmail);
      const membershipsResponse = await request(app.getHttpServer())
        .get(`/api/v1/restaurants/${restaurant.id}/memberships`)
        .set('Cookie', ownerCookie)
        .expect(200);

      const memberships = (
        membershipsResponse.body as {
          data: { user: { email: string }; role: string; status: string }[];
        }
      ).data;
      const invitee = memberships.find((m) => m.user.email === email);
      expect(invitee).toBeDefined();
      expect(invitee?.role).toBe('WAITER');
      expect(invitee?.status).toBe('ACTIVE');
    });
  });

  describe('SECURITY', () => {
    it('response never leaks passwordHash/tokenHash/invitedByUserId/Membership internals -- body is always empty', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurant = await createRestaurant();
      await createMembership({
        restaurantId: restaurant.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurant.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
      });

      const response = await postAccept({
        token: rawToken,
        password: NEW_PASSWORD,
      }).expect(204);

      expect(JSON.stringify(response.body)).toBe('{}');
      expect(response.text).toBe('');
    });
  });

  describe('no unrelated side effects', () => {
    it('Restaurant B and its Memberships are unaffected by an Acceptance for Restaurant A', async () => {
      const { id: ownerId } = await createTestUser();
      const restaurantA = await createRestaurant('ACTIVE', 'Restaurant A');
      const restaurantB = await createRestaurant('ACTIVE', 'Restaurant B');
      await createMembership({
        restaurantId: restaurantA.id,
        userId: ownerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { id: bOwnerId } = await createTestUser('b-owner');
      const bMembership = await createMembership({
        restaurantId: restaurantB.id,
        userId: bOwnerId,
        role: 'OWNER',
        allBranches: true,
      });
      const { rawToken } = await createInvitation({
        restaurantId: restaurantA.id,
        emailNormalized: inviteeEmail(),
        allBranches: true,
        invitedByUserId: ownerId,
      });

      await postAccept({ token: rawToken, password: NEW_PASSWORD }).expect(204);

      const persisted = await prisma.restaurantMembership.findUniqueOrThrow({
        where: { id: bMembership.id },
      });
      expect(persisted.updatedAt).toEqual(bMembership.updatedAt);
      const membershipCountB = await prisma.restaurantMembership.count({
        where: { restaurantId: restaurantB.id },
      });
      expect(membershipCountB).toBe(1);
    });
  });
});
