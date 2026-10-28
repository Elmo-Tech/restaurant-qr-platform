import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { MenuImportFeatureGuard } from './menu-import-feature.guard';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILES } from './menu-import-file';
import { MenuImportUploadErrorsInterceptor } from './menu-import-upload-errors.interceptor';
import type { UploadedMenuFile } from './menu-import-file';
import { MenuImportService } from './menu-import.service';
import type { DraftView, ImportJobView } from './menu-import.service';

class StartImportDto {
  @IsUUID()
  targetMenuId!: string;

  @IsOptional()
  @IsString()
  languageHint?: string;
}

class UpdateDraftCategoryDto {
  @IsOptional()
  @IsBoolean()
  included?: boolean;

  @IsOptional()
  @IsBoolean()
  useExisting?: boolean;

  @IsOptional()
  @IsObject()
  names?: Record<string, string | null>;
}

class UpdateDraftProductDto {
  @IsOptional()
  @IsBoolean()
  included?: boolean;

  /** Money as a string; null clears it. */
  @IsOptional()
  @IsString()
  price?: string | null;

  @IsOptional()
  @IsObject()
  names?: Record<string, string | null>;

  @IsOptional()
  @IsObject()
  descriptions?: Record<string, string | null>;
}

class ApproveImportDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  productStatus!: 'ACTIVE' | 'INACTIVE';
}

const READ_GUARDS = [
  AuthGuard,
  RestaurantAccessGuard,
  PermissionGuard,
] as const;
const WRITE_GUARDS = [
  AuthGuard,
  CsrfGuard,
  RestaurantAccessGuard,
  PermissionGuard,
  AllBranchesRequiredGuard,
] as const;

/**
 * Menu Import (DEC-040, MENU_IMPORT_SPEC.md #20): upload a menu file, review the
 * Draft, approve. Restaurant is always taken from the authenticated context.
 */
@Controller('restaurants/:restaurantId/menu-imports')
export class MenuImportController {
  constructor(private readonly service: MenuImportService) {}

  // The feature gate is a guard, so a Restaurant without MENU_IMPORT is refused before the upload is read (DEC-057).
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(...WRITE_GUARDS, MenuImportFeatureGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  @UseInterceptors(
    MenuImportUploadErrorsInterceptor,
    // One more than the limit, so the 11th file gets the stable IMPORT_FILE_INVALID from `inspectMenuFiles`.
    FilesInterceptor('file', MAX_IMPORT_FILES + 1, {
      limits: {
        fileSize: MAX_IMPORT_FILE_BYTES + 1,
        files: MAX_IMPORT_FILES + 1,
      },
    }),
  )
  async start(
    @Body() dto: StartImportDto,
    @UploadedFiles() files: UploadedMenuFile[] | undefined,
    @Req() request: RestaurantAuthorizedRequest,
  ) {
    const data = await this.service.startImport({
      restaurantId: request.restaurantAccess.restaurantId,
      userId: request.auth.userId,
      targetMenuId: dto.targetMenuId,
      languageHint: dto.languageHint,
      files,
    });
    return { data };
  }

  @Get()
  @UseGuards(...READ_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async list(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: ImportJobView[] }> {
    return {
      data: await this.service.listJobs(request.restaurantAccess.restaurantId),
    };
  }

  @Get(':importId')
  @UseGuards(...READ_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async get(
    @Param('importId') importId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: ImportJobView }> {
    return {
      data: await this.service.getJob(
        request.restaurantAccess.restaurantId,
        importId,
      ),
    };
  }

  @Get(':importId/draft')
  @UseGuards(...READ_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async draft(
    @Param('importId') importId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: DraftView }> {
    return {
      data: await this.service.getDraft(
        request.restaurantAccess.restaurantId,
        importId,
      ),
    };
  }

  @Patch(':importId/categories/:draftCategoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(...WRITE_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateCategory(
    @Param('importId') importId: string,
    @Param('draftCategoryId') draftCategoryId: string,
    @Body() dto: UpdateDraftCategoryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    await this.service.updateCategory({
      restaurantId: request.restaurantAccess.restaurantId,
      publicId: importId,
      draftCategoryId,
      included: dto.included,
      useExisting: dto.useExisting,
      names: dto.names,
    });
  }

  @Patch(':importId/products/:draftProductId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(...WRITE_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateProduct(
    @Param('importId') importId: string,
    @Param('draftProductId') draftProductId: string,
    @Body() dto: UpdateDraftProductDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    await this.service.updateProduct({
      restaurantId: request.restaurantAccess.restaurantId,
      publicId: importId,
      draftProductId,
      included: dto.included,
      price: dto.price,
      names: dto.names,
      descriptions: dto.descriptions,
    });
  }

  @Post(':importId/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(...WRITE_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async approve(
    @Param('importId') importId: string,
    @Body() dto: ApproveImportDto,
    @Req() request: RestaurantAuthorizedRequest,
  ) {
    return {
      data: await this.service.approve({
        restaurantId: request.restaurantAccess.restaurantId,
        publicId: importId,
        productStatus: dto.productStatus,
      }),
    };
  }

  @Post(':importId/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(...WRITE_GUARDS)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async discard(
    @Param('importId') importId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    await this.service.discard(request.restaurantAccess.restaurantId, importId);
  }
}
