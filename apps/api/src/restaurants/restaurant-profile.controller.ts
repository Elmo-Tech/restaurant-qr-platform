import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
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
import { UpdateContactDto } from './dto/update-contact.dto';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';
import { UpdateMenuTemplateDto } from './dto/update-menu-template.dto';
import { ExclusiveDesignSelectionDto } from './dto/exclusive-design-selection.dto';
import { UpdateOrderingOptionsDto } from './dto/update-ordering-options.dto';
import { UpdateQrStyleDto } from './dto/update-qr-style.dto';
import type { QrStyle, QrStyleErrorCode } from './qr-style';
import {
  ContactValidationError,
  type RestaurantContact,
} from './restaurant-contact';
import { UpdateRestaurantProfileDto } from './dto/update-restaurant-profile.dto';
import {
  RestaurantProfileService,
  WhatsappNumberRequiredError,
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
   * Ordering channels: stop (or resume) accepting Pickup, Delivery and / or
   * Table (dine-in) orders; a channel that is off is a view-only menu
   * (DEC-038). A Restaurant-structural change, so the same authority as the
   * rest of this controller: `restaurant.manage` AND Restaurant-wide Branch scope.
   */
  @Patch('ordering-options')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateOrderingOptions(
    @Body() dto: UpdateOrderingOptionsDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: RestaurantOrderingOptions }> {
    try {
      const data = await this.restaurantProfileService.updateOrderingOptions({
        restaurantId: request.restaurantAccess.restaurantId,
        pickupEnabled: dto.pickupEnabled,
        deliveryEnabled: dto.deliveryEnabled,
        tableOrderingEnabled: dto.tableOrderingEnabled,
        whatsappOrderingEnabled: dto.whatsappOrderingEnabled,
      });
      return { data };
    } catch (error) {
      if (error instanceof FeatureNotAvailableError) {
        throw featureNotAvailableException(error);
      }
      if (error instanceof WhatsappNumberRequiredError) {
        throw new UnprocessableEntityException({
          error: {
            code: 'WHATSAPP_NUMBER_REQUIRED',
            message: 'Add the restaurant WhatsApp number (Settings > Profile) before turning WhatsApp orders on.',
          },
        });
      }
      throw error;
    }
  }

  /**
   * Restaurant-private exclusive design status. This is not a public catalog:
   * only users with restaurant.manage AND all-branch scope can view it.
   */
  @Get('exclusive-design')
  @UseGuards(
    AuthGuard,
    RestaurantAccessGuard,
    PermissionGuard,
    AllBranchesRequiredGuard,
  )
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async getExclusiveDesign(@Req() request: RestaurantAuthorizedRequest) {
    return {
      data: await this.restaurantProfileService.getExclusiveDesign(
        request.restaurantAccess.restaurantId,
      ),
    };
  }

  /** The Restaurant chooses whether guests see its exclusive design or a stock template. */
  @Post('exclusive-design/selection')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async setExclusiveDesignSelection(
    @Body() dto: ExclusiveDesignSelectionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ) {
    return {
      data: await this.restaurantProfileService.setExclusiveDesignSelection(
        request.restaurantAccess.restaurantId,
        dto.useExclusive,
      ),
    };
  }

  /**
   * The Guest menu template (DEC-044): how the same menu is laid out. Presentation only; a
   * Restaurant-wide choice, so `restaurant.manage` AND Restaurant-wide Branch scope.
   */
  @Patch('menu-template')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateMenuTemplate(
    @Body() dto: UpdateMenuTemplateDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { menuTemplate: UpdateMenuTemplateDto['menuTemplate'] } }> {
    try {
      const data = await this.restaurantProfileService.updateMenuTemplate(
        request.restaurantAccess.restaurantId,
        dto.menuTemplate,
      );
      return { data };
    } catch (error) {
      if (error instanceof FeatureNotAvailableError) throw featureNotAvailableException(error);
      throw error;
    }
  }

  /**
   * Guest Menu contact details (phone, WhatsApp number, social links). A
   * Restaurant-structural change: `restaurant.manage` AND Restaurant-wide scope.
   * An invalid phone / link answers `422` with a stable code and the field name.
   */
  @Patch('contact')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
  async updateContact(
    @Body() dto: UpdateContactDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: RestaurantContact }> {
    try {
      const data = await this.restaurantProfileService.updateContact(
        request.restaurantAccess.restaurantId,
        dto,
      );
      return { data };
    } catch (error) {
      if (error instanceof ContactValidationError) {
        throw new UnprocessableEntityException({
          error: {
            code: error.code,
            details: { field: error.field },
            message:
              error.code === 'INVALID_PHONE'
                ? 'Enter a valid phone number (digits, optionally starting with +).'
                : 'Enter a valid https link on the correct site.',
          },
        });
      }
      throw error;
    }
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
