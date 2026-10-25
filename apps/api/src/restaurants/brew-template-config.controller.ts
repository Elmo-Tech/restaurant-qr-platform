import {
  Body,
  Controller,
  Delete,
  Get,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { assertValidImageUpload } from '../storage/image-file-validator';
import { MAX_IMAGE_BYTES } from '../storage/image-storage.service';
import type { UploadedImageFile } from '../storage/uploaded-image-file';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { FeatureNotAvailableError } from '../entitlements/features';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { BrewTemplateSettingsDto } from './dto/brew-template-settings.dto';
import {
  BrewTemplateConfigService,
  type BrewConfigView,
} from './brew-template-config.service';

/** Staff-only BREW settings with the exact same restaurant-wide scope as template selection. */
@Controller('restaurants/:restaurantId/brew-template')
@UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
@RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
export class BrewTemplateConfigController {
  constructor(
    private readonly configs: BrewTemplateConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async assertAvailable(restaurantId: string): Promise<void> {
    const allowed = await this.entitlements.templatesFor(restaurantId);
    if (!allowed.includes('BREW')) {
      throw featureNotAvailableException(new FeatureNotAvailableError('MENU_TEMPLATES'));
    }
  }

  @Get()
  async get(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: BrewConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.get(id) };
  }

  @Patch('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async saveDraft(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: BrewTemplateSettingsDto,
  ): Promise<{ data: BrewConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.saveDraft(id, dto) };
  }

  @Post('promo-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }))
  async uploadPromoImage(
    @Req() request: RestaurantAuthorizedRequest,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ data: BrewConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    assertValidImageUpload(file);
    return { data: await this.configs.setDraftImage(id, file.buffer, file.mimetype) };
  }

  @Delete('promo-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async resetPromoImage(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: BrewConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.resetDraftImage(id) };
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async publish(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: BrewConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.publish(id) };
  }
}
