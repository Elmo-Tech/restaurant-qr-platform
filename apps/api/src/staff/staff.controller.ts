import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { StaffService } from './staff.service';
import type { StaffMembershipListItem } from './staff.service';

interface StaffMembershipListResponseBody {
  data: StaffMembershipListItem[];
}

/**
 * Business Foundation R: the Restaurant Staff Membership List.
 * `GET /api/v1/restaurants/{restaurantId}/memberships`
 * (API_CONVENTIONS.md #117A).
 *
 * Membership-centric, Restaurant-wide (no Branch-nested route): Memberships
 * are a Restaurant-wide resource (AUTH_TENANCY_SPEC.md #63), so this route
 * carries no Branch guard of any kind -- Branch-scoped subset visibility is
 * enforced entirely inside `StaffService`, not by a guard. Read-only, so no
 * `CsrfGuard` (AUTH_TENANCY_SPEC.md #106A).
 *
 * Settled guard order: `AuthGuard` -> `RestaurantAccessGuard` ->
 * `PermissionGuard` (AUTH_TENANCY_SPEC.md #65K). Requires exactly
 * `users.view` -- distinct from `users.manage`; read visibility and future
 * Staff-management (mutation) authority are separate concerns. All
 * authorization fields (`restaurantId`, `membershipId`, `allBranches`) come
 * only from `request.restaurantAccess`, produced by `RestaurantAccessGuard`'s
 * own current database lookup this request -- never re-read from the raw
 * route param, body, query, or headers here.
 */
@Controller('restaurants/:restaurantId/memberships')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_VIEW)
  async listStaffMemberships(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffMembershipListResponseBody> {
    const data = await this.staffService.listStaffMemberships({
      restaurantId: request.restaurantAccess.restaurantId,
      membershipId: request.restaurantAccess.membershipId,
      allBranches: request.restaurantAccess.allBranches,
    });

    return { data };
  }
}
