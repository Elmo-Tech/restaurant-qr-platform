import {
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { PutRestaurantLocaleDto } from './dto/put-restaurant-locale.dto';
import { LocaleParamPipe } from './locale-param.pipe';
import type { PlatformSupportedLocale } from './platform-locales';
import {
  RestaurantLocalesService,
  type DefaultLocaleReadiness,
  type RestaurantLocalesView,
} from './restaurant-locales.service';

/**
 * LOC-2A, approved LOC-1 contract (Section 12): the Restaurant's current
 * default locale can never be disabled -- rejected before any write, same
 * `ConflictException(RESPONSE_CONST)` shape already established by
 * `TABLE_NUMBER_ALREADY_EXISTS_RESPONSE` (tables.controller.ts).
 */
const DEFAULT_LOCALE_REQUIRED_RESPONSE = {
  error: {
    code: 'DEFAULT_LOCALE_REQUIRED',
    message: 'The default locale cannot be disabled.',
  },
};

/** DEC-037: the chosen Default must be an enabled language of this Restaurant. */
const LOCALE_NOT_ACTIVE_RESPONSE = {
  error: {
    code: 'LOCALE_NOT_ACTIVE',
    message: 'Enable this language before making it the default.',
  },
};

interface RestaurantLocalesResponseBody {
  data: RestaurantLocalesView;
}

interface RestaurantLocaleResponseBody {
  data: { locale: string; isActive: boolean };
}

interface DefaultReadinessResponseBody {
  data: DefaultLocaleReadiness;
}

/**
 * LOC-2A, approved LOC-1 contract: Restaurant Language Settings.
 * `GET`/`PUT /api/v1/restaurants/{restaurantId}/locales[/:locale]`.
 *
 * Restaurant Language configuration is a Restaurant-wide setting (no Branch
 * dimension at all) -- no `BranchAccessGuard`/`BranchManagementAccessGuard`
 * on either route, mirroring Menu's own guard-chain precedent. `GET` carries
 * no `CsrfGuard` (read-only) and no `AllBranchesRequiredGuard` -- read
 * visibility is governed by `restaurant.view` alone. `PUT` is a
 * Restaurant-structural mutation: `restaurant.manage` alone is not
 * sufficient authority -- a Branch-scoped Membership (`allBranches = false`)
 * must never gain Restaurant-wide Language mutation authority merely
 * because its Role holds `restaurant.manage` (mirrors Menu Create's exact
 * settled contract).
 *
 * All authorization fields come only from `request.restaurantAccess`,
 * produced by `RestaurantAccessGuard`'s own current database lookup this
 * request -- the raw `:restaurantId` route param is never forwarded to the
 * Service as authority.
 */
@Controller('restaurants/:restaurantId/locales')
export class RestaurantsController {
  constructor(
    private readonly restaurantLocalesService: RestaurantLocalesService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async listLocales(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantLocalesResponseBody> {
    const data = await this.restaurantLocalesService.listLocales({
      restaurantId: request.restaurantAccess.restaurantId,
    });

    return { data };
  }

  /**
   * DEC-037: how complete a language's content is for becoming the Default.
   * Declared before `PUT :locale`-style routes only for readability; the
   * paths are distinct.
   */
  @Get(':locale/default-readiness')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_VIEW)
  async defaultReadiness(
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<DefaultReadinessResponseBody> {
    const result = await this.restaurantLocalesService.getDefaultLocaleReadiness(
      { restaurantId: request.restaurantAccess.restaurantId },
      locale,
    );
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * DEC-037: make an enabled language the Restaurant's Default Locale.
   * `restaurant.manage` with Restaurant-wide Branch scope, like every other
   * Restaurant-structural language mutation.
   */
  @Post(':locale/default')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async setDefaultLocale(
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantLocalesResponseBody> {
    const result = await this.restaurantLocalesService.setDefaultLocale(
      { restaurantId: request.restaurantAccess.restaurantId },
      locale,
    );
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'incomplete') {
      throw new ConflictException({
        error: {
          code: 'DEFAULT_LOCALE_INCOMPLETE',
          message:
            'Add a name in this language to every item before making it the default.',
          missing: result.data.missing,
          totalMissing: result.data.totalMissing,
        },
      });
    }
    return { data: result.data };
  }

  @Put(':locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async setLocaleState(
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutRestaurantLocaleDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantLocaleResponseBody> {
    const result = await this.restaurantLocalesService.setLocaleState({
      restaurantId: request.restaurantAccess.restaurantId,
      locale,
      isActive: dto.isActive,
    });

    if (result.outcome === 'defaultLocaleRequired') {
      throw new ConflictException(DEFAULT_LOCALE_REQUIRED_RESPONSE);
    }

    return { data: result.data };
  }
}
