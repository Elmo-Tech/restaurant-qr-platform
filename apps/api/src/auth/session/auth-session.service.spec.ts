import { AuthSessionService } from './auth-session.service';
import { SessionTokenService } from './session-token.service';

interface CreateSessionData {
  userId: string;
  tokenHash: string;
  lastSeenAt: Date;
  expiresAt: Date;
  [key: string]: unknown;
}

interface CreateSessionArgs {
  data: CreateSessionData;
  select: Record<string, boolean>;
}

interface CreateSessionResult {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

interface FindSessionArgs {
  where: { tokenHash: string };
  select: Record<string, unknown>;
}

interface FindSessionResult {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: { status: string };
}

interface RevokeSessionArgs {
  where: { tokenHash: string; revokedAt: null };
  data: { revokedAt: Date; revokeReason: string | null };
}

interface RevokeSessionByIdArgs {
  where: { id: string; revokedAt: null };
  data: { revokedAt: Date; revokeReason: string | null };
}

function buildFoundSession(
  overrides: Partial<FindSessionResult> = {},
): FindSessionResult {
  return {
    id: 'session-id',
    userId: 'user-id',
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    user: { status: 'ACTIVE' },
    ...overrides,
  };
}

describe('AuthSessionService', () => {
  let prisma: {
    authSession: {
      create: jest.Mock<Promise<CreateSessionResult>, [CreateSessionArgs]>;
      findUnique: jest.Mock<
        Promise<FindSessionResult | null>,
        [FindSessionArgs]
      >;
      updateMany: jest.Mock<
        Promise<{ count: number }>,
        [RevokeSessionArgs | RevokeSessionByIdArgs]
      >;
    };
  };
  let configService: { get: jest.Mock };
  let sessionTokenService: SessionTokenService;
  let service: AuthSessionService;

  beforeEach(() => {
    prisma = {
      authSession: {
        create: jest.fn<Promise<CreateSessionResult>, [CreateSessionArgs]>(),
        findUnique: jest.fn<
          Promise<FindSessionResult | null>,
          [FindSessionArgs]
        >(),
        updateMany: jest
          .fn<
            Promise<{ count: number }>,
            [RevokeSessionArgs | RevokeSessionByIdArgs]
          >()
          .mockResolvedValue({ count: 1 }),
      },
    };
    configService = { get: jest.fn().mockReturnValue(30) };
    sessionTokenService = new SessionTokenService();

    service = new AuthSessionService(
      // Only the Prisma operations this service actually uses are mocked.
      prisma as never,
      configService as never,
      sessionTokenService,
    );
  });

  describe('createSession', () => {
    it('returns the raw token to the caller', async () => {
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      const result = await service.createSession('user-id');

      expect(typeof result.token).toBe('string');
      expect(sessionTokenService.isWellFormedRawToken(result.token)).toBe(true);
    });

    it('never returns tokenHash in the created-session result', async () => {
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      const result = await service.createSession('user-id');

      expect(result).not.toHaveProperty('tokenHash');
      expect(Object.keys(result).sort()).toEqual(
        ['expiresAt', 'lastSeenAt', 'sessionId', 'token', 'userId'].sort(),
      );
    });

    it('writes only tokenHash (never the raw token) to Prisma', async () => {
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      const { token } = await service.createSession('user-id');
      const createArgs = prisma.authSession.create.mock.calls[0][0];

      expect(createArgs.data.tokenHash).toBe(
        sessionTokenService.hashToken(token),
      );
      expect(createArgs.data.tokenHash).not.toBe(token);
      expect(JSON.stringify(createArgs.data)).not.toContain(token);
    });

    it('requests only the fields needed via Prisma select', async () => {
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      await service.createSession('user-id');

      const createArgs = prisma.authSession.create.mock.calls[0][0];
      expect(createArgs.select).toEqual({
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
      });
    });

    it('sets expiresAt using the configured AUTH_SESSION_TTL_DAYS', async () => {
      configService.get.mockReturnValue(30);
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      const before = Date.now();
      await service.createSession('user-id');
      const after = Date.now();

      const createArgs = prisma.authSession.create.mock.calls[0][0];
      const expiresAt = createArgs.data.expiresAt;
      const expectedMinMs = before + 30 * 24 * 60 * 60 * 1000;
      const expectedMaxMs = after + 30 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxMs);
      expect(configService.get).toHaveBeenCalledWith('AUTH_SESSION_TTL_DAYS', {
        infer: true,
      });
    });

    it('explicitly sets lastSeenAt (no database default exists)', async () => {
      prisma.authSession.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'session-id',
          userId: data.userId,
          expiresAt: data.expiresAt,
          lastSeenAt: data.lastSeenAt,
        }),
      );

      await service.createSession('user-id');

      const createArgs = prisma.authSession.create.mock.calls[0][0];
      expect(createArgs.data.lastSeenAt).toBeInstanceOf(Date);
    });
  });

  describe('resolveSession', () => {
    it('resolves a valid session to a safe principal', async () => {
      prisma.authSession.findUnique.mockResolvedValue(buildFoundSession());

      const result = await service.resolveSession('A'.repeat(43));

      expect(result?.sessionId).toBe('session-id');
      expect(result?.userId).toBe('user-id');
      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.lastSeenAt).toBeInstanceOf(Date);
      expect(result?.userState).toBe('ACTIVE');
    });

    it('never includes tokenHash or passwordHash in the safe result', async () => {
      prisma.authSession.findUnique.mockResolvedValue(buildFoundSession());

      const result = await service.resolveSession('A'.repeat(43));

      expect(result).not.toHaveProperty('tokenHash');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('user');
      expect(Object.keys(result ?? {}).sort()).toEqual(
        ['expiresAt', 'lastSeenAt', 'sessionId', 'userId', 'userState'].sort(),
      );
    });

    it('requests only the fields needed via Prisma select (no full User)', async () => {
      prisma.authSession.findUnique.mockResolvedValue(buildFoundSession());

      await service.resolveSession('A'.repeat(43));

      const findArgs = prisma.authSession.findUnique.mock.calls[0][0];
      expect(findArgs.select).toEqual({
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        user: { select: { status: true } },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.authSession.findUnique.mockResolvedValue(null);

      const result = await service.resolveSession('A'.repeat(43));

      expect(result).toBeNull();
    });

    it('rejects a revoked session', async () => {
      prisma.authSession.findUnique.mockResolvedValue(
        buildFoundSession({ revokedAt: new Date() }),
      );

      const result = await service.resolveSession('A'.repeat(43));

      expect(result).toBeNull();
    });

    it('rejects an expired session', async () => {
      prisma.authSession.findUnique.mockResolvedValue(
        buildFoundSession({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      const result = await service.resolveSession('A'.repeat(43));

      expect(result).toBeNull();
    });

    it('rejects a session belonging to a non-ACTIVE User (AUTH_TENANCY_SPEC.md #110)', async () => {
      prisma.authSession.findUnique.mockResolvedValue(
        buildFoundSession({ user: { status: 'DISABLED' } }),
      );

      const result = await service.resolveSession('A'.repeat(43));

      expect(result).toBeNull();
    });

    describe('malformed raw tokens never reach Prisma', () => {
      const malformed = [
        ['empty string', ''],
        ['whitespace only', '   '],
        ['too short', 'A'.repeat(42)],
        ['too long', 'A'.repeat(44)],
        ['contains a "+" (outside base64url)', 'A'.repeat(42) + '+'],
        ['contains a "/" (outside base64url)', 'A'.repeat(42) + '/'],
        ['padded with "="', 'A'.repeat(42) + '='],
      ] as const;

      it.each(malformed)(
        'rejects %s without querying Prisma',
        async (_label, value) => {
          const result = await service.resolveSession(value);

          expect(result).toBeNull();
          expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('revokeSession', () => {
    it('sets revokedAt through an idempotent updateMany', async () => {
      const token = 'A'.repeat(43);

      await service.revokeSession(token);

      const updateArgs = prisma.authSession.updateMany.mock.calls[0][0];

      expect(updateArgs.where).toEqual({
        tokenHash: sessionTokenService.hashToken(token),
        revokedAt: null,
      });
      expect(updateArgs.data.revokedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.revokeReason).toBeNull();
    });

    it('is safe to call repeatedly (second call matches zero rows)', async () => {
      const token = 'A'.repeat(43);
      prisma.authSession.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(service.revokeSession(token)).resolves.toBeUndefined();
      await expect(service.revokeSession(token)).resolves.toBeUndefined();
    });

    describe('malformed raw tokens never reach Prisma', () => {
      const malformed = [
        ['empty string', ''],
        ['whitespace only', '   '],
        ['too short', 'A'.repeat(42)],
        ['too long', 'A'.repeat(44)],
        ['contains a "+" (outside base64url)', 'A'.repeat(42) + '+'],
        ['contains a "/" (outside base64url)', 'A'.repeat(42) + '/'],
        ['padded with "="', 'A'.repeat(42) + '='],
      ] as const;

      it.each(malformed)('is a no-op for %s', async (_label, value) => {
        await expect(service.revokeSession(value)).resolves.toBeUndefined();
        expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('revokeSessionById', () => {
    it('sets revokedAt through an idempotent updateMany scoped by id', async () => {
      await service.revokeSessionById('session-id');

      const updateArgs = prisma.authSession.updateMany.mock
        .calls[0][0] as RevokeSessionByIdArgs;

      expect(updateArgs.where).toEqual({ id: 'session-id', revokedAt: null });
      expect(updateArgs.data.revokedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.revokeReason).toBeNull();
    });

    it('passes the given reason through', async () => {
      await service.revokeSessionById('session-id', 'logout');

      const updateArgs = prisma.authSession.updateMany.mock
        .calls[0][0] as RevokeSessionByIdArgs;

      expect(updateArgs.data.revokeReason).toBe('logout');
    });

    it('is safe to call repeatedly (second call matches zero rows)', async () => {
      prisma.authSession.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.revokeSessionById('session-id'),
      ).resolves.toBeUndefined();
      await expect(
        service.revokeSessionById('session-id'),
      ).resolves.toBeUndefined();
    });

    it('never computes a tokenHash or touches SessionTokenService', async () => {
      const hashSpy = jest.spyOn(sessionTokenService, 'hashToken');

      await service.revokeSessionById('session-id');

      expect(hashSpy).not.toHaveBeenCalled();
    });
  });
});
