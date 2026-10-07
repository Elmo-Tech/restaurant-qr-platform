import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import { normalizeLoginEmail } from '../login/login.service';
import { AuthSessionService } from '../session/auth-session.service';
import { SessionTokenService } from '../session/session-token.service';
import { PasswordHasherService } from './password-hasher.service';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * A reset token is only ever issued for an existing, `ACTIVE` User
 * (AUTH_TENANCY_SPEC.md #17-19, mirroring Login's own eligibility rule) --
 * never for an unknown email or a non-ACTIVE User. `rawToken` is `null` in
 * every other case; the caller (`PasswordController`) never learns which
 * specific reason applied (SECURITY_SPEC.md #15, AUTH_TENANCY_SPEC.md #34:
 * Forgot Password must not reveal whether an email exists).
 */
export interface RequestPasswordResetResult {
  rawToken: string | null;
}

export type ResetPasswordResult =
  | { outcome: 'reset' }
  | { outcome: 'invalidToken' };

/**
 * FT-12 Password Recovery (AUTH_TENANCY_SPEC.md #31-34, SECURITY_SPEC.md
 * #28-30). Reuses the same generic opaque-token primitive
 * (`SessionTokenService`) Session and Invitation tokens already rely on --
 * no separate token scheme is invented. No mail provider exists in this
 * repository yet (CLAUDE.md #75/FT-13): delivering the raw token to the
 * User by email is explicitly out of scope for this service; the
 * development-only exposure of the raw token is a `PasswordController`
 * concern, not this service's.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly sessionTokenService: SessionTokenService,
    private readonly passwordHasherService: PasswordHasherService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async requestPasswordReset(
    email: string,
  ): Promise<RequestPasswordResetResult> {
    const emailNormalized = normalizeLoginEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return { rawToken: null };
    }

    const rawToken = this.sessionTokenService.generateRawToken();
    const tokenHash = this.sessionTokenService.hashToken(rawToken);
    const ttlMinutes = this.configService.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlMinutes * MILLISECONDS_PER_MINUTE);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return { rawToken };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<ResetPasswordResult> {
    if (!this.sessionTokenService.isWellFormedRawToken(rawToken)) {
      return { outcome: 'invalidToken' };
    }

    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
        user: { select: { status: true } },
      },
    });

    const isUsable =
      resetToken !== null &&
      resetToken.consumedAt === null &&
      resetToken.expiresAt.getTime() > Date.now() &&
      resetToken.user.status === 'ACTIVE';

    if (!resetToken || !isUsable) {
      return { outcome: 'invalidToken' };
    }

    // One-time consumption: an atomic conditional update, exactly like
    // Staff Invitation acceptance -- a second concurrent attempt with the
    // same raw token matches zero rows instead of consuming it twice.
    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { id: resetToken.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count === 0) {
      return { outcome: 'invalidToken' };
    }

    const newPasswordHash = await this.passwordHasherService.hashPassword(
      newPassword,
    );

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newPasswordHash },
    });

    // Anonymous flow -- there is no "current session" to keep alive, unlike
    // Change Password.
    await this.authSessionService.revokeAllSessionsForUser(
      resetToken.userId,
      { reason: 'password-reset' },
    );

    return { outcome: 'reset' };
  }
}
