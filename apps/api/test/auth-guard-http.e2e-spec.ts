import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthSessionService } from './../src/auth/session/auth-session.service';
import { SessionTokenService } from './../src/auth/session/session-token.service';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';
import { ProtectedTestModule } from './fixtures/protected-test.module';

/**
 * Proves the real wiring for Auth Foundation E: HTTP Cookie -> AuthGuard ->
 * AuthSessionService -> PrismaService -> PostgreSQL, through the TEST-ONLY
 * `ProtectedTestController` (never part of the production AppModule).
 *
 * Creates temporary User/AuthSession rows and removes them -- sessions
 * before the owning User -- in afterEach, so the database returns to its
 * empty state regardless of test outcome. No Restaurant/Membership/Branch
 * records are created: this slice is authentication only.
 */
describe('AuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  let authSessionService: AuthSessionService;
  let sessionTokenService: SessionTokenService;
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';
  const UNAUTHENTICATED_BODY = {
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, ProtectedTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    passwordHasherService = app.get(PasswordHasherService);
    authSessionService = app.get(AuthSessionService);
    sessionTokenService = app.get(SessionTokenService);
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      // auth_sessions.user_id -> users.id is ON DELETE RESTRICT, so sessions
      // must be removed before the owning User.
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(
    status: 'ACTIVE' | 'DISABLED' | 'INVITED' = 'ACTIVE',
  ): Promise<{ id: string; email: string }> {
    const uniqueEmail = `auth-guard-${randomUUID()}@example.test`;
    const passwordHash = await passwordHasherService.hashPassword(PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        emailNormalized: uniqueEmail.toLowerCase(),
        passwordHash,
        status,
      },
    });
    createdUserIds.push(user.id);

    return { id: user.id, email: uniqueEmail };
  }

  /** Logs in for real via the HTTP endpoint and returns the raw session cookie pair. */
  async function loginAndGetCookie(email: string): Promise<{
    cookiePair: string;
    rawToken: string;
  }> {
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
    const cookiePair = sessionCookie.split(';')[0];
    const rawToken = cookiePair.split('=')[1];

    return { cookiePair, rawToken };
  }

  function getProtected(cookiePair?: string) {
    const req = request(app.getHttpServer()).get('/api/v1/test/protected');
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  describe('missing authentication', () => {
    it('no cookie -> 401 approved generic response', async () => {
      const response = await getProtected().expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('unrelated cookies present but not the session cookie -> 401', async () => {
      const response = await getProtected('theme=dark; lang=en').expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('valid ACTIVE User session', () => {
    it('succeeds, returns safe userId/sessionId, and never exposes the raw token', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const { cookiePair, rawToken } = await loginAndGetCookie(email);

      const response = await getProtected(cookiePair).expect(200);

      expect(response.body).toEqual({
        data: { userId, sessionId: expect.any(String) as string },
      });
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(rawToken);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/tokenHash/i);
    });
  });

  describe('duplicate configured session cookies', () => {
    it('401 when the session cookie name appears twice, even with two otherwise-valid tokens', async () => {
      const { email: emailA } = await createTestUser('ACTIVE');
      const { email: emailB } = await createTestUser('ACTIVE');
      const { cookiePair: cookieA } = await loginAndGetCookie(emailA);
      const { cookiePair: cookieB } = await loginAndGetCookie(emailB);

      const response = await getProtected(`${cookieA}; ${cookieB}`).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('malformed token', () => {
    it('401 for a cookie value that is not the canonical raw-token shape', async () => {
      const response = await getProtected(
        'restaurant_session=not-a-valid-token-shape',
      ).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('unknown valid-format token', () => {
    it('401 for a well-formed token that matches no AuthSession', async () => {
      const unknownToken = sessionTokenService.generateRawToken();

      const response = await getProtected(
        `restaurant_session=${unknownToken}`,
      ).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('revoked session', () => {
    it('401 after the session has been revoked', async () => {
      const { email } = await createTestUser('ACTIVE');
      const { cookiePair, rawToken } = await loginAndGetCookie(email);

      await authSessionService.revokeSession(rawToken, 'e2e-test');

      const response = await getProtected(cookiePair).expect(401);
      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('expired session', () => {
    it('401 after the session has passed its absolute expiry', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const { cookiePair } = await loginAndGetCookie(email);

      await prisma.authSession.updateMany({
        where: { userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await getProtected(cookiePair).expect(401);
      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('session whose User becomes DISABLED', () => {
    it('401 even though the session row itself is still otherwise valid', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');
      const { cookiePair } = await loginAndGetCookie(email);

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'DISABLED' },
      });

      const response = await getProtected(cookiePair).expect(401);
      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });
});
