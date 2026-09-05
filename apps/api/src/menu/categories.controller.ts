import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
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
import { CategoriesService } from './categories.service';
import type { CategoryWithTranslation } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

/**
 * Day 1 Menu Vertical Slice, Batch C, settled contract: one stable
 * existence-hiding error for an unknown or foreign-Restaurant `menuId` on
 * Category creation -- never distinguishes "does not exist" from "belongs
 * to another Restaurant" (mirrors the existing `BRANCH_NOT_FOUND`
 * convention).
 */
const MENU_NOT_FOUND_RESPONSE = {
  error: {
    code: 'MENU_NOT_FOUND',
    message: 'Menu not found.',
  },
};

interface CategoryListResponseBody {
  data: CategoryWithTranslation[];
}

interface CreateCategoryResponseBody {
  data: CategoryWithTranslation;
}

/**
 * Day 1 Menu Vertical Slice, Batch C (corrected): Category List and Create.
 * `GET`/`POST /api/v1/restaurants/{restaurantId}/categories`.
 *
 * Category is a Restaurant-wide configuration resource -- no
 * `BranchAccessGuard`/`BranchManagementAccessGuard` of any kind, mirroring
 * `MenusController`. `GET` carries no `CsrfGuard` and no
 * `AllBranchesRequiredGuard` -- read visibility is governed by `menu.view`
 * alone. Create is a Restaurant-structural mutation
 * (AUTH_TENANCY_SPEC.md #63): a Branch-scoped Membership must never gain
 * Restaurant-wide Category mutation authority merely because its Role holds
 * `menu.manage` -- reuses the existing `AllBranchesRequiredGuard` unchanged,
 * exactly mirroring `MenusController.createMenu`.
 */
@Controller('restaurants/:restaurantId/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listCategories(
    @Query() query: ListCategoriesQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CategoryListResponseBody> {
    const data = await this.categoriesService.listCategories({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId: query.menuId,
    });

    return { data };
  }

  /**
   * `menuId` is client-selected resource identity, NOT tenant authority
   * (settled contract #4) -- the service resolves it with both `id = menuId`
   * AND `restaurantId = authorizedRestaurantId`. `name`/`description` are
   * the default-locale `CategoryTranslation` content; the client never
   * selects a locale. `imageAssetPath` is never client-writable in Batch C
   * and is always persisted as `null`.
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
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateCategoryResponseBody> {
    const result = await this.categoriesService.createCategory({
      restaurantId: request.restaurantAccess.restaurantId,
      menuId: dto.menuId,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status,
      displayOrder: dto.displayOrder,
    });

    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }
}
