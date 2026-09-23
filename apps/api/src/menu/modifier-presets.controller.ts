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
import { CreateModifierPresetDto } from './dto/create-modifier-preset.dto';
import { CreateModifierPresetOptionDto } from './dto/create-modifier-preset-option.dto';
import { PutModifierPresetOptionTranslationDto } from './dto/put-modifier-preset-option-translation.dto';
import { PutModifierPresetTranslationDto } from './dto/put-modifier-preset-translation.dto';
import { UpdateModifierPresetDto } from './dto/update-modifier-preset.dto';
import { UpdateModifierPresetOptionDto } from './dto/update-modifier-preset-option.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import { ModifierPresetsService } from './modifier-presets.service';
import type {
  ModifierPresetOptionTranslationView,
  ModifierPresetOptionView,
  ModifierPresetTranslationView,
  ModifierPresetView,
} from './modifier-presets.service';

const PRESET_NOT_FOUND_RESPONSE = {
  error: { code: 'MODIFIER_PRESET_NOT_FOUND', message: 'Modifier preset not found.' },
};
const PRESET_OPTION_NOT_FOUND_RESPONSE = {
  error: { code: 'MODIFIER_PRESET_OPTION_NOT_FOUND', message: 'Modifier preset option not found.' },
};
const INVALID_SELECTION_RANGE_RESPONSE = {
  error: {
    code: 'MODIFIER_INVALID_SELECTION_RANGE',
    message: 'maximumSelections must be greater than or equal to minimumSelections.',
  },
};
const PRESET_HAS_LINKED_PRODUCTS_RESPONSE = {
  error: {
    code: 'MODIFIER_PRESET_HAS_LINKED_PRODUCTS',
    message: 'This is currently attached to one or more Products and cannot be deleted. Deactivate it instead.',
  },
};

interface ModifierPresetListResponseBody {
  data: ModifierPresetView[];
}
interface ModifierPresetResponseBody {
  data: ModifierPresetView;
}
interface ModifierPresetOptionResponseBody {
  data: ModifierPresetOptionView;
}
interface ModifierPresetTranslationListResponseBody {
  data: ModifierPresetTranslationView[];
}
interface ModifierPresetTranslationResponseBody {
  data: ModifierPresetTranslationView;
}
interface ModifierPresetOptionTranslationListResponseBody {
  data: ModifierPresetOptionTranslationView[];
}
interface ModifierPresetOptionTranslationResponseBody {
  data: ModifierPresetOptionTranslationView;
}

/**
 * FT-6B: the Restaurant-scoped Modifier Preset library ("Menu Management ->
 * Modifier Presets"), reusing `menu.view`/`menu.manage` + the same
 * `AllBranchesRequiredGuard` every Product-structural mutation already
 * requires, since a Preset is Restaurant-wide configuration, exactly like
 * Menu/Category/Product/ModifierGroup. Tenant scope always comes from
 * `request.restaurantAccess.restaurantId` -- never a client-supplied value.
 */
