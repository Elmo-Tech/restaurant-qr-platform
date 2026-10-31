import {
  Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post,
  Req, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn } from 'class-validator';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import {
  RestaurantSetupService,
  type RestaurantSetupStatus,
} from './restaurant-setup.service';

class SetupVisibilityDto {
  @IsBoolean()
  hidden!: boolean;
}

const REVIEW_KEYS = ['LANGUAGES', 'ORDERING', 'OPERATIONS', 'PREVIEW', 'BRANDING_SKIP'] as const;
type ReviewKey = (typeof REVIEW_KEYS)[number];

class SetupReviewDto {
  @IsIn([...REVIEW_KEYS])
  step!: ReviewKey;
}

const ACCESS_ERROR = {
  error: { code: 'PERMISSION_DENIED', message: 'You do not have permission to perform this action.' },
};

/**
 * Restaurant-scoped setup. It never changes ordering, availability, QR, menu
 * or package state; explicit "review" stores only a signature of canonical
 * values the user just reviewed. Every endpoint uses CURRENT session,
 * Membership, role Permissions and Restaurant-wide Branch access.
 */
@Controller('restaurants/:restaurantId/setup')
export class RestaurantSetupController {
  constructor(private readonly setup: RestaurantSetupService) {}

  private assertMember(request: RestaurantAuthorizedRequest) {
    if (!['OWNER', 'MANAGER'].includes(request.restaurantAccess.role)) {
      throw new ForbiddenException(ACCESS_ERROR);
    }
  }

  private assertOwner(request: RestaurantAuthorizedRequest) {
    if (request.restaurantAccess.role !== 'OWNER') {
      throw new ForbiddenException(ACCESS_ERROR);
    }
  }

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async getStatus(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: RestaurantSetupStatus }> {
    this.assertMember(request);
    return { data: await this.setup.getStatus(request.restaurantAccess, request.auth.userId) };
  }

  /** Old restaurants opt in explicitly. New restaurants are enrolled by provisioning. */
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async enroll(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: RestaurantSetupStatus }> {
    this.assertOwner(request);
    await this.setup.enroll(request.restaurantAccess.restaurantId);
    return { data: await this.setup.getStatus(request.restaurantAccess, request.auth.userId) };
  }

  /** Per-user hide/show has no effect on readiness and cannot complete setup. */
  @Post('visibility')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async setVisibility(@Body() dto: SetupVisibilityDto, @Req() request: RestaurantAuthorizedRequest):
    Promise<{ data: RestaurantSetupStatus }> {
    this.assertMember(request);
    await this.setup.setHidden(request.restaurantAccess.restaurantId, request.auth.userId, dto.hidden);
    return { data: await this.setup.getStatus(request.restaurantAccess, request.auth.userId) };
  }

  /** An explicit acknowledgement, never inferred from default-true switches. */
  @Post('review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async review(@Body() dto: SetupReviewDto, @Req() request: RestaurantAuthorizedRequest):
    Promise<{ data: RestaurantSetupStatus }> {
    this.assertMember(request);
    await this.setup.review(request.restaurantAccess.restaurantId, dto.step);
    return { data: await this.setup.getStatus(request.restaurantAccess, request.auth.userId) };
  }

  /** Only OWNER can confirm readiness for the whole restaurant. */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async complete(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: RestaurantSetupStatus }> {
    this.assertOwner(request);
    await this.setup.complete(request.restaurantAccess, request.auth.userId);
    return { data: await this.setup.getStatus(request.restaurantAccess, request.auth.userId) };
  }
}
