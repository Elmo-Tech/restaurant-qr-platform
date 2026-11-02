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
import { LocaleParamPipe } from '../restaurants/locale-param.pipe';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';
import { CreateMenuDto } from './dto/create-menu.dto';
import { StartFreshMenuDto } from './dto/start-fresh-menu.dto';
import { PutTranslationDto } from './dto/put-translation.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import type { TranslationView } from './menu-translation.helper';
import { MenusService } from './menus.service';
import type { MenuWithTranslation } from './menus.service';

/**
 * Day 1 Menu Vertical Slice, Batch F, settled contract: one stable
 * existence-hiding error for a malformed, unknown, or foreign-Restaurant
 * `menuId` on Menu Update/Set-Primary -- never a distinguishable
 * `MENU_ACCESS_DENIED`/`MENU_WRONG_RESTAURANT`/`INVALID_MENU_ID` (mirrors
 * the existing `CATEGORY_NOT_FOUND`/`PRODUCT_NOT_FOUND` convention).
 */
const MENU_NOT_FOUND_RESPONSE = {
  error: {
    code: 'MENU_NOT_FOUND',
    message: 'Menu not found.',
  },
};

interface MenuListResponseBody {
  data: MenuWithTranslation[];
}

interface CreateMenuResponseBody {
  data: MenuWithTranslation;
}

interface MenuTranslationListResponseBody {
  data: TranslationView[];
}

interface MenuTranslationResponseBody {
  data: TranslationView;
}

/**
 * Day 1 Menu Vertical Slice, Batch C (corrected): Menu List and Create.
 * `GET`/`POST /api/v1/restaurants/{restaurantId}/menus`.
 *
 * Menu is a Restaurant-wide configuration resource (no Branch dimension in
 * the schema at all) -- no `BranchAccessGuard`/`BranchManagementAccessGuard`
 * on either route, mirroring the Membership List/Invitation Create
 * precedent. `GET` carries no `CsrfGuard` (read-only) and no
 * `AllBranchesRequiredGuard` -- read visibility is governed by `menu.view`
 * alone, exactly like Membership List.
 *
 * Create is a Restaurant-structural mutation (AUTH_TENANCY_SPEC.md #63):
 * `menu.manage` alone is not sufficient authority -- a Branch-scoped
 * Membership (`allBranches = false`) must never gain Restaurant-wide Menu
 * mutation authority merely because its Role holds `menu.manage`, mirroring
 * Create Branch's exact settled contract (API_CONVENTIONS.md #113A). This
 * reuses the existing `AllBranchesRequiredGuard` unchanged -- no new guard,
 * no new error code.
 *
 * All authorization fields come only from `request.restaurantAccess`,
 * produced by `RestaurantAccessGuard`'s own current database lookup this
 * request -- never re-read from the raw route param, body, query, or
 * headers here.
 */
@Controller('restaurants/:restaurantId/menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listMenus(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<MenuListResponseBody> {
    const data = await this.menusService.listMenus({
      restaurantId: request.restaurantAccess.restaurantId,
    });

    return { data };
  }

  /**
   * `nameInternal`/`status`/`displayOrder` persist onto `Menu` directly.
   * `name`/`description` are the default-locale `MenuTranslation` content --
   * the client never selects a locale (settled contract #5); the service
   * reads `Restaurant.defaultLocale` server-side. `isPrimary` is entirely
   * server-controlled (settled contract #7), never a request field.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async createMenu(
    @Body() dto: CreateMenuDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateMenuResponseBody> {
    const data = await this.menusService.createMenu({
      restaurantId: request.restaurantAccess.restaurantId,
      nameInternal: dto.nameInternal,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status,
      displayOrder: dto.displayOrder,
    });

    return { data };
  }

  /**
   * Intentionally non-destructive: replaces a loaded active primary Menu
   * with a clean one and preserves the old Menu and historical Order refs.
   * Only Restaurant-wide menu.manage can start fresh (same guards as Create).
   */
  @Post('start-fresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async startFreshMenu(
    @Body() dto: StartFreshMenuDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { menuId: string; changed: boolean } }> {
    const result = await this.menusService.startFreshMenu({
      restaurantId: request.restaurantAccess.restaurantId,
      expectedPrimaryMenuId: dto.expectedPrimaryMenuId,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'menuChanged') {
      throw new ConflictException({
        error: {
          code: 'MENU_PRIMARY_CHANGED',
          message: 'The primary menu changed. Reload before starting fresh.',
        },
      });
    }
    if (result.outcome === 'activeImport') {
      throw new ConflictException({
        error: {
          code: 'MENU_IMPORT_PENDING',
          message: 'Finish or discard the pending menu import first.',
        },
      });
    }
    return {
      data: { menuId: result.menuId, changed: result.outcome === 'started' },
    };
  }

  /**
   * Partial Menu configuration update. `isPrimary` is deliberately not
   * writable here -- it has its own dedicated Set-Primary endpoint, below.
   * `menuId` identity/ownership resolution happens entirely inside
   * `MenusService` (malformed/unknown/foreign all converge on the identical
   * `MENU_NOT_FOUND`), only after this guard chain has already succeeded.
   */
  @Patch(':menuId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateMenu(
    @Param('menuId') menuId: string,
    @Body() dto: UpdateMenuDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateMenuResponseBody> {
    const result = await this.menusService.updateMenu({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId,
      nameInternal: dto.nameInternal,
      name: dto.name,
      description: dto.description,
      status: dto.status,
      displayOrder: dto.displayOrder,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Focused Set-Primary operation (settled contract #12/#13). No
   * client-controlled `isPrimary` field, and no meaningful request body at
   * all -- the Backend alone performs the primary switch. If the target is
   * already primary, this succeeds idempotently with no write. Otherwise
   * the Restaurant's current primary Menu (if any) is unset and the target
   * is set, inside one transaction -- the database's
   * `menus_one_primary_menu` partial unique index remains the final
   * concurrency authority unchanged.
   */
  @Patch(':menuId/primary')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async setPrimaryMenu(
    @Param('menuId') menuId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateMenuResponseBody> {
    const result = await this.menusService.setPrimaryMenu({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 3-5): returns every existing `MenuTranslation` row for
   * this Menu, raw -- no fallback, no synthesized locales, no internal ids.
   * Read-only: `menu.view`, no `CsrfGuard`/`AllBranchesRequiredGuard`,
   * identical guard chain to `listMenus`.
   */
  @Get(':menuId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getMenuTranslations(
    @Param('menuId') menuId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<MenuTranslationListResponseBody> {
    const result = await this.menusService.getMenuTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 6-11): full replacement of one Translation resource.
   * `:locale` is Pipe-validated against the Platform allowlist before this
   * handler body ever runs. Restaurant-structural mutation: `menu.manage`
   * + `AllBranchesRequiredGuard`, identical guard chain to every other Menu
   * mutation.
   */
  @Put(':menuId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putMenuTranslation(
    @Param('menuId') menuId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<MenuTranslationResponseBody> {
    const result = await this.menusService.putMenuTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId,
      locale,
      name: dto.name,
      description: dto.description ?? null,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 12-14): deletes one Translation resource. The default
   * locale can never be deleted; a non-default locale must be currently
   * active; a missing secondary Translation is a safe 204 no-op. Identical
   * guard chain to Put.
   */
  @Delete(':menuId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteMenuTranslation(
    @Param('menuId') menuId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.menusService.deleteMenuTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId,
      locale,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
