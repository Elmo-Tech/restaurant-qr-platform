import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
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
import { SherbinyMenuSettingsDto } from './dto/sherbiny-menu-settings.dto';
import { SHERBINY_IMAGE_SLOTS, type SherbinyImageSlot } from './sherbiny-menu-config';
import { SherbinyMenuConfigService, type SherbinyConfigView } from './sherbiny-menu-config.service';

/**
 * Staff settings of the exclusive El Sherbiny menu, with the same Restaurant-wide scope as template selection.
 * The tenant is always the authorized Restaurant; the service additionally requires that Restaurant's own
 * SHERBINY assignment, so the route never exposes another tenant's design.
 */
@Controller('restaurants/:restaurantId/sherbiny-menu')
@UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
@RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
export class SherbinyMenuConfigController {
  constructor(private readonly configs: SherbinyMenuConfigService) {}

  private slot(value: string): SherbinyImageSlot {
    if (!(SHERBINY_IMAGE_SLOTS as readonly string[]).includes(value)) {
      throw new BadRequestException({
        error: { code: 'SHERBINY_IMAGE_SLOT_INVALID', message: 'Unknown image slot.' },
      });
    }
    return value as SherbinyImageSlot;
  }

  @Get()
  async get(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: SherbinyConfigView }> {
    return { data: await this.configs.get(request.restaurantAccess.restaurantId) };
  }

  @Patch('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async saveDraft(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: SherbinyMenuSettingsDto,
  ): Promise<{ data: SherbinyConfigView }> {
    return { data: await this.configs.saveDraft(request.restaurantAccess.restaurantId, dto) };
  }

  @Post('images/:slot')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }))
  async uploadImage(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('slot') slot: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ data: SherbinyConfigView }> {
    const target = this.slot(slot);
    assertValidImageUpload(file);
    return {
      data: await this.configs.setDraftImage(
        request.restaurantAccess.restaurantId,
        target,
        file.buffer,
        file.mimetype,
      ),
    };
  }

  @Delete('images/:slot')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async resetImage(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('slot') slot: string,
  ): Promise<{ data: SherbinyConfigView }> {
    return {
      data: await this.configs.resetDraftImage(request.restaurantAccess.restaurantId, this.slot(slot)),
    };
  }

  @Post('category-images/:categoryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES * 2 } }))
  async uploadCategoryImage(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ data: SherbinyConfigView }> {
    assertValidImageUpload(file);
    return {
      data: await this.configs.setCategoryImage(
        request.restaurantAccess.restaurantId,
        categoryId,
        file.buffer,
        file.mimetype,
      ),
    };
  }

  @Delete('category-images/:categoryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async resetCategoryImage(
    @Req() request: RestaurantAuthorizedRequest,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<{ data: SherbinyConfigView }> {
    return {
      data: await this.configs.resetCategoryImage(request.restaurantAccess.restaurantId, categoryId),
    };
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async publish(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: SherbinyConfigView }> {
    return { data: await this.configs.publish(request.restaurantAccess.restaurantId) };
  }
}
