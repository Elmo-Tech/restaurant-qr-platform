import { Controller, Get, Param, Post, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { WhatsappTrackingService } from './whatsapp-tracking.service';

@Controller('restaurants/:restaurantId/whatsapp-tracking')
export class WhatsappTrackingController {
  constructor(private readonly tracking:WhatsappTrackingService) {}
  @Get('connection')
  @UseGuards(AuthGuard,RestaurantAccessGuard,PermissionGuard,AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async connection(@Req() req:RestaurantAuthorizedRequest) {
    return { data:await this.tracking.state(req.restaurantAccess.restaurantId) };
  }
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard,CsrfGuard,RestaurantAccessGuard,PermissionGuard,AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async connect(@Req() req:RestaurantAuthorizedRequest) {
    return { data:await this.tracking.connect(req.restaurantAccess.restaurantId) };
  }
  @Get('today')
  @UseGuards(AuthGuard,RestaurantAccessGuard,PermissionGuard,AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.ANALYTICS_VIEW)
  async today(@Req() req:RestaurantAuthorizedRequest) {
    return { data:await this.tracking.today(req.restaurantAccess.restaurantId) };
  }
}
@Controller('whatsapp-tracking')
export class WhatsappTrackingWebhookController {
  constructor(private readonly tracking:WhatsappTrackingService) {}
  @Post('webhook/:secret')
  @HttpCode(HttpStatus.OK)
  async webhook(@Param('secret') secret:string,@Body() payload:unknown) {
    await this.tracking.ingest(secret,payload);
    return { ok:true };
  }
}
