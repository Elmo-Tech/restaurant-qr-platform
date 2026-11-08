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
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { isWellFormedUuid } from '../common/is-uuid';
import { assertValidImageUpload } from '../storage/image-file-validator';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
} from '../storage/image-storage.service';
import type { UploadedImageFile } from '../storage/uploaded-image-file';
import { OfferDto, ReorderOffersDto } from './dto/offer.dto';
import { OffersFeatureGuard } from './offers-feature.guard';
import {
  OffersService,
  type OfferFailure,
  type MenuItemChoice,
  type OfferResult,
  type StaffOffer,
} from './offers.service';

const MESSAGES: Record<OfferFailure, string> = {
  OFFER_NOT_FOUND: 'Offer not found.',
  DEFAULT_TRANSLATION_REQUIRED:
    'The name in the Restaurant default language is required for the offer, every slot and every option.',
  LOCALE_NOT_ACTIVE: 'The locale is not active for this Restaurant.',
  OFFER_PRICE_REQUIRED: 'The offer price is required.',
  OFFER_DATES_INVALID:
    'The dates are not valid: the end date cannot be before the start date.',
  OFFER_DAYS_INVALID: 'The days of the week must be numbers from 0 to 6.',
  OFFER_SLOTS_INVALID: 'The offer slots are not valid.',
  OFFER_ITEM_INVALID: 'A menu item of the offer is not valid (unknown product, a size is required, or a bad quantity).',
  OFFER_ORDER_INVALID:
    'The order must list every offer of the restaurant exactly once.',
  OFFER_LIMIT_REACHED: 'The restaurant has reached the maximum number of offers.',
};

function failure(code: OfferFailure, reason?: string): never {
  const body = {
    error: {
      code,
      message: MESSAGES[code],
      ...(reason ? { details: { reason } } : {}),
    },
  };
  if (code === 'OFFER_NOT_FOUND') throw new NotFoundException(body);
  if (code === 'OFFER_LIMIT_REACHED') throw new ConflictException(body);
  throw new UnprocessableEntityException(body);
}

function unwrap(result: OfferResult): { data: StaffOffer } {
  if (result.outcome === 'ok') return { data: result.data };
  return failure(result.code, result.reason);
}

const notFound = () => failure('OFFER_NOT_FOUND');

/**
 * Offers / Bundles (DEC-069): `/restaurants/{restaurantId}/offers`. Menu content: reading needs `menu.view`; every change needs
 * `menu.manage` with Restaurant-wide Branch scope (and CSRF). All routes need the `OFFERS` platform feature. The Restaurant always
 * comes from the authorized request, never from the body.
 */
@Controller('restaurants/:restaurantId/offers')
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, OffersFeatureGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async list(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffOffer[] }> {
    return {
      data: await this.offers.list(request.restaurantAccess.restaurantId),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async create(
    @Body() dto: OfferDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffOffer }> {
    return unwrap(
      await this.offers.create({
        ...dto,
        restaurantId: request.restaurantAccess.restaurantId,
      }),
    );
  }

  /** The menu items the offer editor can pick from (declared before `:offerId`). */
  @Get('menu-items')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, OffersFeatureGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async menuItems(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: MenuItemChoice[] }> {
    return { data: await this.offers.menuItems(request.restaurantAccess.restaurantId) };
  }

  // Declared before `:offerId` routes so "order" is never read as an id.
  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async reorder(
    @Body() dto: ReorderOffersDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.offers.reorder(
      request.restaurantAccess.restaurantId,
      dto.offerIds,
    );
    if (result.outcome === 'failed') failure(result.code);
  }

  @Get(':offerId')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, OffersFeatureGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async get(
    @Param('offerId') offerId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffOffer }> {
    if (!isWellFormedUuid(offerId)) return notFound();
    const offer = await this.offers.get(
      request.restaurantAccess.restaurantId,
      offerId,
    );
    if (!offer) return notFound();
    return { data: offer };
  }

  @Patch(':offerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async update(
    @Param('offerId') offerId: string,
    @Body() dto: OfferDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffOffer }> {
    if (!isWellFormedUuid(offerId)) return notFound();
    return unwrap(
      await this.offers.update(offerId, {
        ...dto,
        restaurantId: request.restaurantAccess.restaurantId,
      }),
    );
  }

  /** "Delete": archives the offer (hidden from Guests and from the list, kept for historical orders). */
  @Delete(':offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async remove(
    @Param('offerId') offerId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    if (!isWellFormedUuid(offerId)) return notFound();
    const removed = await this.offers.archive(
      request.restaurantAccess.restaurantId,
      offerId,
    );
    if (!removed) return notFound();
  }

  @Post(':offerId/image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }),
  )
  async uploadImage(
    @Param('offerId') offerId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { imageAssetPath: string } }> {
    assertValidImageUpload(file);
    const restaurantId = request.restaurantAccess.restaurantId;
    // The Offer's Tenant-scoped existence is checked BEFORE anything is written to disk.
    if (
      !isWellFormedUuid(offerId) ||
      !(await this.offers.exists(restaurantId, offerId))
    ) {
      return notFound();
    }
    const saved = await this.imageStorage.saveImage(file.buffer, file.mimetype);
    let result;
    try {
      result = await this.offers.setImage(restaurantId, offerId, saved.assetPath);
    } catch (error) {
      await this.imageStorage.deleteImageBestEffort(saved.assetPath);
      throw error;
    }
    if (!result.found) {
      await this.imageStorage.deleteImageBestEffort(saved.assetPath);
      return notFound();
    }
    await this.imageStorage.deleteImageBestEffort(result.previous);
    return { data: { imageAssetPath: saved.assetPath } };
  }

  @Delete(':offerId/image')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
    OffersFeatureGuard,
  )
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async removeImage(
    @Param('offerId') offerId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    if (!isWellFormedUuid(offerId)) return notFound();
    const result = await this.offers.setImage(
      request.restaurantAccess.restaurantId,
      offerId,
      null,
    );
    if (!result.found) return notFound();
    await this.imageStorage.deleteImageBestEffort(result.previous);
  }
}
