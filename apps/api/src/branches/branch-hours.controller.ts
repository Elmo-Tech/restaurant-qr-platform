import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import {
  BranchHoursService,
  type BranchHoursView,
} from './branch-hours.service';
import { UpdateBranchHoursDto } from './dto/update-branch-hours.dto';

const INVALID_MESSAGES = {
  INVALID_HOURS:
    'The opening hours are not valid: use HH:MM times, no two intervals may overlap, and an interval cannot start and end at the same time.',
  HOURS_SCHEDULE_EMPTY:
    'Add at least one opening time, or choose "always open".',
} as const;

/**
 * Branch opening hours (DEC-042): `GET`/`PUT /restaurants/{restaurantId}/branches/{branchId}/hours`.
 * Same authority as editing the Branch (`branches.manage`; the Branch id comes only from
 * `request.branchAccess`), and the same guard order as `PATCH /branches/{branchId}`.
 * Reading needs `branches.view`.
 */
@Controller('restaurants/:restaurantId/branches/:branchId/hours')
export class BranchHoursController {
  constructor(private readonly branchHoursService: BranchHoursService) {}

  @Get()
  @UseGuards(
    AuthGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_VIEW)
  async getHours(
    @Req() request: BranchAuthorizedRequest,
  ): Promise<{ data: BranchHoursView }> {
    const data = await this.branchHoursService.getHours({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
    });
    return { data };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.BRANCHES_MANAGE)
  async updateHours(
    @Body() dto: UpdateBranchHoursDto,
    @Req() request: BranchAuthorizedRequest,
  ): Promise<{ data: BranchHoursView }> {
    const result = await this.branchHoursService.updateHours({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
      mode: dto.mode,
      temporarilyClosed: dto.temporarilyClosed,
      days: dto.days,
    });
    if (result.outcome === 'invalid') {
      throw new UnprocessableEntityException({
        error: { code: result.code, message: INVALID_MESSAGES[result.code] },
      });
    }
    return { data: result.data };
  }
}
