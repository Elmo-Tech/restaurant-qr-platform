import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateMenuDto } from './dto/create-menu.dto';
import { MenusService } from './menus.service';
import type { MenuWithTranslation } from './menus.service';

interface MenuListResponseBody {
  data: MenuWithTranslation[];
}

interface CreateMenuResponseBody {
  data: MenuWithTranslation;
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
}
