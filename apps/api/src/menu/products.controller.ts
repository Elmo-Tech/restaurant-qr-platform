import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { assertValidImageUpload } from '../storage/image-file-validator';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
} from '../storage/image-storage.service';
import type { UploadedImageFile } from '../storage/uploaded-image-file';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { PutTranslationDto } from './dto/put-translation.dto';
import { ReorderProductsDto } from './dto/reorder-products.dto';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import type { TranslationView } from './menu-translation.helper';
import { ProductsService } from './products.service';
import type {
  ProductDiscountErrorCode,
  ProductWithTranslation,
} from './products.service';
import type { ProductAvailability } from '../generated/prisma/client';

const DISCOUNT_ERROR_MESSAGES: Record<ProductDiscountErrorCode, string> = {
  DISCOUNT_VALUE_INVALID:
    'A percentage discount must be above 0% and at most 100%, and a fixed discount must be above zero.',
  DISCOUNT_EXCEEDS_PRICE: 'A fixed discount cannot be larger than the product price.',
  DISCOUNT_DATES_INVALID: 'The discount end date cannot be before its start date.',
};

/** Product Discounts V1: stable, machine-readable validation errors for an invalid discount. */
function discountErrorResponse(code: ProductDiscountErrorCode) {
  return { error: { code, message: DISCOUNT_ERROR_MESSAGES[code] } };
}

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
/** The submitted order is not exactly the Category's current Products: reload and retry. */
const ORDER_MISMATCH_RESPONSE = {
  error: {
    code: 'ORDER_MISMATCH',
    message: 'The list changed. Reload and try again.',
  },
};

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

interface ProductTranslationListResponseBody {
  data: TranslationView[];
}

interface ProductTranslationResponseBody {
  data: TranslationView;
}

interface ProductImageResponseBody {
  data: { primaryImageAssetPath: string };
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
  constructor(
    private readonly productsService: ProductsService,
    private readonly imageStorageService: ImageStorageService,
  ) {}

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
      discount: dto.discount,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidDiscount') {
      throw new BadRequestException(discountErrorResponse(result.code));
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
      discount: dto.discount,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidDiscount') {
      throw new BadRequestException(discountErrorResponse(result.code));
    }

    return { data: result.data };
  }

  /**
   * Changes ONLY `Product.availability`. No `PRODUCT_UNAVAILABLE` error is
   * used here -- that is a future Guest/Order business-behavior concern, not
   * this Staff configuration endpoint.
   */
  @Put('order')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async reorderProducts(
    @Body() dto: ReorderProductsDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { productIds: string[] } }> {
    const result = await this.productsService.reorderProducts({
      restaurantId: request.restaurantAccess.restaurantId,
      categoryId: dto.categoryId,
      productIds: dto.productIds,
    });

    if (result.outcome === 'categoryNotFound') {
      throw new NotFoundException(CATEGORY_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'orderMismatch') {
      throw new ConflictException(ORDER_MISMATCH_RESPONSE);
    }

    return { data: result.data };
  }

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

  /**
   * FT-2: uploads (or replaces) the Product's one primary image. The
   * Product's Tenant-scoped existence is checked BEFORE anything is written
   * to disk (FT-2 code review blocker) -- a foreign or unknown Product never
   * causes a file to be saved. `setProductImage` repeats an identical scoped
   * check for write-time race safety, and on that unlikely race the
   * just-saved file is still removed so it never becomes an orphan (Section
   * 10). A pre-existing image is only removed AFTER the DB write actually
   * succeeds, and that removal is best-effort -- a stale local file left
   * behind on cleanup failure must never roll back an already-successful
   * image change.
   */
  @Post(':productId/image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  async uploadProductImage(
    @Param('productId') productId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductImageResponseBody> {
    assertValidImageUpload(file);

    const productExists = await this.productsService.productExists({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
    });
    if (!productExists) {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }

    const saved = await this.imageStorageService.saveImage(
      file.buffer,
      file.mimetype,
    );

    let result;
    try {
      result = await this.productsService.setProductImage({
        restaurantId: request.restaurantAccess.restaurantId,
        productId,
        imageAssetPath: saved.assetPath,
      });
    } catch (error) {
      await this.imageStorageService.deleteImageBestEffort(saved.assetPath);
      throw error;
    }

    if (result.outcome === 'productNotFound') {
      await this.imageStorageService.deleteImageBestEffort(saved.assetPath);
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }

    await this.imageStorageService.deleteImageBestEffort(
      result.previousImageAssetPath,
    );

    return {
      data: { primaryImageAssetPath: result.data.primaryImageAssetPath },
    };
  }

  /**
   * FT-2: clears the Product's primary image. Idempotent -- calling this
   * when no image is set succeeds without error. The local file (if any) is
   * removed best-effort only after the DB is already cleared (Section 10).
   */
  @Delete(':productId/image')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async removeProductImage(
    @Param('productId') productId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.productsService.clearProductImage({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }

    await this.imageStorageService.deleteImageBestEffort(
      result.previousImageAssetPath,
    );
  }

  /**
   * LOC-2B (Section 3-5): returns every existing `ProductTranslation` row
   * for this Product, raw -- see `MenusController.getMenuTranslations`'s
   * docstring for the full rationale (identical shape/behavior).
   */
  @Get(':productId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getProductTranslations(
    @Param('productId') productId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductTranslationListResponseBody> {
    const result = await this.productsService.getProductTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * LOC-2B (Section 6-11): full replacement of one Translation resource --
   * see `MenusController.putMenuTranslation`'s docstring for the full
   * rationale (identical shape/behavior).
   */
  @Put(':productId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putProductTranslation(
    @Param('productId') productId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ProductTranslationResponseBody> {
    const result = await this.productsService.putProductTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      locale,
      name: dto.name,
      description: dto.description ?? null,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
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
  @Delete(':productId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteProductTranslation(
    @Param('productId') productId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.productsService.deleteProductTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      locale,
    });

    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
