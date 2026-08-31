import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHasherService } from '../password/password-hasher.service';
import { AuthSessionService } from '../session/auth-session.service';

export interface LoginCredentials {
  email: string;
  password: string;
}

/** Safe result of a successful login. Never carries passwordHash/tokenHash. */
export interface LoginSuccess {
  outcome: 'success';
  token: string;
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

/**
 * `invalidCredentials`: unknown email, wrong password, or malformed input —
 * deliberately the same external outcome for all three (AUTH_TENANCY_SPEC.md
 * #6/#35, SECURITY_SPEC.md #14: do not reveal whether an email exists).
 *
 * `accountUnavailable`: the User was found but is not currently eligible to
 * authenticate (AUTH_TENANCY_SPEC.md #17-19: only ACTIVE may authenticate).
 * Kept distinct from `invalidCredentials` at this service layer for future
 * internal use (e.g. audit logging). Whether a future HTTP layer collapses
 * this into the same generic external message as `invalidCredentials` is a
 * decision for that slice, not this one (see report).
 */
export interface LoginFailure {
  outcome: 'invalidCredentials' | 'accountUnavailable';
}

export type LoginResult = LoginSuccess | LoginFailure;

/**
 * Normalizes a login email per AUTH_TENANCY_SPEC.md #15 ("Trimmed,
 * Normalized safely, Compared case-insensitively") and DATABASE_SPEC.md
 * #33E (`users.email_normalized`). Trim-then-lowercase is the only single
 * stored/compared representation that satisfies both documented properties
 * at once.
 */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Timing-equalization hash (SECURITY_SPEC.md hardening: avoid quick-exit
 * account enumeration for any plausible login attempt). This is NOT a real
 * User credential and is NOT a secret — it is a fixed, precomputed Argon2id
 * PHC string used only so that "unknown email" / "INVITED" / "DISABLED"
 * login attempts perform the same one Argon2id verification as an ACTIVE
 * User with a wrong password, removing the processing-time discrepancy
 * between those paths. Encodes the same approved parameters as
 * PasswordHasherService (m=19456, t=2, p=1). Generated once, offline, from
 * an arbitrary non-production string — never regenerated at startup or
 * per-request.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$1eUNYovhGblUnTR3WX1Yjw$X5Epma/LyCgkVbkiolWgQHpHyNZNE2wpKp0uPhc8DPw';

/**
 * Connects User lookup -> password verification -> User-state eligibility
 * -> opaque session creation. No HTTP concerns (no cookies, no
 * controller/DTO), no Restaurant/Branch authorization — a successful login
 * proves User identity only.
 */
@Injectable()
export class LoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasherService: PasswordHasherService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async login({ email, password }: LoginCredentials): Promise<LoginResult> {
    if (
      typeof email !== 'string' ||
      email.trim().length === 0 ||
      typeof password !== 'string' ||
      password.length === 0
    ) {
      return { outcome: 'invalidCredentials' };
    }

    const emailNormalized = normalizeLoginEmail(email);

    // select only what login needs (DATABASE_SPEC.md #31/#33E field set),
    // never Memberships/AuthSessions/other profile fields.
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: {
        id: true,
        passwordHash: true,
        status: true,
      },
    });

    const isEligibleActiveUser = user !== null && user.status === 'ACTIVE';

    // Every plausible login attempt performs exactly one Argon2id
    // verification, regardless of whether the User exists or is eligible to
    // authenticate, so that "unknown email" / "INVITED" / "DISABLED" cannot
    // be distinguished from "ACTIVE + wrong password" by processing time.
    // Non-ACTIVE Users are not eligible for normal authentication, so their
    // real passwordHash is never checked against the submitted password —
    // only the non-secret dummy hash is used for the comparable work.
    const verificationHash = isEligibleActiveUser
      ? user.passwordHash
      : DUMMY_PASSWORD_HASH;

    const passwordMatches = await this.passwordHasherService.verifyPassword(
      password,
      verificationHash,
    );

    if (!user) {
      return { outcome: 'invalidCredentials' };
    }

    // AUTH_TENANCY_SPEC.md #17-19: only ACTIVE may authenticate normally.
    if (!isEligibleActiveUser) {
      return { outcome: 'accountUnavailable' };
    }

    if (!passwordMatches) {
      return { outcome: 'invalidCredentials' };
    }

    const created = await this.authSessionService.createSession(user.id);

    return {
      outcome: 'success',
      token: created.token,
      sessionId: created.sessionId,
      userId: created.userId,
      expiresAt: created.expiresAt,
    };
  }
}
