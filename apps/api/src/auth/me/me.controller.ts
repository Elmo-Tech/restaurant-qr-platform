import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthContextService } from '../context/auth-context.service';
import type { AuthContext } from '../context/auth-context.service';
import { AuthGuard } from '../guard/auth.guard';
import type { AuthenticatedRequest } from '../guard/authenticated-request';

interface MeResponseBody {
  data: AuthContext;
}

/**
 * Transport-only HTTP boundary (Auth Foundation F). Contains no Prisma
 * query, no raw cookie handling, and no Restaurant/Branch trust logic --
 * `AuthContextService` owns all of that. The authenticated `userId` comes
 * only from `request.auth`, attached by `AuthGuard`; never from the URL,
 * query, body, or headers.
 */
@Controller('auth')
export class MeController {
  constructor(private readonly authContextService: AuthContextService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() request: AuthenticatedRequest): Promise<MeResponseBody> {
    const data = await this.authContextService.getAuthContext(
      request.auth.userId,
    );

    return { data };
  }
}
