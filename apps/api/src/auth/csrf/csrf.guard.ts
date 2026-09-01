import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.schema';
import { isCsrfSafeRequest } from './csrf-origin.validator';

/**
 * Auth Foundation I, approved decision: exactly one generic response for
 * every CSRF-rejection reason (missing Origin, malformed Origin, mismatched
 * Origin, Origin: null, missing/malformed/foreign Referer, or both headers
 * absent). Never reveals which specific header or reason caused the
 * rejection.
 */
const CSRF_VALIDATION_FAILED_RESPONSE = {
  error: {
    code: 'CSRF_VALIDATION_FAILED',
    message: 'Cross-origin request rejected.',
  },
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Reusable Staff cookie-mutation CSRF boundary (AUTH_TENANCY_SPEC.md #105,
 * SECURITY_SPEC.md #63-70). A separate security concern from `AuthGuard`:
 * `AuthGuard` answers "is this Staff session valid?", this guard answers "is
 * this unsafe browser request coming from the approved application origin?".
 * Reuses the single validated trusted `CORS_ORIGIN` -- the same "Strict
 * allowed origins" authority CORS already enforces -- rather than a second,
 * separately configured origin. Performs no database query; pure header
 * inspection via `isCsrfSafeRequest`.
 *
 * Required for every unsafe (state-changing) cookie-authenticated Staff
 * mutation, composing with whatever Restaurant/Branch/Permission
 * authorization guards that route also needs (AUTH_TENANCY_SPEC.md #65,
 * #106A) -- this guard does not replace those, and they do not replace
 * this one. Safe/read-only routes (GET/HEAD/OPTIONS) never require CSRF
 * validation (#106). Logout specifically carries no Tenant/Branch/
 * Permission context, so its settled guard order is exactly
 * `@UseGuards(AuthGuard, CsrfGuard)` (AUTH_TENANCY_SPEC.md #28A).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const allowedOrigin = this.configService.get('CORS_ORIGIN', {
      infer: true,
    });

    const safe = isCsrfSafeRequest({
      method: request.method,
      originHeader: headerValue(request.headers.origin),
      refererHeader: headerValue(request.headers.referer),
      allowedOrigin,
    });

    if (!safe) {
      throw new HttpException(
        CSRF_VALIDATION_FAILED_RESPONSE,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
