import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { ListKitchenTicketsQueryDto } from './dto/list-kitchen-tickets-query.dto';
import { KitchenService } from './kitchen.service';
import type { KitchenTicket } from './kitchen.service';

interface KitchenTicketListResponseBody {
  data: KitchenTicket[];
}

/**
 * Kitchen View V1: the kitchen's read side. Reading needs `kitchen.view`;
 * moving a ticket forward (Start preparing, Ready) uses the existing
 * `PATCH /orders/{id}/status`, whose `ACCEPTED -> PREPARING` and
 * `PREPARING -> READY` transitions already require `kitchen.update`
 * (`order-transitions.ts`), so there is no second write path.
 */
@Controller('restaurants/:restaurantId/kitchen')
export class KitchenController {
  constructor(
    private readonly kitchenService: KitchenService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('orders')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.KITCHEN_VIEW)
  async listTickets(
    @Query() query: ListKitchenTicketsQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<KitchenTicketListResponseBody> {
    // the kitchen screen is a package feature (DEC-054)
    if (!(await this.entitlements.isEnabled(request.restaurantAccess.restaurantId, 'KITCHEN'))) {
      throw featureNotAvailableException(new FeatureNotAvailableError('KITCHEN'));
    }
    const data = await this.kitchenService.listTickets(
      {
        restaurantId: request.restaurantAccess.restaurantId,
        membershipId: request.restaurantAccess.membershipId,
        allBranches: request.restaurantAccess.allBranches,
        role: request.restaurantAccess.role,
        roleId: request.restaurantAccess.roleId,
        permissions: request.restaurantAccess.permissions,
      },
      { branchId: query.branchId },
    );
    return { data };
  }
}
