import { parseOptions } from '@node-rs/argon2';
import { PasswordHasherService } from '../password/password-hasher.service';
import { LoginService, normalizeLoginEmail } from './login.service';

// Mirrors the private DUMMY_PASSWORD_HASH in login.service.ts, so tests can
// assert it was used without exporting an internal implementation detail.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$1eUNYovhGblUnTR3WX1Yjw$X5Epma/LyCgkVbkiolWgQHpHyNZNE2wpKp0uPhc8DPw';
// @node-rs/argon2 Algorithm.Argon2id, referenced by literal value (see
// password-hasher.service.spec.ts for why: TS2748 under isolatedModules).
const ARGON2ID = 2;

interface FoundUser {
  id: string;
  passwordHash: string;
  status: string;
}

function buildUser(overrides: Partial<FoundUser> = {}): FoundUser {
  return {
    id: 'user-id',
    passwordHash: 'stored-hash',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('LoginService', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let passwordHasherService: { verifyPassword: jest.Mock };
  let authSessionService: { createSession: jest.Mock };
  let service: LoginService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    passwordHasherService = { verifyPassword: jest.fn() };
    authSessionService = { createSession: jest.fn() };

    service = new LoginService(
      prisma as never,
      passwordHasherService as never,
      authSessionService as never,
    );
  });

  describe('normalizeLoginEmail', () => {
    it('trims and lowercases', () => {
      expect(normalizeLoginEmail('  Owner@Example.COM  ')).toBe(
        'owner@example.com',
      );
    });
  });

  describe('successful login', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      passwordHasherService.verifyPassword.mockResolvedValue(true);
      authSessionService.createSession.mockResolvedValue({
        token: 'A'.repeat(43),
        sessionId: 'session-id',
        userId: 'user-id',
        expiresAt: new Date(),
        lastSeenAt: new Date(),
      });
    });

    it('creates a session for correct credentials', async () => {
      const result = await service.login({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      });

      expect(result.outcome).toBe('success');
      expect(authSessionService.createSession).toHaveBeenCalledWith('user-id');
    });

    it('creates exactly one AuthSession', async () => {
      await service.login({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      });

      expect(authSessionService.createSession).toHaveBeenCalledTimes(1);
    });

    it('exposes only safe metadata in the success result', async () => {
      const result = await service.login({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      });

      expect(result).toEqual({
        outcome: 'success',
        token: 'A'.repeat(43),
        sessionId: 'session-id',
        userId: 'user-id',
        expiresAt: expect.any(Date) as Date,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('tokenHash');
    });

    it('looks up the User via a normalized-email select with only login fields', async () => {
      await service.login({
        email: '  Owner@Example.COM  ',
        password: 'correct horse battery staple',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { emailNormalized: 'owner@example.com' },
        select: { id: true, passwordHash: true, status: true },
      });
    });

    it('passes the plaintext password only to PasswordHasherService.verifyPassword', async () => {
      const password = 'correct horse battery staple';

      await service.login({ email: 'owner@example.com', password });

      expect(passwordHasherService.verifyPassword).toHaveBeenCalledWith(
        password,
        'stored-hash',
      );
    });
  });

  describe('invalid credentials', () => {
    it('fails for an unknown User, verifying against the dummy hash exactly once', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      passwordHasherService.verifyPassword.mockResolvedValue(false);

      const result = await service.login({
        email: 'nobody@example.com',
        password: 'correct horse battery staple',
      });

      expect(result).toEqual({ outcome: 'invalidCredentials' });
      expect(passwordHasherService.verifyPassword).toHaveBeenCalledTimes(1);
      expect(passwordHasherService.verifyPassword).toHaveBeenCalledWith(
        'correct horse battery staple',
        DUMMY_PASSWORD_HASH,
      );
    });

    it('fails for a wrong password, verifying against the real stored hash exactly once', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      passwordHasherService.verifyPassword.mockResolvedValue(false);

      const result = await service.login({
        email: 'owner@example.com',
        password: 'wrong-password-value',
      });

      expect(result).toEqual({ outcome: 'invalidCredentials' });
      expect(passwordHasherService.verifyPassword).toHaveBeenCalledTimes(1);
      expect(passwordHasherService.verifyPassword).toHaveBeenCalledWith(
        'wrong-password-value',
        'stored-hash',
      );
    });

    it('maps unknown User and wrong password to the identical external outcome', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      passwordHasherService.verifyPassword.mockResolvedValueOnce(false);
      const unknownUserResult = await service.login({
        email: 'nobody@example.com',
        password: 'correct horse battery staple',
      });

      prisma.user.findUnique.mockResolvedValueOnce(buildUser());
      passwordHasherService.verifyPassword.mockResolvedValueOnce(false);
      const wrongPasswordResult = await service.login({
        email: 'owner@example.com',
        password: 'wrong-password-value',
      });

      expect(unknownUserResult).toEqual(wrongPasswordResult);
      expect(unknownUserResult).toEqual({ outcome: 'invalidCredentials' });
    });

    it.each([
      ['empty email', '', 'correct horse battery staple'],
      ['whitespace-only email', '   ', 'correct horse battery staple'],
      ['empty password', 'owner@example.com', ''],
    ])(
      'fails safely for %s without querying Prisma or verifying a password',
      async (_label, email, password) => {
        const result = await service.login({ email, password });

        expect(result).toEqual({ outcome: 'invalidCredentials' });
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(passwordHasherService.verifyPassword).not.toHaveBeenCalled();
      },
    );
  });

  describe('ineligible User state', () => {
    it.each(['DISABLED', 'INVITED'])(
      'reports accountUnavailable for a %s User, verifying against the dummy hash instead of the real one',
      async (status) => {
        prisma.user.findUnique.mockResolvedValue(
          buildUser({ status, passwordHash: 'real-stored-hash' }),
        );
        passwordHasherService.verifyPassword.mockResolvedValue(false);

        const result = await service.login({
          email: 'owner@example.com',
          password: 'correct horse battery staple',
        });

        expect(result).toEqual({ outcome: 'accountUnavailable' });
        expect(passwordHasherService.verifyPassword).toHaveBeenCalledTimes(1);
        expect(passwordHasherService.verifyPassword).toHaveBeenCalledWith(
          'correct horse battery staple',
          DUMMY_PASSWORD_HASH,
        );
        expect(passwordHasherService.verifyPassword).not.toHaveBeenCalledWith(
          expect.anything(),
          'real-stored-hash',
        );
      },
    );
  });

  describe('no session on failure', () => {
    it('does not create a session for an unknown User', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      passwordHasherService.verifyPassword.mockResolvedValue(false);

      await service.login({
        email: 'nobody@example.com',
        password: 'correct horse battery staple',
      });

      expect(authSessionService.createSession).not.toHaveBeenCalled();
    });

    it('does not create a session for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      passwordHasherService.verifyPassword.mockResolvedValue(false);

      await service.login({
        email: 'owner@example.com',
        password: 'wrong-password-value',
      });

      expect(authSessionService.createSession).not.toHaveBeenCalled();
    });

    it('does not create a session for a DISABLED User', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ status: 'DISABLED' }),
      );
      passwordHasherService.verifyPassword.mockResolvedValue(false);

      await service.login({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      });

      expect(authSessionService.createSession).not.toHaveBeenCalled();
    });

    it('does not create a session for malformed input', async () => {
      await service.login({ email: '', password: '' });

      expect(authSessionService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('timing-equalization dummy hash', () => {
    it('is a valid Argon2id PHC hash using the approved parameters', () => {
      const parsed = parseOptions(DUMMY_PASSWORD_HASH);

      expect(parsed.algorithm).toBe(ARGON2ID);
      expect(parsed.memoryCost).toBe(19456);
      expect(parsed.timeCost).toBe(2);
      expect(parsed.parallelism).toBe(1);
    });

    it('is accepted by the real PasswordHasherService.verifyPassword without throwing', async () => {
      const realHasher = new PasswordHasherService();

      await expect(
        realHasher.verifyPassword('any-password', DUMMY_PASSWORD_HASH),
      ).resolves.toBe(false);
    });
  });
});
