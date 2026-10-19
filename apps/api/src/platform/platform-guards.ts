import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isCsrfSafeRequest } from '../auth/csrf/csrf-origin.validator';
import { extractSessionCookie } from '../auth/guard/session-cookie.extractor';
import type { EnvConfig } from '../config/env.schema';
import {
  PlatformAuthService,
  type PlatformAdminPrincipal,
} from './platform-auth.service';

/** A request that passed `PlatformAuthGuard`. */
export type PlatformRequest = Request & {
  platformAdmin: PlatformAdminPrincipal;
};

const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
};
const ORIGIN_REFUSED = {
  error: {
    code: 'CSRF_VALIDATION_FAILED',
    message: 'Cross-origin request rejected.',
  },
};

/**
 * Origin check for every platform route (DEC-045). The platform web app is the only origin that may
 * call them, for reads as well as writes: a browser request from any other origin is refused (the
 * restaurant dashboard's origin included), and an unsafe request must also carry the platform
 * Origin (or Referer). Without `PLATFORM_ORIGIN` configured everything is refused (fail closed).
 * A request with no Origin header at all (a script, curl) is judged only by the cookie, as for Staff.
 */
@Injectable()
export class PlatformCsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const allowedOrigin = this.configService.get('PLATFORM_ORIGIN', {
      infer: true,
    });
    if (!allowedOrigin)
      throw new HttpException(ORIGIN_REFUSED, HttpStatus.FORBIDDEN);

    const origin = request.headers.origin;
    if (
      typeof origin === 'string' &&
      origin !== '' &&
      origin !== new URL(allowedOrigin).origin
    ) {
      throw new HttpException(ORIGIN_REFUSED, HttpStatus.FORBIDDEN);
    }
    const safe = isCsrfSafeRequest({
      method: request.method,
      originHeader: origin,
      refererHeader: request.headers.referer,
      allowedOrigin,
    });
    if (!safe) throw new HttpException(ORIGIN_REFUSED, HttpStatus.FORBIDDEN);
    return true;
  }
}

/** Resolves the platform session cookie into `request.platformAdmin`; the same generic 401 for every reason. */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const cookieName = this.configService.get('PLATFORM_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const rawToken = extractSessionCookie(request.headers.cookie, cookieName);
    const principal = rawToken
      ? await this.auth.resolveSession(rawToken)
      : null;
    if (!principal)
      throw new HttpException(UNAUTHENTICATED, HttpStatus.UNAUTHORIZED);
    request.platformAdmin = principal;
    return true;
  }
}
