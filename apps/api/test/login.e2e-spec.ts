import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { LoginService } from './../src/auth/login/login.service';
import { PasswordHasherService } from './../src/auth/password/password-hasher.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Proves the real wiring: PrismaService (User lookup) ->
 * PasswordHasherService -> AuthSessionService -> PostgreSQL, through
 * LoginService. Requires the local PostgreSQL container to be running (same
 * expectation as the other e2e suites).
 *
 * Creates exactly one temporary User row (with a real Argon2id hash) and
 * removes it — with any session it created — in afterEach, so the database
 * returns to its empty state regardless of test outcome. No
 * Restaurant/Branch/Membership records are created: login proves User
 * identity only.
 */
describe('LoginService database integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHasherService: PasswordHasherService;
  let loginService: LoginService;
  let testUserId: string | undefined;

  const PASSWORD = 'correct horse battery staple';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    passwordHasherService = app.get(PasswordHasherService);
    loginService = app.get(LoginService);
  });

  afterEach(async () => {
    if (testUserId) {
      // auth_sessions.user_id -> users.id is ON DELETE RESTRICT, so sessions
      // must be removed before the owning User.
      await prisma.authSession.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
      testUserId = undefined;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const uniqueEmail = `login-integration-test-${Date.now()}-${randomUUID()}@example.test`;
    const passwordHash = await passwordHasherService.hashPassword(PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        emailNormalized: uniqueEmail.toLowerCase(),
        passwordHash,
        status: 'ACTIVE',
      },
    });
    testUserId = user.id;

    return { id: user.id, email: uniqueEmail };
  }

  it('creates a real session in PostgreSQL for correct credentials', async () => {
    const { id: userId, email } = await createTestUser();

    const result = await loginService.login({ email, password: PASSWORD });

    expect(result.outcome).toBe('success');
    if (result.outcome !== 'success') {
      throw new Error('expected successful login');
    }

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('tokenHash');

    const stored = await prisma.authSession.findUnique({
      where: { id: result.sessionId },
    });
    expect(stored).not.toBeNull();
    expect(stored?.userId).toBe(userId);
    expect(stored?.tokenHash).not.toBe(result.token);
  });

  it('creates no session for a wrong password', async () => {
    const { email } = await createTestUser();

    const result = await loginService.login({
      email,
      password: 'a-completely-different-password',
    });

    expect(result).toEqual({ outcome: 'invalidCredentials' });

    const sessions = await prisma.authSession.count({
      where: { userId: testUserId },
    });
    expect(sessions).toBe(0);
  });

  it('creates no session for a valid-format but unknown email', async () => {
    const unknownEmail = `login-integration-test-unknown-${Date.now()}-${randomUUID()}@example.test`;

    const result = await loginService.login({
      email: unknownEmail,
      password: 'correct horse battery staple',
    });

    expect(result).toEqual({ outcome: 'invalidCredentials' });

    const sessions = await prisma.authSession.count({
      where: { user: { emailNormalized: unknownEmail.toLowerCase() } },
    });
    expect(sessions).toBe(0);
  });
});