@Controller('restaurants/:restaurantId/modifier-presets')
export class ModifierPresetsController {
  constructor(private readonly presetsService: ModifierPresetsService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listPresets(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetListResponseBody> {
    const result = await this.presetsService.listPresets({
      restaurantId: request.restaurantAccess.restaurantId,
    });
    return { data: result.data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async createPreset(
    @Body() dto: CreateModifierPresetDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetResponseBody> {
    const result = await this.presetsService.createPreset({
      restaurantId: request.restaurantAccess.restaurantId,
      name: dto.name,
      helperText: dto.helperText ?? null,
      status: dto.status,
      minimumSelections: dto.minimumSelections,
      maximumSelections: dto.maximumSelections,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'invalidSelectionRange') {
      throw new BadRequestException(INVALID_SELECTION_RANGE_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch(':presetId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updatePreset(
    @Param('presetId') presetId: string,
    @Body() dto: UpdateModifierPresetDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetResponseBody> {
    const result = await this.presetsService.updatePreset({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      name: dto.name,
      helperText: dto.helperText,
      status: dto.status,
      minimumSelections: dto.minimumSelections,
      maximumSelections: dto.maximumSelections,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidSelectionRange') {
      throw new BadRequestException(INVALID_SELECTION_RANGE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6B closeout, Section 5: "Delete" a Preset -- hard DELETE, ONLY when
   * it is not currently attached to any Product (`ModifierPresetView.canDelete`).
   * Never cascades into Product-local Groups (Section 3's runtime
   * authority is untouched either way); Staff uses the existing
   * Activate/Deactivate toggle instead when this is rejected.
   */
  @Delete(':presetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deletePreset(
    @Param('presetId') presetId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.presetsService.deletePreset({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasLinkedProducts') {
      throw new ConflictException(PRESET_HAS_LINKED_PRODUCTS_RESPONSE);
    }
  }

  @Post(':presetId/options')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async createPresetOption(
    @Param('presetId') presetId: string,
    @Body() dto: CreateModifierPresetOptionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetOptionResponseBody> {
    const result = await this.presetsService.createPresetOption({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      name: dto.name,
      status: dto.status,
      priceAdjustment: dto.priceAdjustment,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch(':presetId/options/:presetOptionId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updatePresetOption(
    @Param('presetId') presetId: string,
    @Param('presetOptionId') presetOptionId: string,
    @Body() dto: UpdateModifierPresetOptionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetOptionResponseBody> {
    const result = await this.presetsService.updatePresetOption({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      presetOptionId,
      name: dto.name,
      status: dto.status,
      priceAdjustment: dto.priceAdjustment,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetOptionNotFound') {
      throw new NotFoundException(PRESET_OPTION_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6B closeout, Section 5: "Delete" a Preset Option -- same
   * "unreferenced only" rule as `deletePreset`.
   */
  @Delete(':presetId/options/:presetOptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deletePresetOption(
    @Param('presetId') presetId: string,
    @Param('presetOptionId') presetOptionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.presetsService.deletePresetOption({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      presetOptionId,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetOptionNotFound') {
      throw new NotFoundException(PRESET_OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasLinkedProducts') {
      throw new ConflictException(PRESET_HAS_LINKED_PRODUCTS_RESPONSE);
    }
  }

  @Get(':presetId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getPresetTranslations(
    @Param('presetId') presetId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetTranslationListResponseBody> {
    const result = await this.presetsService.getPresetTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Put(':presetId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putPresetTranslation(
    @Param('presetId') presetId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutModifierPresetTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetTranslationResponseBody> {
    const result = await this.presetsService.putPresetTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      locale,
      name: dto.name,
      helperText: dto.helperText ?? null,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  @Delete(':presetId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deletePresetTranslation(
    @Param('presetId') presetId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.presetsService.deletePresetTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      locale,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }

  @Get(':presetId/options/:presetOptionId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getPresetOptionTranslations(
    @Param('presetId') presetId: string,
    @Param('presetOptionId') presetOptionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetOptionTranslationListResponseBody> {
    const result = await this.presetsService.getPresetOptionTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      presetOptionId,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetOptionNotFound') {
      throw new NotFoundException(PRESET_OPTION_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Put(':presetId/options/:presetOptionId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putPresetOptionTranslation(
    @Param('presetId') presetId: string,
    @Param('presetOptionId') presetOptionId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutModifierPresetOptionTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierPresetOptionTranslationResponseBody> {
    const result = await this.presetsService.putPresetOptionTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      presetOptionId,
      locale,
      name: dto.name,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetOptionNotFound') {
      throw new NotFoundException(PRESET_OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  @Delete(':presetId/options/:presetOptionId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deletePresetOptionTranslation(
    @Param('presetId') presetId: string,
    @Param('presetOptionId') presetOptionId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.presetsService.deletePresetOptionTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      presetId,
      presetOptionId,
      locale,
    });
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetOptionNotFound') {
      throw new NotFoundException(PRESET_OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
