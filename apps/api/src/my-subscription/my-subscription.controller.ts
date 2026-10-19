import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { SubscriptionRequestDto } from './dto/subscription-request.dto';
import {
  MySubscriptionService,
  type MySubscriptionView,
  type OpenRequestView,
} from './my-subscription.service';

/**
 * "My subscription" (DEC-050): `/restaurants/{restaurantId}/subscription`. It shows what a Restaurant pays,
 * so both routes need `restaurant.manage` (the Restaurant owner and managers); sending a request also
 * needs Restaurant-wide Branch scope and CSRF. The Restaurant always comes from the authorized request.
 */
@Controller('restaurants/:restaurantId/subscription')
export class MySubscriptionController {
  constructor(private readonly subscription: MySubscriptionService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async get(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: MySubscriptionView }> {
    const view = await this.subscription.view(
      request.restaurantAccess.restaurantId,
    );
    if (!view) throw notFound();
    return { data: view };
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async createRequest(
    @Body() dto: SubscriptionRequestDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: OpenRequestView }> {
    const result = await this.subscription.createRequest(
      request.restaurantAccess.restaurantId,
      request.auth.userId,
      {
        kind: dto.kind,
        packageId: dto.packageId ?? null,
        message: dto.message ?? null,
      },
    );
    switch (result.outcome) {
      case 'ok':
        return { data: result.data };
      case 'RESTAURANT_NOT_FOUND':
        throw notFound();
      case 'REQUEST_ALREADY_OPEN':
        throw new ConflictException({
          error: {
            code: 'SUBSCRIPTION_REQUEST_ALREADY_OPEN',
            message:
              'A request is already open; the team will get back to you.',
          },
        });
      case 'PACKAGE_REQUIRED':
        throw new UnprocessableEntityException({
          error: {
            code: 'SUBSCRIPTION_REQUEST_PACKAGE_REQUIRED',
            message: 'An upgrade request needs a package.',
          },
        });
      case 'PACKAGE_NOT_AVAILABLE':
        throw new UnprocessableEntityException({
          error: {
            code: 'SUBSCRIPTION_REQUEST_PACKAGE_NOT_AVAILABLE',
            message: 'This package is not available.',
          },
        });
    }
  }
}

const notFound = () =>
  new NotFoundException({
    error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' },
  });
