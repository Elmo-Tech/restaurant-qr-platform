import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { PromotionContextualPreviewService } from './promotion-contextual-preview.service';
import {
  CONTEXTUAL_PREVIEW_CONTRACT,
  PromotionPreviewDto,
} from './promotion-preview.dto';
import { PromotionPreviewService } from './promotion-preview.service';
import { PromotionTargetsService } from './promotion-targets.service';
import {
  ListPromotionsQueryDto,
  PromotionActionDto,
  PromotionDraftDto,
  UpdatePromotionDto,
} from './promotion.dto';
import { PromotionsFeatureGuard } from './promotions-feature.guard';
import { PromotionsService } from './promotions.service';

const READ = [
  AuthGuard,
  RestaurantAccessGuard,
  PermissionGuard,
  PromotionsFeatureGuard,
] as const;
const WRITE = [
  AuthGuard,
  CsrfGuard,
  RestaurantAccessGuard,
  PermissionGuard,
  AllBranchesRequiredGuard,
  PromotionsFeatureGuard,
] as const;

function writeScope(request: RestaurantAuthorizedRequest) {
  return {
    restaurantId: request.restaurantAccess.restaurantId,
    userId: request.auth.userId,
  };
}

@Controller('restaurants/:restaurantId/promotions')
export class PromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly targets: PromotionTargetsService,
    private readonly previewService: PromotionPreviewService,
    private readonly contextualPreview: PromotionContextualPreviewService,
  ) {}

  @Get()
  @UseGuards(...READ)
  @RequirePermission(PERMISSIONS.PROMOTIONS_VIEW)
  list(
    @Req() request: RestaurantAuthorizedRequest,
    @Query() query: ListPromotionsQueryDto,
  ) {
    return this.promotions.list(request.restaurantAccess.restaurantId, query);
  }

  @Get('targets')
  @UseGuards(...READ)
  @RequirePermission(PERMISSIONS.PROMOTIONS_VIEW)
  async listTargets(@Req() request: RestaurantAuthorizedRequest) {
    return { data: await this.targets.list(request.restaurantAccess) };
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    PromotionsFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.PROMOTIONS_VIEW)
  async preview(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: PromotionPreviewDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { restaurantId, membershipId, allBranches } =
      request.restaurantAccess;
    // DEC-077 B3: the opt-in contract. A request without `contract` takes the unchanged path below.
    if (dto.contract === CONTEXTUAL_PREVIEW_CONTRACT) {
      // The answer is bound to one draft and one instant; it must never be reused.
      response.setHeader('Cache-Control', 'no-store');
      const requestId =
        dto.requestId ??
        String(response.getHeader('X-Request-Id') ?? randomUUID());
      return {
        data: await this.contextualPreview.preview(
          { restaurantId, membershipId, allBranches },
          dto,
          requestId,
        ),
      };
    }
    return {
      data: await this.previewService.preview(
        { restaurantId, membershipId, allBranches },
        dto,
      ),
    };
  }

  @Post()
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async create(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: PromotionDraftDto,
  ) {
    return { data: await this.promotions.create(writeScope(request), dto) };
  }

  @Get(':promotionId')
  @UseGuards(...READ)
  @RequirePermission(PERMISSIONS.PROMOTIONS_VIEW)
  async get(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
  ) {
    return {
      data: await this.promotions.get(
        request.restaurantAccess.restaurantId,
        promotionId,
      ),
    };
  }

  @Patch(':promotionId')
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async update(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return {
      data: await this.promotions.update(writeScope(request), promotionId, dto),
    };
  }

  @Post(':promotionId/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async activate(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
    @Body() dto: PromotionActionDto,
  ) {
    return {
      data: await this.promotions.setStatus(
        writeScope(request),
        promotionId,
        'ACTIVE',
        dto?.expectedUpdatedAt,
      ),
    };
  }

  @Post(':promotionId/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async deactivate(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
    @Body() dto: PromotionActionDto,
  ) {
    return {
      data: await this.promotions.setStatus(
        writeScope(request),
        promotionId,
        'INACTIVE',
        dto?.expectedUpdatedAt,
      ),
    };
  }

  @Post(':promotionId/archive')
  @HttpCode(HttpStatus.OK)
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async archive(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
    @Body() dto: PromotionActionDto,
  ) {
    return {
      data: await this.promotions.setStatus(
        writeScope(request),
        promotionId,
        'ARCHIVED',
        dto?.expectedUpdatedAt,
      ),
    };
  }

  @Delete(':promotionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(...WRITE)
  @RequirePermission(PERMISSIONS.PROMOTIONS_MANAGE)
  async remove(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('promotionId') promotionId: string,
  ): Promise<void> {
    await this.promotions.remove(
      request.restaurantAccess.restaurantId,
      promotionId,
    );
  }
}
