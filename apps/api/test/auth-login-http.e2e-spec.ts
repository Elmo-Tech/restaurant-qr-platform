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
 * HTTP transport for the already-approved LoginService (Auth Foundation D).
 * Exercises the real Nest application -- routing, the global ValidationPipe,
 * LoginController, LoginService, and PostgreSQL -- through supertest.
 *
 * Creates temporary User rows (with a real Argon2id hash) per test and
 * removes them -- with any AuthSession they created -- in afterEach, so the
 * database returns to its empty state regardless of test outcome.
 */
describe('POST /api/v1/auth/login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  const createdUserIds: string[] = [];

  const PASSWORD = 'correct horse battery staple';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Mirrors main.ts's bootstrap() global pipe exactly, so this test
    // exercises the same validation behavior Production uses.
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
    // Local part must stay within the RFC 5321 64-character limit that
    // class-validator's @IsEmail() enforces -- a short prefix + a bare UUID
    // is unique enough without approaching that ceiling.
    const uniqueEmail = `login-http-${randomUUID()}@example.test`;
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

  function findSetCookie(headers: Record<string, unknown>): string {
    const raw = headers['set-cookie'];
    const cookies: unknown[] = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    const sessionCookie = cookies.find((cookie) =>
      String(cookie).startsWith('restaurant_session='),
    );
    expect(sessionCookie).toBeDefined();
    return String(sessionCookie);
  }

  describe('successful login', () => {
    it('returns 200 with only a safe userId body and no raw secrets', async () => {
      const { id: userId, email } = await createTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(response.body).toEqual({ data: { userId } });
      const serializedBody = JSON.stringify(response.body);
      expect(serializedBody).not.toMatch(/passwordHash/i);
      expect(serializedBody).not.toMatch(/tokenHash/i);
    });

    it('sets an HttpOnly, Secure-per-config, SameSite=Lax, Path=/ session cookie', async () => {
      const { email } = await createTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const cookie = findSetCookie(response.headers);

      expect(cookie).toMatch(/^restaurant_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//i);
      expect(cookie).toMatch(/Max-Age=\d+/i);
      // AUTH_COOKIE_SECURE=false in local/test .env -- Secure must be absent.
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('cookie Max-Age is derived from the created AuthSession, matching AUTH_SESSION_TTL_DAYS', async () => {
      const { id: userId, email } = await createTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const cookie = findSetCookie(response.headers);
      const maxAgeMatch = /Max-Age=(\d+)/i.exec(cookie);
      expect(maxAgeMatch).not.toBeNull();
      const maxAgeSeconds = Number(maxAgeMatch?.[1]);

      const stored = await prisma.authSession.findFirst({
        where: { userId },
      });
      expect(stored).not.toBeNull();
      const expectedSeconds = Math.round(
        ((stored?.expiresAt.getTime() ?? 0) - Date.now()) / 1000,
      );
      expect(Math.abs(maxAgeSeconds - expectedSeconds)).toBeLessThan(5);
    });

    it('creates exactly one real AuthSession row', async () => {
      const { id: userId, email } = await createTestUser();

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      const count = await prisma.authSession.count({ where: { userId } });
      expect(count).toBe(1);
    });
  });

  const INVALID_CREDENTIALS_BODY = {
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    },
  };

  describe('externally indistinguishable failures', () => {
    it('unknown email -> 401 generic failure, no cookie, no session', async () => {
      const unknownEmail = `login-http-unknown-${randomUUID()}@example.test`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: unknownEmail, password: PASSWORD })
        .expect(401);

      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('ACTIVE user + wrong password -> identical 401 failure, no session', async () => {
      const { id: userId, email } = await createTestUser('ACTIVE');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'a-completely-different-password' })
        .expect(401);

      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await prisma.authSession.count({ where: { userId } })).toBe(0);
    });

    it('DISABLED user -> identical 401 failure, no session', async () => {
      const { id: userId, email } = await createTestUser('DISABLED');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);

      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await prisma.authSession.count({ where: { userId } })).toBe(0);
    });

    it('INVITED user -> identical 401 failure, no session', async () => {
      const { id: userId, email } = await createTestUser('INVITED');

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);

      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await prisma.authSession.count({ where: { userId } })).toBe(0);
    });
  });

  describe('DTO validation', () => {
    it('rejects a malformed body with the documented VALIDATION_ERROR envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: {
            fields: expect.arrayContaining([
              { field: 'email', code: 'INVALID_EMAIL' },
              { field: 'password', code: 'INVALID_LENGTH' },
            ]) as unknown,
          },
        },
      });
    });
  });
});
