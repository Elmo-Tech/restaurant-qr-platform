import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
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
import {
  assertValidCoverImageUpload,
  assertValidImageUpload,
} from '../storage/image-file-validator';
import { ImageStorageService, MAX_IMAGE_BYTES } from '../storage/image-storage.service';
import type { UploadedImageFile } from '../storage/uploaded-image-file';
import { UpdateOrderingOptionsDto } from './dto/update-ordering-options.dto';
import { UpdateQrStyleDto } from './dto/update-qr-style.dto';
import type { QrStyle, QrStyleErrorCode } from './qr-style';
import { UpdateRestaurantProfileDto } from './dto/update-restaurant-profile.dto';
import {
  RestaurantProfileService,
  type RestaurantOrderingOptions,
  type RestaurantProfile,
} from './restaurant-profile.service';

interface RestaurantProfileResponseBody {
  data: RestaurantProfile;
}

const QR_STYLE_MESSAGES: Record<QrStyleErrorCode, string> = {
  QR_STYLE_LOW_CONTRAST:
    'The QR color and background are too close: phones may not be able to scan it. Choose a darker QR color or a lighter background.',
  QR_STYLE_INVERTED:
    'The QR color must be darker than its background: many scanners cannot read a light code on a dark background.',
  QR_STYLE_LOGO_REQUIRED:
    'Upload a restaurant logo first (Settings > Profile) to show it in the QR code.',
};

/**
 * FT-12: Restaurant Profile -- `PATCH /restaurants/{restaurantId}` (name),
 * `POST`/`DELETE /restaurants/{restaurantId}/logo` and `/cover` (Guest Menu
 * hero image). A Restaurant-structural
 * mutation exactly like Restaurant Locales (`restaurants.controller.ts`):
 * `restaurant.manage` alone is not sufficient authority --
 * `AllBranchesRequiredGuard` additionally requires Restaurant-wide Branch
 * scope, so a Branch-scoped MANAGER can never rename the Restaurant or
 * change its logo merely because their Role holds the Permission. No theme
 * editor, no currency/defaultLocale mutation here -- V1 keeps those fields
 * read-only (currency has no writable route anywhere; defaultLocale mutation
 * belongs to the existing, separate Language Settings feature).
 */
@Controller('restaurants/:restaurantId')
export class RestaurantProfileController {
  constructor(
    private readonly restaurantProfileService: RestaurantProfileService,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateProfile(
    @Body() dto: UpdateRestaurantProfileDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantProfileResponseBody> {
    const data = await this.restaurantProfileService.updateProfile({
      restaurantId: request.restaurantAccess.restaurantId,
      name: dto.name,
    });

    return { data };
  }

  /**
   * Restaurant QR appearance (colors, centered logo, restaurant name). Same
   * authority as the rest of this controller (`restaurant.manage` AND
   * Restaurant-wide scope). Styles that would not scan are refused with a
   * stable code and nothing is written.
   */
  @Patch('qr-style')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateQrStyle(
    @Body() dto: UpdateQrStyleDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: QrStyle }> {
    const result = await this.restaurantProfileService.updateQrStyle({
      restaurantId: request.restaurantAccess.restaurantId,
      foregroundColor: dto.foregroundColor,
      backgroundColor: dto.backgroundColor,
      showLogo: dto.showLogo,
      showName: dto.showName,
    });

    if (result.outcome === 'invalid') {
      throw new BadRequestException({
        error: { code: result.code, message: QR_STYLE_MESSAGES[result.code] },
      });
    }

    return { data: result.data };
  }

  /**
   * Restaurant QR order types: stop (or resume) accepting Pickup and / or
   * Delivery orders. A Restaurant-structural change, so the same authority as
   * the rest of this controller: `restaurant.manage` AND Restaurant-wide
   * Branch scope. Dine-in (Table QR) is not affected.
   */
  @Patch('ordering-options')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateOrderingOptions(
    @Body() dto: UpdateOrderingOptionsDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: RestaurantOrderingOptions }> {
    const data = await this.restaurantProfileService.updateOrderingOptions({
      restaurantId: request.restaurantAccess.restaurantId,
      pickupEnabled: dto.pickupEnabled,
      deliveryEnabled: dto.deliveryEnabled,
    });

    return { data };
  }

  /**
   * Mirrors `ProductsController.uploadProductImage` exactly: the file is
   * saved to disk first, then the DB is updated, and only after that write
   * succeeds is the PREVIOUS logo file removed (best-effort) -- a save
   * failure never leaves an orphaned file referenced nowhere, and a cleanup
   * failure on the old file never rolls back an already-successful logo
   * change.
   */
  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }))
  async uploadLogo(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantProfileResponseBody> {
    assertValidImageUpload(file);

    const saved = await this.imageStorageService.saveImage(file.buffer, file.mimetype);

    let result;
    try {
      result = await this.restaurantProfileService.setLogo({
        restaurantId: request.restaurantAccess.restaurantId,
        imageAssetPath: saved.assetPath,
      });
    } catch (error) {
      await this.imageStorageService.deleteImageBestEffort(saved.assetPath);
      throw error;
    }

    await this.imageStorageService.deleteImageBestEffort(result.previousLogoAssetPath);

    return { data: result.data };
  }

  /**
   * Guest Menu cover image: the same guards, storage, save-then-write-then-
   * best-effort-delete-old contract as the logo, plus the extra dimension rules
   * of `assertValidCoverImageUpload` (banner aspect ratio, minimum and maximum
   * size). `restaurant.manage` alone is not enough: Restaurant-wide scope is
   * required, exactly like the logo.
   */
  @Post('cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }))
  async uploadCover(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<RestaurantProfileResponseBody> {
    assertValidCoverImageUpload(file);

    const saved = await this.imageStorageService.saveImage(file.buffer, file.mimetype);

    let result;
    try {
      result = await this.restaurantProfileService.setCover({
        restaurantId: request.restaurantAccess.restaurantId,
        imageAssetPath: saved.assetPath,
      });
    } catch (error) {
      await this.imageStorageService.deleteImageBestEffort(saved.assetPath);
      throw error;
    }

    await this.imageStorageService.deleteImageBestEffort(result.previousCoverAssetPath);

    return { data: result.data };
  }

  @Delete('cover')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async removeCover(@Req() request: RestaurantAuthorizedRequest): Promise<void> {
    const result = await this.restaurantProfileService.clearCover({
      restaurantId: request.restaurantAccess.restaurantId,
    });

    await this.imageStorageService.deleteImageBestEffort(result.previousCoverAssetPath);
  }

  @Delete('logo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async removeLogo(@Req() request: RestaurantAuthorizedRequest): Promise<void> {
    const result = await this.restaurantProfileService.clearLogo({
      restaurantId: request.restaurantAccess.restaurantId,
    });

    await this.imageStorageService.deleteImageBestEffort(result.previousLogoAssetPath);
  }
}
