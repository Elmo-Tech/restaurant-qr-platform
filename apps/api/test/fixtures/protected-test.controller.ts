import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../src/auth/guard/auth.guard';
import type { AuthenticatedRequest } from '../../src/auth/guard/authenticated-request';

/**
 * TEST-ONLY: exists solely to prove AuthGuard end-to-end (cookie -> guard ->
 * AuthSessionService -> PostgreSQL) via a real HTTP request. Registered only
 * by `ProtectedTestModule`, which is wired into the Nest testing module in
 * `auth-guard-http.e2e-spec.ts` -- never imported by the production
 * AppModule. Returns only the same safe fields AuthGuard already attached to
 * the request (AUTH_TENANCY_SPEC.md #3: authentication context only, no
 * raw token, no Restaurant/Membership/Branch/Role).
 */
@Controller('test/protected')
export class ProtectedTestController {
  @Get()
  @UseGuards(AuthGuard)
  getProtected(@Req() request: AuthenticatedRequest) {
    return {
      data: {
        userId: request.auth.userId,
        sessionId: request.auth.sessionId,
      },
    };
  }
}
