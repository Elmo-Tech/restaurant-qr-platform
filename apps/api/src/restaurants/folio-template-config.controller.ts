import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';
import { assertValidImageUpload } from '../storage/image-file-validator';
import { MAX_IMAGE_BYTES } from '../storage/image-storage.service';
import type { UploadedImageFile } from '../storage/uploaded-image-file';
import { FolioTemplateSettingsDto } from './dto/folio-template-settings.dto';
import { FolioTemplateConfigService, type FolioConfigView } from './folio-template-config.service';

@Controller('restaurants/:restaurantId/folio-template')
@UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
@RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
export class FolioTemplateConfigController {
  constructor(
    private readonly configs: FolioTemplateConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}
  private async assertAvailable(id: string): Promise<void> {
    if (!(await this.entitlements.templatesFor(id)).includes('FOLIO')) {
      throw featureNotAvailableException(new FeatureNotAvailableError('MENU_TEMPLATES'));
    }
  }
  @Get()
  async get(@Req() req: RestaurantAuthorizedRequest): Promise<{data: FolioConfigView}> {
    const id = req.restaurantAccess.restaurantId; await this.assertAvailable(id);
    return { data: await this.configs.get(id) };
  }
  @Patch('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async draft(@Req() req: RestaurantAuthorizedRequest, @Body() body: FolioTemplateSettingsDto): Promise<{data: FolioConfigView}> {
    const id = req.restaurantAccess.restaurantId; await this.assertAvailable(id);
    return { data: await this.configs.saveDraft(id, body) };
  }
  @Post('artwork')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('image', {limits: {fileSize: MAX_IMAGE_BYTES * 2}}))
  async upload(@Req() req: RestaurantAuthorizedRequest, @UploadedFile() file: UploadedImageFile | undefined): Promise<{data: FolioConfigView}> {
    const id = req.restaurantAccess.restaurantId; await this.assertAvailable(id);
    assertValidImageUpload(file);
    return { data: await this.configs.setDraftArtwork(id, file.buffer, file.mimetype) };
  }
  @Delete('artwork')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async reset(@Req() req: RestaurantAuthorizedRequest): Promise<{data: FolioConfigView}> {
    const id = req.restaurantAccess.restaurantId; await this.assertAvailable(id);
    return { data: await this.configs.resetDraftArtwork(id) };
  }
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async publish(@Req() req: RestaurantAuthorizedRequest): Promise<{data: FolioConfigView}> {
    const id = req.restaurantAccess.restaurantId; await this.assertAvailable(id);
    return { data: await this.configs.publish(id) };
  }
}
