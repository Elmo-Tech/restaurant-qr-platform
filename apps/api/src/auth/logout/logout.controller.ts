import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { EnvConfig } from '../../config/env.schema';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuthGuard } from '../guard/auth.guard';
import type { AuthenticatedRequest } from '../guard/authenticated-request';
import { AuthSessionService } from '../session/auth-session.service';

/**
 * AUTH_TENANCY_SPEC.md #28: normal logout revokes only the current
 * AuthSession and clears the browser cookie -- it does not need to revoke
 * every device (that is the separate, not-yet-implemented
 * `/auth/logout-all`). API_CONVENTIONS.md #27: successful logout is the
 * canonical `204 No Content` example, no response body.
 *
 * Guard order is significant (Auth Foundation I, approved architecture):
 * `AuthGuard` establishes the Staff session identity first, then `CsrfGuard`
 * validates the request's Origin/Referer. Logout is User/session-level --
 * it deliberately carries no `RestaurantAccessGuard`, `BranchAccessGuard`,
 * or `PermissionGuard`, since ending one's own session never requires
 * Restaurant Membership.
 *
 * Controller responsibilities only: no Prisma query, no raw cookie/token
 * parsing here -- `request.auth.sessionId` is the safe resolved identity
 * `AuthGuard` already produced this same request, so the raw session cookie
 * token is never re-read or re-parsed for logout.
 */
@Controller('auth')
export class LogoutController {
  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // The database revoke must complete before any success response is
    // produced -- session invalidation is core auth state, not a
    // fire-and-forget side effect.
    await this.authSessionService.revokeSessionById(request.auth.sessionId);

    const cookieName = this.configService.get('AUTH_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const secure = this.configService.get('AUTH_COOKIE_SECURE', {
      infer: true,
    });
    const sameSite = this.configService.get('AUTH_COOKIE_SAME_SITE', {
      infer: true,
    });

    // Clearing attributes must match the cookie Login actually set (secure,
    // sameSite, path) or the browser will not recognize it as the same
    // cookie to remove. Host-only cookie: no `domain` attribute, exactly as
    // Login never sets one.
    response.clearCookie(cookieName, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
    });
  }
}
