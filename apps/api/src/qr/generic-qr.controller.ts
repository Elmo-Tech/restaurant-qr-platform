import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { UpdateGenericQrDto } from './dto/update-generic-qr.dto';
import { GenericQrService } from './generic-qr.service';
import type { GenericQrView } from './generic-qr.service';

const GENERIC_QR_NOT_FOUND_RESPONSE = {
  error: { code: 'GENERIC_QR_NOT_FOUND', message: 'This Restaurant has no Restaurant QR yet.' },
};

const GENERIC_QR_EXISTS_RESPONSE = {
  error: { code: 'GENERIC_QR_ALREADY_EXISTS', message: 'This Restaurant already has a Restaurant QR.' },
};

/**
 * FT-9: `/api/v1/restaurants/{restaurantId}/generic-qr` -- the Restaurant-wide
 * QR for Pickup/Delivery. Reads need `tables.view`; create/status changes
 * need `tables.manage` plus full Restaurant branch scope, because the QR
 * belongs to the whole Restaurant, not to any one Branch (same rule as the
 * other Restaurant-structural resources). The Restaurant is only ever
 * `request.restaurantAccess.restaurantId`.
 */
@Controller('restaurants/:restaurantId/generic-qr')
export class GenericQrController {
  constructor(private readonly genericQrService: GenericQrService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  async getGenericQr(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: GenericQrView | null }> {
    const data = await this.genericQrService.getGenericQr(request.restaurantAccess.restaurantId);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  async createGenericQr(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: GenericQrView }> {
    const result = await this.genericQrService.createGenericQr(
      request.restaurantAccess.restaurantId,
    );
    if (result.outcome === 'alreadyExists') {
      throw new ConflictException(GENERIC_QR_EXISTS_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch()
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  async updateGenericQr(
    @Body() dto: UpdateGenericQrDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: GenericQrView }> {
    const result = await this.genericQrService.updateStatus(
      request.restaurantAccess.restaurantId,
      dto.status,
    );
    if (result.outcome === 'notFound') {
      throw new NotFoundException(GENERIC_QR_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }
}
