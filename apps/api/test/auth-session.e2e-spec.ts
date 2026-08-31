import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { AuthSessionService } from './../src/auth/session/auth-session.service';
import { SessionTokenService } from './../src/auth/session/session-token.service';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Proves the real wiring: SessionTokenService -> AuthSessionService ->
 * PrismaService -> PostgreSQL, using the actual migrated Tenant/Identity
 * schema. Requires the local PostgreSQL container to be running (same
 * expectation as the other e2e suites).
 *
 * Creates exactly one temporary User row (the minimum required to own an
 * AuthSession) and removes it — with its sessions — in afterEach, so the
 * database returns to its empty state regardless of test outcome.
 */
describe('AuthSessionService database integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authSessionService: AuthSessionService;
  let sessionTokenService: SessionTokenService;
  let testUserId: string | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    authSessionService = app.get(AuthSessionService);
    sessionTokenService = app.get(SessionTokenService);
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

  it('creates, resolves, and revokes a real session through PostgreSQL', async () => {
    const uniqueEmail = `auth-integration-test-${Date.now()}-${randomUUID()}@example.test`;

    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        emailNormalized: uniqueEmail.toLowerCase(),
        // Not a real credential: password hashing is a later, separately
        // controlled slice. This value only satisfies the required column
        // for a session-infrastructure test fixture.
        passwordHash: 'not-a-real-hash:test-fixture',
        status: 'ACTIVE',
      },
    });
    testUserId = user.id;

    const created = await authSessionService.createSession(user.id);
    const { token } = created;

    // The safe creation result carries no persistence-internal fields.
    expect(created).not.toHaveProperty('tokenHash');
    expect(created).not.toHaveProperty('passwordHash');

    // PostgreSQL stores only the hash; the raw token is never persisted.
    const stored = await prisma.authSession.findUnique({
      where: { id: created.sessionId },
    });
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toBe(sessionTokenService.hashToken(token));

    const resolved = await authSessionService.resolveSession(token);
    expect(resolved?.sessionId).toBe(created.sessionId);
    expect(resolved?.userId).toBe(user.id);
    expect(resolved?.userState).toBe('ACTIVE');

    // The safe resolved principal carries no persistence-internal fields.
    expect(resolved).not.toHaveProperty('tokenHash');
    expect(resolved).not.toHaveProperty('passwordHash');
    expect(resolved).not.toHaveProperty('user');

    await authSessionService.revokeSession(token);

    const afterRevoke = await authSessionService.resolveSession(token);
    expect(afterRevoke).toBeNull();
  });
});
