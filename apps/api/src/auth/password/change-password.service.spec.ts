import { ChangePasswordService } from './change-password.service';
import { PasswordHasherService } from './password-hasher.service';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

function buildService(overrides?: {
  user?: { id: string; passwordHash: string } | null;
  verifyPassword?: jest.Mock;
  hashPassword?: jest.Mock;
}) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(
      overrides && 'user' in overrides
        ? overrides.user
        : { id: USER_ID, passwordHash: 'stored-hash' },
    );
  const update = jest.fn().mockResolvedValue({});
  const prisma = { user: { findUnique, update } };

  const passwordHasherService = {
    verifyPassword: overrides?.verifyPassword ?? jest.fn().mockResolvedValue(true),
    hashPassword: overrides?.hashPassword ?? jest.fn().mockResolvedValue('new-hash'),
  } as unknown as PasswordHasherService;

  const revokeAllSessionsForUser = jest.fn().mockResolvedValue(undefined);
  const authSessionService = { revokeAllSessionsForUser } as unknown as {
    revokeAllSessionsForUser: jest.Mock;
  };

  const service = new ChangePasswordService(
    prisma as never,
    passwordHasherService,
    authSessionService as never,
  );

  return { service, prisma, passwordHasherService, authSessionService };
}

describe('ChangePasswordService.changePassword', () => {
  it('changes the password on a correct current password', async () => {
    const { service, prisma } = buildService();

    const result = await service.changePassword({
      userId: USER_ID,
      currentSessionId: SESSION_ID,
      currentPassword: 'old-password-123',
      newPassword: 'new-password-456',
    });

    expect(result).toEqual({ outcome: 'changed' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: 'new-hash' },
    });
  });

  it('rejects an incorrect current password without writing anything', async () => {
    const { service, prisma, authSessionService } = buildService({
      verifyPassword: jest.fn().mockResolvedValue(false),
    });

    const result = await service.changePassword({
      userId: USER_ID,
      currentSessionId: SESSION_ID,
      currentPassword: 'wrong-password',
      newPassword: 'new-password-456',
    });

    expect(result).toEqual({ outcome: 'invalidCurrentPassword' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(authSessionService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it('revokes every other session but keeps the current one alive', async () => {
    const { service, authSessionService } = buildService();

    await service.changePassword({
      userId: USER_ID,
      currentSessionId: SESSION_ID,
      currentPassword: 'old-password-123',
      newPassword: 'new-password-456',
    });

    expect(authSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      USER_ID,
      { exceptSessionId: SESSION_ID, reason: 'password-change' },
    );
  });

  it('returns invalidCurrentPassword when the User cannot be found', async () => {
    const { service, prisma } = buildService({ user: null });

    const result = await service.changePassword({
      userId: USER_ID,
      currentSessionId: SESSION_ID,
      currentPassword: 'old-password-123',
      newPassword: 'new-password-456',
    });

    expect(result).toEqual({ outcome: 'invalidCurrentPassword' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
