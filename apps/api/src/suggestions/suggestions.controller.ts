import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsUUID } from 'class-validator';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { MAX_RULES_PER_PRODUCT } from './suggestion-rules';
import {
  SuggestionsService,
  type SuggestionsSettings,
} from './suggestions.service';

export const SUGGESTION_MODES = ['OFF', 'MANUAL', 'AUTO', 'BOTH'] as const;

class UpdateSuggestionsModeDto {
  @IsIn(SUGGESTION_MODES, {
    message: `mode must be one of: ${SUGGESTION_MODES.join(', ')}`,
  })
  mode!: (typeof SUGGESTION_MODES)[number];
}

class ReplaceProductRulesDto {
  @IsArray()
  @ArrayMaxSize(MAX_RULES_PER_PRODUCT)
  @IsUUID('all', { each: true })
  productIds!: string[];
}

const PRODUCT_NOT_FOUND = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
};

/**
 * Smart suggestions, Staff side (DEC-042). Restaurant-wide configuration: reading needs the view
 * permission; every change needs the manage permission with Restaurant-wide Branch scope, like
 * the other Restaurant-structural settings.
 */
@Controller('restaurants/:restaurantId')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get('suggestions')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async settings(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: SuggestionsSettings }> {
    return {
      data: await this.suggestions.getSettings(
        request.restaurantAccess.restaurantId,
      ),
    };
  }

  @Patch('suggestions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async setMode(
    @Body() dto: UpdateSuggestionsModeDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: SuggestionsSettings }> {
    try {
      return {
        data: await this.suggestions.setMode(
          request.restaurantAccess.restaurantId,
          dto.mode,
        ),
      };
    } catch (error) {
      if (error instanceof FeatureNotAvailableError) throw featureNotAvailableException(error);
      throw error;
    }
  }

  @Get('products/:productId/suggestions')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async rules(
    @Param('productId') productId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { productIds: string[] } }> {
    const result = await this.suggestions.getProductRules(
      request.restaurantAccess.restaurantId,
      productId,
    );
    if (result.outcome !== 'ok') throw new NotFoundException(PRODUCT_NOT_FOUND);
    return { data: { productIds: result.productIds } };
  }

  @Put('products/:productId/suggestions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async replaceRules(
    @Param('productId') productId: string,
    @Body() dto: ReplaceProductRulesDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { productIds: string[] } }> {
    const result = await this.suggestions.replaceProductRules(
      request.restaurantAccess.restaurantId,
      productId,
      dto.productIds,
    );
    if (result.outcome === 'notFound')
      throw new NotFoundException(PRODUCT_NOT_FOUND);
    if (result.outcome === 'invalid') {
      throw new UnprocessableEntityException({
        error: {
          code: 'SUGGESTION_INVALID',
          message: `A product can suggest up to ${MAX_RULES_PER_PRODUCT} other products of this restaurant, each once.`,
        },
      });
    }
    return { data: { productIds: result.productIds } };
  }
}
