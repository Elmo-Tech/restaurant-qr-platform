import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DUMMY_PASSWORD_HASH,
  normalizeLoginEmail,
} from '../auth/login/login.service';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { SessionTokenService } from '../auth/session/session-token.service';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** The signed-in Platform Administrator: never carries a hash or a token. */
export interface PlatformAdminPrincipal {
  adminId: string;
  email: string;
  displayName: string;
  sessionId: string;
}

export type PlatformLoginResult =
  | {
      outcome: 'success';
      token: string;
      expiresAt: Date;
      admin: { id: string; email: string; displayName: string };
    }
  | { outcome: 'invalidCredentials' };

/**
 * Platform Administrator authentication (DEC-045): email and password (Argon2id), an opaque
 * database session with its own lifetime. A separate domain from restaurant Staff: it reads only
 * `platform_admins` / `platform_sessions`, never `users` or `auth_sessions`, so a restaurant Owner
 * can never become a Platform Administrator and the reverse.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: SessionTokenService,
  ) {}

  async login(email: string, password: string): Promise<PlatformLoginResult> {
    if (
      typeof email !== 'string' ||
      email.trim().length === 0 ||
      typeof password !== 'string' ||
      password.length === 0
    ) {
      return { outcome: 'invalidCredentials' };
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { emailNormalized: normalizeLoginEmail(email) },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        status: true,
      },
    });
    const eligible = admin !== null && admin.status === 'ACTIVE';

    // One Argon2id verification for every plausible attempt (unknown email, disabled account,
    // wrong password), so response time does not reveal which one it was.
    const matches = await this.passwordHasher.verifyPassword(
      password,
      eligible ? admin.passwordHash : DUMMY_PASSWORD_HASH,
    );
    if (!admin || !eligible || !matches) {
      return { outcome: 'invalidCredentials' };
    }

    const token = this.tokens.generateRawToken();
    const now = new Date();
    const ttlHours = this.configService.get('PLATFORM_SESSION_TTL_HOURS', {
      infer: true,
    });
    const expiresAt = new Date(
      now.getTime() + ttlHours * MILLISECONDS_PER_HOUR,
    );
    await this.prisma.$transaction([
      this.prisma.platformSession.create({
        data: {
          adminId: admin.id,
          tokenHash: this.tokens.hashToken(token),
          lastSeenAt: now,
          expiresAt,
        },
      }),
      this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: now },
      }),
    ]);
    return {
      outcome: 'success',
      token,
      expiresAt,
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      },
    };
  }

  /** The administrator behind a raw session token, or null (malformed, unknown, revoked, expired, disabled). */
  async resolveSession(
    rawToken: string,
  ): Promise<PlatformAdminPrincipal | null> {
    if (!this.tokens.isWellFormedRawToken(rawToken)) return null;
    const session = await this.prisma.platformSession.findUnique({
      where: { tokenHash: this.tokens.hashToken(rawToken) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        admin: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
    });
    if (!session || session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.admin.status !== 'ACTIVE') return null;
    return {
      adminId: session.admin.id,
      email: session.admin.email,
      displayName: session.admin.displayName,
      sessionId: session.id,
    };
  }

  /** Ends the session of this token. Idempotent: an unknown or malformed token changes nothing. */
  async revokeSession(rawToken: string): Promise<void> {
    if (!this.tokens.isWellFormedRawToken(rawToken)) return;
    await this.prisma.platformSession.updateMany({
      where: { tokenHash: this.tokens.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
