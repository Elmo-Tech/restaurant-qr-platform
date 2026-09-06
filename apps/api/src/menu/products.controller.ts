import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
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
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import type { ProductWithTranslation } from './products.service';
import type { ProductAvailability } from '../generated/prisma/client';

/**
 * Day 1 Menu Vertical Slice, Batch D, settled contract: one stable
 * existence-hiding error for an unknown or foreign-Restaurant `categoryId`
 * on Product Create/Update -- never distinguishes "does not exist" from
 * "belongs to another Restaurant" (mirrors the existing `MENU_NOT_FOUND`/
 * `BRANCH_NOT_FOUND` convention).
 */
const CATEGORY_NOT_FOUND_RESPONSE = {
  error: {
    code: 'CATEGORY_NOT_FOUND',
    message: 'Category not found.',
  },
};

/**
 * Day 1 Menu Vertical Slice, Batch D, settled contract: one stable
 * existence-hiding error for a malformed, unknown, or foreign-Restaurant
 * `productId` -- never a distinguishable `PRODUCT_ACCESS_DENIED`/
 * `PRODUCT_WRONG_RESTAURANT`/`INVALID_PRODUCT_ID`.
 */
const PRODUCT_NOT_FOUND_RESPONSE = {
  error: {
    code: 'PRODUCT_NOT_FOUND',
    message: 'Product not found.',
  },
};

interface ProductListResponseBody {
  data: ProductWithTranslation[];
}

interface ProductResponseBody {
  data: ProductWithTranslation;
}

interface ProductAvailabilityResponseBody {
  data: { id: string; availability: ProductAvailability };
}

/**
 * Day 1 Menu Vertical Slice, Batch D: Product List, Create, generic Update,
 * and the focused Availability Update.
 * `GET`/`POST /api/v1/restaurants/{restaurantId}/products`,
 * `PATCH /api/v1/restaurants/{restaurantId}/products/{productId}`,
 * `PATCH /api/v1/restaurants/{restaurantId}/products/{productId}/availability`.
 *
 * Product is a Restaurant-wide configuration resource (no `branchId`
 * anywhere in the schema) -- no `BranchAccessGuard`/
 * `BranchManagementAccessGuard` on any route, mirroring
 * `MenusController`/`CategoriesController`. `GET` carries no `CsrfGuard`
 * and no `AllBranchesRequiredGuard` -- read visibility is governed by
 * `menu.view` alone. Every mutation is a Restaurant-structural mutation
 * (AUTH_TENANCY_SPEC.md #63/#65N): `menu.manage` alone is not sufficient
 * authority -- a Branch-scoped Membership must never gain Restaurant-wide
 * Product mutation authority merely because its Role holds `menu.manage`,
 * reusing the existing `AllBranchesRequiredGuard` unchanged.
 */
@Controller('restaurants/:restaurantId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listProducts(
    @Query() query: ListProductsQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductListResponseBody> {
    const data = await this.productsService.listProducts({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId: query.categoryId,
    });

    return { data };
  }

  /**
   * `categoryId` is client-selected resource identity, NOT tenant authority
   * -- the service resolves it with both `id = categoryId` AND
   * `restaurantId = authorizedRestaurantId`. `name`/`description` are the
   * default-locale `ProductTranslation` content; the client never selects a
   * locale. `primaryImageAssetPath` is never client-writable and is always
   * persisted as `null`. `status`/`availability` are independent fields,
   * never derived from one another.
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
  async createProduct(
    @Body() dto: CreateProductDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductResponseBody> {
    const result = await this.productsService.createProduct({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status,
      availability: dto.availability,
      basePrice: dto.basePrice,
      displayOrder: dto.displayOrder,
      allowCustomerNotes: dto.allowCustomerNotes,
      featured: dto.featured,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Partial Product configuration update. `availability` is deliberately
   * not writable here -- it has its own dedicated endpoint, below.
   * `productId` identity/ownership resolution happens entirely inside
   * `ProductsService` (malformed/unknown/foreign all converge on the
   * identical `PRODUCT_NOT_FOUND`), only after this guard chain has already
   * succeeded.
   */
  @Patch(':productId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductResponseBody> {
    const result = await this.productsService.updateProduct({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      status: dto.status,
      basePrice: dto.basePrice,
      displayOrder: dto.displayOrder,
      allowCustomerNotes: dto.allowCustomerNotes,
      featured: dto.featured,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Changes ONLY `Product.availability`. No `PRODUCT_UNAVAILABLE` error is
   * used here -- that is a future Guest/Order business-behavior concern, not
   * this Staff configuration endpoint.
   */
  @Patch(':productId/availability')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateProductAvailability(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductAvailabilityDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductAvailabilityResponseBody> {
    const result = await this.productsService.updateAvailability({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      availability: dto.availability,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }
}
