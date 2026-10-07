import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthSessionService } from '../session/auth-session.service';
import { PasswordHasherService } from './password-hasher.service';

export interface ChangePasswordInput {
  userId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * `invalidCurrentPassword`: the submitted current password does not match.
 * Deliberately distinguishable from Login's enumeration-hiding contract
 * (LoginService's `invalidCredentials`) -- this is an already-authenticated
 * User confirming their own credential, not an anonymous login attempt, so
 * there is no email/account to enumerate.
 */
export type ChangePasswordResult =
  | { outcome: 'changed' }
  | { outcome: 'invalidCurrentPassword' };

/**
 * FT-12 Account: self-service Change Password (AUTH_TENANCY_SPEC.md #30:
 * "Changing password should revoke other active Auth Sessions"). No
 * Restaurant/Branch/Permission concern -- this is account-level, not
 * Tenant-scoped.
 */
@Injectable()
export class ChangePasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasherService: PasswordHasherService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async changePassword(
    input: ChangePasswordInput,
  ): Promise<ChangePasswordResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, passwordHash: true },
    });

    // The caller is already authenticated by AuthGuard (a resolved,
    // non-revoked, non-expired session for an ACTIVE User), so `user` is
    // never null here in practice. Guarded anyway rather than assuming.
    if (!user) {
      return { outcome: 'invalidCurrentPassword' };
    }

    const currentPasswordMatches =
      await this.passwordHasherService.verifyPassword(
        input.currentPassword,
        user.passwordHash,
      );

    if (!currentPasswordMatches) {
      return { outcome: 'invalidCurrentPassword' };
    }

    const newPasswordHash = await this.passwordHasherService.hashPassword(
      input.newPassword,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Keep the session that just performed this change alive; every other
    // session for this User is revoked.
    await this.authSessionService.revokeAllSessionsForUser(user.id, {
      exceptSessionId: input.currentSessionId,
      reason: 'password-change',
    });

    return { outcome: 'changed' };
  }
}
