import { PasswordResetService } from './password-reset.service';
import { PasswordHasherService } from './password-hasher.service';
import { SessionTokenService } from '../session/session-token.service';

const USER_ID = 'user-1';
const TOKEN_ID = 'token-1';

function buildService(overrides?: {
  user?: { id: string; status: string } | null;
  resetToken?:
    | {
        id: string;
        userId: string;
        expiresAt: Date;
        consumedAt: Date | null;
        user: { status: string };
      }
    | null;
  updateManyCount?: number;
}) {
  const userFindUnique = jest
    .fn()
    .mockResolvedValue(
      overrides && 'user' in overrides
        ? overrides.user
        : { id: USER_ID, status: 'ACTIVE' },
    );
  const userUpdate = jest.fn().mockResolvedValue({});
  const passwordResetTokenCreate = jest.fn().mockResolvedValue({});
  const passwordResetTokenFindUnique = jest
    .fn()
    .mockResolvedValue(
      overrides?.resetToken === undefined
        ? {
            id: TOKEN_ID,
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
            user: { status: 'ACTIVE' },
          }
        : overrides.resetToken,
    );
  const passwordResetTokenUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 });

  const prisma = {
    user: { findUnique: userFindUnique, update: userUpdate },
    passwordResetToken: {
      create: passwordResetTokenCreate,
      findUnique: passwordResetTokenFindUnique,
      updateMany: passwordResetTokenUpdateMany,
    },
  };

  const configService = { get: jest.fn().mockReturnValue(45) };
  const sessionTokenService = new SessionTokenService();
  const passwordHasherService = {
    hashPassword: jest.fn().mockResolvedValue('new-hash'),
  } as unknown as PasswordHasherService;
  const revokeAllSessionsForUser = jest.fn().mockResolvedValue(undefined);
  const authSessionService = { revokeAllSessionsForUser } as unknown as {
    revokeAllSessionsForUser: jest.Mock;
  };

  const service = new PasswordResetService(
    prisma as never,
    configService as never,
    sessionTokenService,
    passwordHasherService,
    authSessionService as never,
  );

  return {
    service,
    prisma,
    sessionTokenService,
    authSessionService,
    passwordHasherService,
  };
}

describe('PasswordResetService.requestPasswordReset', () => {
  it('issues a raw token and stores only its hash for a known ACTIVE User', async () => {
    const { service, prisma, sessionTokenService } = buildService();

    const result = await service.requestPasswordReset('owner@example.test');

    expect(result.rawToken).not.toBeNull();
    expect(sessionTokenService.isWellFormedRawToken(result.rawToken!)).toBe(true);

    const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
    expect(createArgs.data.tokenHash).toBe(
      sessionTokenService.hashToken(result.rawToken!),
    );
    expect(JSON.stringify(createArgs.data)).not.toContain(result.rawToken);
  });

  it('returns the same null-token result for an unknown email (no enumeration)', async () => {
    const { service, prisma } = buildService({ user: null });

    const result = await service.requestPasswordReset('unknown@example.test');

    expect(result).toEqual({ rawToken: null });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('returns the same null-token result for a non-ACTIVE User (no enumeration)', async () => {
    const { service, prisma } = buildService({
      user: { id: USER_ID, status: 'DISABLED' },
    });

    const result = await service.requestPasswordReset('disabled@example.test');

    expect(result).toEqual({ rawToken: null });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService.resetPassword', () => {
  it('resets the password for a valid, unexpired, unconsumed token', async () => {
    const { service, prisma } = buildService();

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'reset' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: 'new-hash' },
    });
  });

  it('revokes every session for the User (anonymous flow, no exception)', async () => {
    const { service, authSessionService } = buildService();

    await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(authSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      USER_ID,
      { reason: 'password-reset' },
    );
  });

  it('rejects a malformed token without querying Prisma', async () => {
    const { service, prisma } = buildService();

    const result = await service.resetPassword('too-short', 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
    expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    const { service } = buildService({ resetToken: null });

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
  });

  it('rejects an expired token', async () => {
    const { service } = buildService({
      resetToken: {
        id: TOKEN_ID,
        userId: USER_ID,
        expiresAt: new Date(Date.now() - 1_000),
        consumedAt: null,
        user: { status: 'ACTIVE' },
      },
    });

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
  });

  it('rejects an already-consumed token (one-time use)', async () => {
    const { service } = buildService({
      resetToken: {
        id: TOKEN_ID,
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
        user: { status: 'ACTIVE' },
      },
    });

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
  });

  it('rejects a token belonging to a non-ACTIVE User', async () => {
    const { service } = buildService({
      resetToken: {
        id: TOKEN_ID,
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        user: { status: 'DISABLED' },
      },
    });

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
  });

  it('rejects when the atomic consumption update matches zero rows (concurrent reuse)', async () => {
    const { service, prisma } = buildService({ updateManyCount: 0 });

    const result = await service.resetPassword('A'.repeat(43), 'new-password-456');

    expect(result).toEqual({ outcome: 'invalidToken' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
