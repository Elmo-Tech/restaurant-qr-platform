import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { GuestMenuLinkService } from './guest-menu-link.service';
import type { GuestMenuLink } from './guest-menu-link.service';

interface GuestMenuLinkResponseBody {
  data: GuestMenuLink;
}

/** FT-7: `GET /api/v1/restaurants/{restaurantId}/guest-menu-link` -- read-only, `menu.view`. */
@Controller('restaurants/:restaurantId/guest-menu-link')
export class GuestMenuLinkController {
  constructor(private readonly guestMenuLinkService: GuestMenuLinkService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getGuestMenuLink(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<GuestMenuLinkResponseBody> {
    const data = await this.guestMenuLinkService.getGuestMenuLink(
      request.restaurantAccess.restaurantId,
    );
    return { data };
  }
}
