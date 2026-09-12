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
import { LocaleParamPipe } from '../restaurants/locale-param.pipe';
import type { PlatformSupportedLocale } from '../restaurants/platform-locales';
import { CategoriesService } from './categories.service';
import type { CategoryWithTranslation } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { PutTranslationDto } from './dto/put-translation.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import type { TranslationView } from './menu-translation.helper';

/**
 * Day 1 Menu Vertical Slice, Batch C, settled contract: one stable
 * existence-hiding error for an unknown or foreign-Restaurant `menuId` on
 * Category creation/update (Batch F: also the Category-move target Menu) --
 * never distinguishes "does not exist" from "belongs to another
 * Restaurant" (mirrors the existing `BRANCH_NOT_FOUND` convention).
 */
const MENU_NOT_FOUND_RESPONSE = {
  error: {
    code: 'MENU_NOT_FOUND',
    message: 'Menu not found.',
  },
};

/**
 * Day 1 Menu Vertical Slice, Batch F, settled contract: one stable
 * existence-hiding error for a malformed, unknown, or foreign-Restaurant
 * `categoryId` on Category Update -- never a distinguishable
 * `CATEGORY_ACCESS_DENIED`/`CATEGORY_WRONG_RESTAURANT`/`INVALID_CATEGORY_ID`
 * (mirrors the existing `PRODUCT_NOT_FOUND` convention).
 */
const CATEGORY_NOT_FOUND_RESPONSE = {
  error: {
    code: 'CATEGORY_NOT_FOUND',
    message: 'Category not found.',
  },
};

interface CategoryListResponseBody {
  data: CategoryWithTranslation[];
}

interface CreateCategoryResponseBody {
  data: CategoryWithTranslation;
}

interface CategoryTranslationListResponseBody {
  data: TranslationView[];
}

interface CategoryTranslationResponseBody {
  data: TranslationView;
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

  /**
   * Partial Category configuration update, including moving a Category to
   * another same-Restaurant Menu (`menuId`, settled contract #9).
   * `categoryId` identity/ownership resolution happens entirely inside
   * `CategoriesService` (malformed/unknown/foreign all converge on the
   * identical `CATEGORY_NOT_FOUND`); a supplied `menuId` target is
   * re-resolved the same Tenant-scoped way as Create, and an unknown/
   * foreign target Menu leaves the Category entirely unchanged.
   */
  @Patch(':categoryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateCategoryResponseBody> {
    const result = await this.categoriesService.updateCategory({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId,
      menuId: dto.menuId,
      name: dto.name,
      description: dto.description,
      status: dto.status,
      displayOrder: dto.displayOrder,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'menuNotFound') {
      throw new NotFoundException(MENU_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 3-5): returns every existing `CategoryTranslation` row
   * for this Category, raw -- see `MenusController.getMenuTranslations`'s
   * docstring for the full rationale (identical shape/behavior).
   */
  @Get(':categoryId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getCategoryTranslations(
    @Param('categoryId') categoryId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CategoryTranslationListResponseBody> {
    const result = await this.categoriesService.getCategoryTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 6-11): full replacement of one Translation resource --
   * see `MenusController.putMenuTranslation`'s docstring for the full
   * rationale (identical shape/behavior).
   */
  @Put(':categoryId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putCategoryTranslation(
    @Param('categoryId') categoryId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CategoryTranslationResponseBody> {
    const result = await this.categoriesService.putCategoryTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId,
      locale,
      name: dto.name,
      description: dto.description ?? null,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 12-14): deletes one Translation resource -- see
   * `MenusController.deleteMenuTranslation`'s docstring for the full
   * rationale (identical shape/behavior).
   */
  @Delete(':categoryId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteCategoryTranslation(
    @Param('categoryId') categoryId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.categoriesService.deleteCategoryTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId,
      locale,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
