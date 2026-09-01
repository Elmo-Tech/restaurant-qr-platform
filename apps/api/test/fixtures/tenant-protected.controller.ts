import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BranchAccessGuard } from '../../src/auth/guard/branch-access.guard';
import type { BranchAuthorizedRequest } from '../../src/auth/guard/branch-authorized-request';
import { PermissionGuard } from '../../src/auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../../src/auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../../src/auth/guard/restaurant-authorized-request';
import { AuthGuard } from '../../src/auth/guard/auth.guard';
import { PERMISSIONS } from '../../src/auth/permission/permission';
import { RequirePermission } from '../../src/auth/permission/require-permission.decorator';

/**
 * TEST-ONLY: exists solely to prove RestaurantAccessGuard/BranchAccessGuard/
 * PermissionGuard end-to-end (cookie -> AuthGuard -> Restaurant/Branch
 * authorization -> Permission validation -> PostgreSQL) via real HTTP
 * requests. Registered only by `TenantProtectedModule`, wired into the Nest
 * testing module in `authorization-http.e2e-spec.ts` and
 * `permission-http.e2e-spec.ts` -- never imported by the production
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

  /** Correct guard order: PermissionGuard runs after RestaurantAccessGuard has attached Role. */
  @Get(':restaurantId/menu-manage-protected')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  getMenuManageProtected(@Req() request: RestaurantAuthorizedRequest) {
    return { data: { restaurantAccess: request.restaurantAccess } };
  }

  /**
   * Deliberately misordered: PermissionGuard runs BEFORE RestaurantAccessGuard,
   * so `request.restaurantAccess` is never attached. Proves PermissionGuard
   * fails closed end-to-end rather than trusting `request.auth` alone.
   */
  @Get(':restaurantId/misordered-permission-protected')
  @UseGuards(AuthGuard, PermissionGuard, RestaurantAccessGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  getMisorderedPermissionProtected() {
    return { data: { ok: true } };
  }

  /** PermissionGuard applied with no @RequirePermission -- must deny, never an implicit allow. */
  @Get(':restaurantId/no-required-permission-protected')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  getNoRequiredPermissionProtected() {
    return { data: { ok: true } };
  }
}
