import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import type { UserState } from '../../generated/prisma/client';
import { SessionTokenService } from './session-token.service';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Safe result of session creation. The raw token is returned exactly once,
 * for the future HTTP layer to place in a secure cookie. `tokenHash` and any
 * other internal persistence field are intentionally never included.
 */
export interface CreatedAuthSession {
  token: string;
  sessionId: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

/**
 * Safe authentication principal returned by session resolution. This is
 * deliberately NOT the Prisma AuthSession or User row: it never carries
 * `tokenHash`, `passwordHash`, or any other persistence-internal field.
 */
export interface ResolvedAuthSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  userState: UserState;
}

/**
 * Persisted Auth Session lifecycle (DATABASE_SPEC.md #33A, AUTH_TENANCY_SPEC.md
 * #20-30, #110). Authentication only — this service never checks Restaurant
 * Membership or Branch access (that is authorization, handled elsewhere).
 */
@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async createSession(userId: string): Promise<CreatedAuthSession> {
    const token = this.sessionTokenService.generateRawToken();
    const tokenHash = this.sessionTokenService.hashToken(token);

    const ttlDays = this.configService.get('AUTH_SESSION_TTL_DAYS', {
      infer: true,
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * MILLISECONDS_PER_DAY);

    // select (not the default full row) so tokenHash never crosses back out
    // of the PrismaService boundary into the service result.
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        // No database default exists for lastSeenAt (DATABASE_SPEC.md #33A):
        // creation logic must set it explicitly.
        lastSeenAt: now,
        expiresAt,
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
      },
    });

    return {
      token,
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
    };
  }

  /**
   * Validates a raw opaque token and returns a safe authentication
   * principal, or null if the token does not authenticate. lastSeenAt is
   * intentionally left unchanged here (see report: AUTH_TENANCY_SPEC.md #26
   * discourages a write on every request; a throttled update policy is not
   * yet documented, so it is deferred rather than invented).
   */
  async resolveSession(rawToken: string): Promise<ResolvedAuthSession | null> {
    if (!this.sessionTokenService.isWellFormedRawToken(rawToken)) {
      return null;
    }

    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    // select only what is needed to validate the session and build the safe
    // result. In particular this never loads passwordHash or tokenHash back
    // out of PostgreSQL, even transiently.
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (session.revokedAt !== null) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    // AUTH_TENANCY_SPEC.md #110: every protected request validates the
    // session "Belongs to ACTIVE User".
    if (session.user.status !== 'ACTIVE') {
      return null;
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      userState: session.user.status,
    };
  }

  /**
   * Revokes the session identified by the raw token. Safe/idempotent: an
   * unknown, already-revoked, or malformed token simply matches zero rows
   * (malformed tokens are rejected before any Prisma call at all).
   */
  async revokeSession(rawToken: string, reason?: string): Promise<void> {
    if (!this.sessionTokenService.isWellFormedRawToken(rawToken)) {
      return;
    }

    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason ?? null },
    });
  }

  /**
   * Revokes the session identified by its own safe `sessionId` (Auth
   * Foundation I: Logout already has `request.auth.sessionId` from
   * `AuthGuard`'s own resolution this same request, so re-reading or
   * re-parsing the raw cookie token is unnecessary). Safe/idempotent like
   * `revokeSession`: an unknown or already-revoked id simply matches zero
   * rows. `sessionId` is never client-supplied -- it only ever comes from a
   * previously resolved `ResolvedAuthSession`, so no shape pre-check is
   * needed here the way `revokeSession` needs one for an attacker-controlled
   * raw cookie value.
   */
  async revokeSessionById(sessionId: string, reason?: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason ?? null },
    });
  }

  /**
   * FT-12 (AUTH_TENANCY_SPEC.md #30: "Changing password should revoke other
   * active Auth Sessions"): revokes every currently-active session belonging
   * to `userId`. `exceptSessionId` keeps one session alive -- used by
   * Change Password, where the caller's own current session should survive
   * so they are not immediately signed out by their own action. Password
   * Reset (an anonymous flow with no current session) omits it, revoking
   * all sessions unconditionally. Safe/idempotent like `revokeSession`: a
   * User with no active sessions simply matches zero rows.
   */
  async revokeAllSessionsForUser(
    userId: string,
    options?: { exceptSessionId?: string; reason?: string },
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options?.exceptSessionId
          ? { id: { not: options.exceptSessionId } }
          : {}),
      },
      data: { revokedAt: new Date(), revokeReason: options?.reason ?? null },
    });
  }
}
