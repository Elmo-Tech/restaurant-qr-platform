import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';
import { DeliveryZonesService } from './delivery-zones.service';
import type { DeliveryBranchView, DeliveryZoneView } from './delivery-zones.service';

const BRANCH_NOT_FOUND_RESPONSE = {
  error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
};

/** One stable existence-hiding response for a malformed, unknown, or foreign-Restaurant zone id. */
const ZONE_NOT_FOUND_RESPONSE = {
  error: { code: 'DELIVERY_ZONE_NOT_FOUND', message: 'Delivery zone not found.' },
};

const ZONE_HAS_ORDERS_RESPONSE = {
  error: {
    code: 'DELIVERY_ZONE_HAS_ORDERS',
    message: 'This delivery zone has orders and cannot be deleted. Deactivate it instead.',
  },
};

/**
 * FT-8: Restaurant Settings -> Delivery. Reads need `restaurant.view`;
 * every mutation needs `restaurant.manage` plus Restaurant-wide branch scope
 * (`AllBranchesRequiredGuard`), exactly like the other Restaurant-structural
 * settings (Languages, Menu). The Restaurant is only ever
 * `request.restaurantAccess.restaurantId`.
 */
@Controller('restaurants/:restaurantId')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get('delivery')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async listDelivery(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: DeliveryBranchView[] }> {
    const data = await this.deliveryZonesService.listDeliveryBranches({
      restaurantId: request.restaurantAccess.restaurantId,
      membershipId: request.restaurantAccess.membershipId,
      allBranches: request.restaurantAccess.allBranches,
    });
    return { data };
  }

  @Post('branches/:branchId/delivery-zones')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async createZone(
    @Param('branchId') branchId: string,
    @Body() dto: CreateDeliveryZoneDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: DeliveryZoneView }> {
    const result = await this.deliveryZonesService.createZone({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId,
      name: dto.name,
      deliveryFee: dto.deliveryFee,
      minimumOrder: dto.minimumOrder,
      status: dto.status ?? 'ACTIVE',
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'branchNotFound') {
      throw new NotFoundException(BRANCH_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch('delivery-zones/:zoneId')
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateZone(
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateDeliveryZoneDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: DeliveryZoneView }> {
    const result = await this.deliveryZonesService.updateZone({
      restaurantId: request.restaurantAccess.restaurantId,
      zoneId,
      name: dto.name,
      deliveryFee: dto.deliveryFee,
      minimumOrder: dto.minimumOrder,
      status: dto.status,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'zoneNotFound') {
      throw new NotFoundException(ZONE_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Delete('delivery-zones/:zoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async deleteZone(
    @Param('zoneId') zoneId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.deliveryZonesService.deleteZone({
      restaurantId: request.restaurantAccess.restaurantId,
      zoneId,
    });
    if (result.outcome === 'zoneNotFound') {
      throw new NotFoundException(ZONE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasOrders') {
      throw new ConflictException(ZONE_HAS_ORDERS_RESPONSE);
    }
  }
}
