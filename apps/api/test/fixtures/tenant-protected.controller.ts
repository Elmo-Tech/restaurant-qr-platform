import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BranchAccessGuard } from '../../src/auth/guard/branch-access.guard';
import type { BranchAuthorizedRequest } from '../../src/auth/guard/branch-authorized-request';
import { RestaurantAccessGuard } from '../../src/auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../../src/auth/guard/restaurant-authorized-request';
import { AuthGuard } from '../../src/auth/guard/auth.guard';

/**
 * TEST-ONLY: exists solely to prove RestaurantAccessGuard/BranchAccessGuard
 * end-to-end (cookie -> AuthGuard -> Restaurant/Branch authorization ->
 * PostgreSQL) via real HTTP requests. Registered only by
 * `TenantProtectedModule`, wired into the Nest testing module in
 * `authorization-http.e2e-spec.ts` -- never imported by the production
 * AppModule. Returns only the same safe context the guards already
 * attached to the request (no Prisma record, no secret).
 */
@Controller('test/restaurants')
export class TenantProtectedTestController {
  @Get(':restaurantId/protected')
  @UseGuards(AuthGuard, RestaurantAccessGuard)
  getRestaurantProtected(@Req() request: RestaurantAuthorizedRequest) {
    return { data: { restaurantAccess: request.restaurantAccess } };
  }

  @Get(':restaurantId/branches/:branchId/protected')
  @UseGuards(AuthGuard, RestaurantAccessGuard, BranchAccessGuard)
  getBranchProtected(@Req() request: BranchAuthorizedRequest) {
    return {
      data: {
        restaurantAccess: request.restaurantAccess,
        branchAccess: request.branchAccess,
      },
    };
  }
}
