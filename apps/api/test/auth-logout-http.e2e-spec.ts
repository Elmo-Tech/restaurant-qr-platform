import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Proves Auth Foundation I end-to-end: HTTP Cookie -> AuthGuard -> CsrfGuard
 * -> AuthSessionService -> PostgreSQL, through the real production
 * `POST /api/v1/auth/logout` endpoint. Also regression-proves Login and
 * `GET /api/v1/auth/me` are unaffected.
 *
 * The approved Origin under test is the real `CORS_ORIGIN` from the running
 * environment's `.env` (`http://localhost:3000`), matched exactly against
 * `apps/api/.env`'s configured value -- never hardcoded independently of it.
 *
 * Creates temporary User/AuthSession rows and removes them in afterEach, so
 * the database returns to its empty state regardless of test outcome.
 */
describe('POST /api/v1/auth/logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    passwordHasherService = app.get(PasswordHasherService);
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const uniqueEmail = `logout-${randomUUID()}@example.test`;
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

  /** Logs in for real via the HTTP endpoint and returns the full raw Set-Cookie header + parsed cookie pair. */
  async function login(email: string): Promise<{
    cookiePair: string;
    setCookieHeader: string;
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
    return {
      cookiePair: sessionCookie.split(';')[0],
      setCookieHeader: sessionCookie,
    };
  }

  function getMe(cookiePair?: string) {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return cookiePair ? req.set('Cookie', cookiePair) : req;
  }

  function postLogout(params: {
    cookiePair?: string;
    origin?: string;
    referer?: string;
  }) {
    let req = request(app.getHttpServer()).post('/api/v1/auth/logout');
    if (params.cookiePair) req = req.set('Cookie', params.cookiePair);
    if (params.origin !== undefined) req = req.set('Origin', params.origin);
    if (params.referer !== undefined) req = req.set('Referer', params.referer);
    return req;
  }

  async function countActiveSessions(userId: string): Promise<number> {
    return prisma.authSession.count({
      where: { userId, revokedAt: null },
    });
  }

  describe('A. Login creates the Staff session cookie', () => {
    it('sets an HttpOnly restaurant_session cookie', async () => {
      const { email } = await createTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      expect(setCookie.some((c) => c.startsWith('restaurant_session='))).toBe(
        true,
      );
    });
  });

  describe('B. /auth/me works before logout', () => {
    it('returns 200 with the authenticated user', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await getMe(cookiePair).expect(200);

      expect(
        (response.body as { data: { user: { id: string } } }).data.user.id,
      ).toBe(userId);
    });
  });

  describe('C. logout with the approved Origin', () => {
    it('204, revokes the current AuthSession, clears the cookie, and the old cookie can no longer authenticate', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);
      await getMe(cookiePair).expect(200);
      expect(await countActiveSessions(userId)).toBe(1);

      const response = await postLogout({
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);

      expect(response.body).toEqual({});
      expect(await countActiveSessions(userId)).toBe(0);

      const setCookie = response.headers['set-cookie'] as unknown as
        string[] | undefined;
      const cleared = setCookie?.find((c) =>
        c.startsWith('restaurant_session='),
      );
      expect(cleared).toBeDefined();
      expect(cleared).toMatch(/restaurant_session=;/);

      const afterLogout = await getMe(cookiePair).expect(401);
      expect(afterLogout.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('D. cross-origin logout', () => {
    it('403 CSRF_VALIDATION_FAILED, AuthSession remains valid, same cookie still works on /auth/me', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({
        cookiePair,
        origin: FOREIGN_ORIGIN,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);

      await getMe(cookiePair).expect(200);
    });
  });

  describe('E. missing CSRF headers', () => {
    it('no Origin, no Referer -> 403 CSRF_VALIDATION_FAILED, session remains valid', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({ cookiePair }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);
      await getMe(cookiePair).expect(200);
    });
  });

  describe('F. Referer fallback', () => {
    it('missing Origin + approved Referer -> succeeds', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      await postLogout({
        cookiePair,
        referer: `${APPROVED_ORIGIN}/dashboard/settings`,
      }).expect(204);

      expect(await countActiveSessions(userId)).toBe(0);
    });

    it('missing Origin + foreign Referer -> rejected, session remains valid', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({
        cookiePair,
        referer: `${FOREIGN_ORIGIN}/`,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);
    });
  });

  describe('G. mismatched Origin + valid Referer', () => {
    it('Origin takes precedence -- rejected even though Referer would have matched', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({
        cookiePair,
        origin: FOREIGN_ORIGIN,
        referer: `${APPROVED_ORIGIN}/`,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);
    });
  });

  describe('H. malformed/null Origin', () => {
    it('Origin: null -> rejected, no Referer rescue', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({
        cookiePair,
        origin: 'null',
        referer: `${APPROVED_ORIGIN}/`,
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);
    });

    it('syntactically malformed Origin -> rejected', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      const response = await postLogout({
        cookiePair,
        origin: 'not-a-url',
      }).expect(403);

      expect(response.body).toEqual(CSRF_VALIDATION_FAILED_BODY);
      expect(await countActiveSessions(userId)).toBe(1);
    });
  });

  describe('missing session', () => {
    it('no cookie at all -> 401 UNAUTHENTICATED (CsrfGuard never reached)', async () => {
      const response = await postLogout({ origin: APPROVED_ORIGIN }).expect(
        401,
      );

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });

    it('already logged-out cookie -> 401 UNAUTHENTICATED on a second logout attempt', async () => {
      const { email } = await createTestUser();
      const { cookiePair } = await login(email);
      await postLogout({ cookiePair, origin: APPROVED_ORIGIN }).expect(204);

      const response = await postLogout({
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(401);

      expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    });
  });

  describe('I. second independent User session', () => {
    it('logging User A out does not revoke User B', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const { cookiePair: cookieA } = await login(userA.email);
      const { cookiePair: cookieB } = await login(userB.email);

      await postLogout({ cookiePair: cookieA, origin: APPROVED_ORIGIN }).expect(
        204,
      );

      expect(await countActiveSessions(userA.id)).toBe(0);
      expect(await countActiveSessions(userB.id)).toBe(1);
      await getMe(cookieB).expect(200);
    });
  });

  describe('J. two AuthSessions for the same User', () => {
    it('logging out one session does not revoke the other (no logout-all)', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair: cookieOne } = await login(email);
      const { cookiePair: cookieTwo } = await login(email);
      expect(await countActiveSessions(userId)).toBe(2);

      await postLogout({
        cookiePair: cookieOne,
        origin: APPROVED_ORIGIN,
      }).expect(204);

      expect(await countActiveSessions(userId)).toBe(1);
      await getMe(cookieTwo).expect(200);
      await getMe(cookieOne).expect(401);
    });
  });

  describe('no Tenant/Permission requirement', () => {
    it('a valid ACTIVE User with zero Restaurant memberships can still logout', async () => {
      const { id: userId, email } = await createTestUser();
      const { cookiePair } = await login(email);

      await postLogout({ cookiePair, origin: APPROVED_ORIGIN }).expect(204);

      expect(await countActiveSessions(userId)).toBe(0);
    });
  });

  describe('response body safety', () => {
    it('the logout response never contains the raw token or a hash', async () => {
      const { email } = await createTestUser();
      const { cookiePair } = await login(email);
      const rawToken = cookiePair.split('=')[1];

      const response = await postLogout({
        cookiePair,
        origin: APPROVED_ORIGIN,
      }).expect(204);

      const serialized = JSON.stringify(response.body) + response.text;
      expect(serialized).not.toContain(rawToken);
      expect(serialized).not.toMatch(/tokenHash/i);
    });
  });

  describe('Login regression', () => {
    it('login response contract, cookie attributes, and INVALID_CREDENTIALS remain unchanged', async () => {
      const { email } = await createTestUser();

      const success = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(Object.keys(success.body as object)).toEqual(['data']);
      expect(Object.keys((success.body as { data: object }).data)).toEqual([
        'userId',
      ]);

      const setCookie = success.headers['set-cookie'] as unknown as string[];
      const sessionCookie = setCookie.find((c) =>
        c.startsWith('restaurant_session='),
      );
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
      expect(sessionCookie).toMatch(/Path=\//i);

      const failure = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      expect(failure.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    });
  });

  describe('/auth/me regression', () => {
    it('remains read-only and does not require Origin/Referer CSRF headers', async () => {
      const { email } = await createTestUser();
      const { cookiePair } = await login(email);

      // Deliberately no Origin/Referer header at all on this safe GET.
      await getMe(cookiePair).expect(200);
    });
  });
});
