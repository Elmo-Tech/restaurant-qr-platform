import type { Request } from 'express';
import type { ResolvedAuthSession } from '../session/auth-session.service';

/**
 * One reusable request-auth type, so a protected controller reads
 * `request.auth` instead of scattering `any`/`unknown` casts. `auth` is
 * exactly the safe principal AuthSessionService already produces --
 * sessionId, userId, expiresAt, lastSeenAt, userState. Never the raw token,
 * never tokenHash/passwordHash, never Restaurant/Membership/Branch/Role
 * (authentication only; tenancy authorization is a later slice).
 */
export interface AuthenticatedRequest extends Request {
  auth: ResolvedAuthSession;
}
