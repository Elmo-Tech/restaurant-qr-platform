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
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { PutProductVariantTranslationDto } from './dto/put-product-variant-translation.dto';
import { ReorderProductVariantsDto } from './dto/reorder-product-variants.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import { ProductVariantsService } from './product-variants.service';
import type {
  ProductVariantTranslationView,
  ProductVariantView,
} from './product-variants.service';

const PRODUCT_NOT_FOUND_RESPONSE = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
};
const VARIANT_NOT_FOUND_RESPONSE = {
  error: { code: 'VARIANT_NOT_FOUND', message: 'Product variant not found.' },
};
const VARIANT_DEFAULT_MUST_BE_ACTIVE_RESPONSE = {
  error: {
    code: 'VARIANT_DEFAULT_MUST_BE_ACTIVE',
    message: 'Only an active variant can be the default.',
  },
};
const VARIANT_DEFAULT_CONFLICT_RESPONSE = {
  error: {
    code: 'VARIANT_DEFAULT_CONFLICT',
    message:
      'The default variant changed at the same time. Reload and try again.',
  },
};
const HAS_HISTORICAL_REFERENCES_RESPONSE = {
  error: {
    code: 'VARIANT_HAS_HISTORICAL_REFERENCES',
    message:
      'This variant has already been used in an Order and cannot be deleted. Deactivate it instead.',
  },
};
const ORDER_MISMATCH_RESPONSE = {
  error: {
    code: 'ORDER_MISMATCH',
    message: 'The list changed. Reload and try again.',
  },
};

interface VariantListResponseBody {
  data: ProductVariantView[];
}
interface VariantResponseBody {
  data: ProductVariantView;
}
interface VariantTranslationListResponseBody {
  data: ProductVariantTranslationView[];
}
interface VariantTranslationResponseBody {
  data: ProductVariantTranslationView;
}

/**
 * Product Variants V1 (DEC-041): Staff configuration of a Product's sizes,
 * nested under the Product exactly like Modifier Groups. Restaurant-wide menu
 * configuration, so every mutation requires `menu.manage` with
 * `AllBranchesRequiredGuard`; reads need `menu.view`.
 */
@Controller('restaurants/:restaurantId/products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listVariants(
    @Param('productId') productId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<VariantListResponseBody> {
    const result = await this.variantsService.listVariants({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

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
  async createVariant(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<VariantResponseBody> {
    const result = await this.variantsService.createVariant({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      name: dto.name,
      status: dto.status,
      price: dto.price,
      displayOrder: dto.displayOrder,
      isDefault: dto.isDefault ?? false,
      discountApplies: dto.discountApplies ?? true,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'defaultMustBeActive') {
      throw new BadRequestException(VARIANT_DEFAULT_MUST_BE_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultConflict') {
      throw new ConflictException(VARIANT_DEFAULT_CONFLICT_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * Complete desired order of the Product's Variants. Registered before the
   * `:variantId` routes; it is the only `PUT` on this level.
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
  async reorderVariants(
    @Param('productId') productId: string,
    @Body() dto: ReorderProductVariantsDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { variantIds: string[] } }> {
    const result = await this.variantsService.reorderVariants({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantIds: dto.variantIds,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'orderMismatch') {
      throw new ConflictException(ORDER_MISMATCH_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch(':variantId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<VariantResponseBody> {
    const result = await this.variantsService.updateVariant({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantId,
      name: dto.name,
      status: dto.status,
      price: dto.price,
      displayOrder: dto.displayOrder,
      isDefault: dto.isDefault,
      discountApplies: dto.discountApplies,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'variantNotFound') {
      throw new NotFoundException(VARIANT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'defaultMustBeActive') {
      throw new BadRequestException(VARIANT_DEFAULT_MUST_BE_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultConflict') {
      throw new ConflictException(VARIANT_DEFAULT_CONFLICT_RESPONSE);
    }
    return { data: result.data };
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.variantsService.deleteVariant({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'variantNotFound') {
      throw new NotFoundException(VARIANT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasHistoricalReferences') {
      throw new ConflictException(HAS_HISTORICAL_REFERENCES_RESPONSE);
    }
  }

  @Get(':variantId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getTranslations(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<VariantTranslationListResponseBody> {
    const result = await this.variantsService.getTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'variantNotFound') {
      throw new NotFoundException(VARIANT_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Put(':variantId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putTranslation(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutProductVariantTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<VariantTranslationResponseBody> {
    const result = await this.variantsService.putTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantId,
      locale,
      name: dto.name,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'variantNotFound') {
      throw new NotFoundException(VARIANT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  @Delete(':variantId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteTranslation(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.variantsService.deleteTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      variantId,
      locale,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'variantNotFound') {
      throw new NotFoundException(VARIANT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
