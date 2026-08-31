import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { AuthSessionService } from '../session/auth-session.service';
import type { AuthenticatedRequest } from './authenticated-request';
import { extractSessionCookie } from './session-cookie.extractor';

/**
 * AUTH_TENANCY_SPEC.md #150A, API_CONVENTIONS.md #36A: the authoritative V1
 * Staff session-authentication failure contract. This exact, generic,
 * information-free body is used for every rejection reason (missing cookie,
 * ambiguous duplicate cookie, malformed token, unknown token, revoked
 * session, expired session, non-ACTIVE User) so none of those internal
 * reasons is externally observable (AUTH_TENANCY_SPEC.md #110, SECURITY_SPEC.md
 * #14's anti-enumeration principle applied to session state).
 */
const UNAUTHENTICATED_RESPONSE = {
  error: {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required.',
  },
};

/**
 * Authentication only (Auth Foundation E): resolves the staff session cookie
 * into a safe principal and attaches it to the request. Not applied
 * globally -- explicit `@UseGuards(AuthGuard)` per protected controller,
 * since most V1 routes (login, public QR, guest menu, guest AI) are
 * intentionally unauthenticated. This guard does not check Restaurant
 * Membership, Branch access, or Permission -- that is tenancy authorization,
 * a later slice.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const cookieName = this.configService.get('AUTH_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const rawToken = extractSessionCookie(request.headers.cookie, cookieName);

    if (!rawToken) {
      throw new HttpException(
        UNAUTHENTICATED_RESPONSE,
        HttpStatus.UNAUTHORIZED,
      );
    }

    // AuthSessionService already owns token-format validation, hashing,
    // lookup, revocation, expiry, and ACTIVE-User checks (AUTH_TENANCY_SPEC.md
    // #110) -- none of that is duplicated here. A database/infrastructure
    // failure here is not caught: it propagates as a normal exception rather
    // than being folded into this 401.
    const resolved = await this.authSessionService.resolveSession(rawToken);

    if (!resolved) {
      throw new HttpException(
        UNAUTHENTICATED_RESPONSE,
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.auth = resolved;
    return true;
  }
}
