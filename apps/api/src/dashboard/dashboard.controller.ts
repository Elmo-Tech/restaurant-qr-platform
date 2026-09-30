import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardService } from './dashboard.service';
import type { DashboardMetrics } from './dashboard.service';

interface DashboardMetricsResponseBody {
  data: DashboardMetrics;
}

/**
 * FT-11: the Restaurant Dashboard analytics route,
 * `GET /api/v1/restaurants/{restaurantId}/dashboard`. Read-only, gated by
 * the existing `analytics.view` Permission (already granted to OWNER/MANAGER
 * in `role-permissions.ts` -- CASHIER/KITCHEN/WAITER never had it, and the
 * Web only renders this screen when the authenticated Membership actually
 * has it, mirroring every other Permission-gated Staff screen). No
 * `AllBranchesRequiredGuard` -- Branch scope is resolved per-request inside
 * `DashboardService`, exactly like `OrdersController`.
 */
@Controller('restaurants/:restaurantId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ANALYTICS_VIEW)
  async getMetrics(
    @Query() query: DashboardQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<DashboardMetricsResponseBody> {
    const data = await this.dashboardService.getMetrics(
      {
        restaurantId: request.restaurantAccess.restaurantId,
        membershipId: request.restaurantAccess.membershipId,
        allBranches: request.restaurantAccess.allBranches,
      },
      query,
    );

    return { data };
  }
}
