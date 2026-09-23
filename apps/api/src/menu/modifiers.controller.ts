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
import { ApplyModifierPresetDto } from './dto/apply-modifier-preset.dto';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import { CreateModifierOptionDto } from './dto/create-modifier-option.dto';
import { PutModifierGroupTranslationDto } from './dto/put-modifier-group-translation.dto';
import { PutModifierOptionTranslationDto } from './dto/put-modifier-option-translation.dto';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import { UpdateModifierOptionDto } from './dto/update-modifier-option.dto';
import {
  DEFAULT_TRANSLATION_REQUIRED_RESPONSE,
  LOCALE_NOT_ACTIVE_RESPONSE,
} from './menu-translation.helper';
import { ModifiersService } from './modifiers.service';
import type {
  ModifierGroupTranslationView,
  ModifierGroupView,
  ModifierOptionTranslationView,
  ModifierOptionView,
} from './modifiers.service';

const PRODUCT_NOT_FOUND_RESPONSE = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
};
const GROUP_NOT_FOUND_RESPONSE = {
  error: { code: 'MODIFIER_GROUP_NOT_FOUND', message: 'Modifier group not found.' },
};
const OPTION_NOT_FOUND_RESPONSE = {
  error: { code: 'MODIFIER_OPTION_NOT_FOUND', message: 'Modifier option not found.' },
};
const INVALID_SELECTION_RANGE_RESPONSE = {
  error: {
    code: 'MODIFIER_INVALID_SELECTION_RANGE',
    message: 'maximumSelections must be greater than or equal to minimumSelections.',
  },
};
const PRESET_NOT_FOUND_RESPONSE = {
  error: { code: 'MODIFIER_PRESET_NOT_FOUND', message: 'Modifier preset not found.' },
};
const PRESET_ALREADY_APPLIED_RESPONSE = {
  error: {
    code: 'MODIFIER_PRESET_ALREADY_APPLIED',
    message: 'This preset is already attached to this Product.',
  },
};
const HAS_HISTORICAL_REFERENCES_RESPONSE = {
  error: {
    code: 'MODIFIER_HAS_HISTORICAL_REFERENCES',
    message: 'This has already been used in a historical Order and cannot be deleted. Deactivate it instead.',
  },
};

interface ModifierGroupListResponseBody {
  data: ModifierGroupView[];
}
interface ModifierGroupResponseBody {
  data: ModifierGroupView;
}
interface ModifierOptionResponseBody {
  data: ModifierOptionView;
}
interface ModifierGroupTranslationListResponseBody {
  data: ModifierGroupTranslationView[];
}
interface ModifierGroupTranslationResponseBody {
  data: ModifierGroupTranslationView;
}
interface ModifierOptionTranslationListResponseBody {
  data: ModifierOptionTranslationView[];
}
interface ModifierOptionTranslationResponseBody {
  data: ModifierOptionTranslationView;
}

/**
 * FT-6A: Staff configuration of a Product's Modifier Groups/Options, nested
 * under Product exactly like `translations` (Section: "reuse
 * menu.manage/menu.view conventions ... unless the actual existing domain
 * defines something else" -- it does not, so this reuses `MENU_VIEW`/
 * `MENU_MANAGE` and the same `AllBranchesRequiredGuard` every other
 * Product-structural mutation already requires, since Modifier
 * configuration is Restaurant-wide Product configuration, not a
 * Branch-scoped operational action).
 */
@Controller('restaurants/:restaurantId/products/:productId/modifier-groups')
export class ModifiersController {
  constructor(private readonly modifiersService: ModifiersService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async listModifierGroups(
    @Param('productId') productId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupListResponseBody> {
    const result = await this.modifiersService.listModifierGroups({
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
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async createModifierGroup(
    @Param('productId') productId: string,
    @Body() dto: CreateModifierGroupDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupResponseBody> {
    const result = await this.modifiersService.createModifierGroup({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      name: dto.name,
      helperText: dto.helperText ?? null,
      status: dto.status,
      minimumSelections: dto.minimumSelections,
      maximumSelections: dto.maximumSelections,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidSelectionRange') {
      throw new BadRequestException(INVALID_SELECTION_RANGE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6B, Section 2/4 "Use Preset": attaches a Restaurant-scoped Modifier
   * Preset to this Product by copying its current values into a real,
   * independent Modifier Group/Options (never a second pricing entity --
   * Section 3). Registered as a literal `apply-preset` segment directly
   * under the base `modifier-groups` path, so it never collides with
   * `:groupId`-parameterized routes below.
   */
  @Post('apply-preset')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async applyModifierPreset(
    @Param('productId') productId: string,
    @Body() dto: ApplyModifierPresetDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupResponseBody> {
    const result = await this.modifiersService.applyPresetToProduct({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      presetId: dto.presetId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'presetNotFound') {
      throw new NotFoundException(PRESET_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'alreadyApplied') {
      throw new ConflictException(PRESET_ALREADY_APPLIED_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch(':groupId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateModifierGroup(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateModifierGroupDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupResponseBody> {
    const result = await this.modifiersService.updateModifierGroup({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      name: dto.name,
      helperText: dto.helperText,
      status: dto.status,
      minimumSelections: dto.minimumSelections,
      maximumSelections: dto.maximumSelections,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidSelectionRange') {
      throw new BadRequestException(INVALID_SELECTION_RANGE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6B closeout, Section 3/4/6: "Delete" for a Custom Modifier Group --
   * hard DELETE, ONLY when it has never been referenced by a historical
   * Order (`ModifierGroupView.canDelete`). Never falls back to
   * deactivating -- the Staff UI simply should not offer this action when
   * `canDelete` is false; this is the server-side backstop.
   */
  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteModifierGroup(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.modifiersService.deleteModifierGroup({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasHistoricalReferences') {
      throw new ConflictException(HAS_HISTORICAL_REFERENCES_RESPONSE);
    }
  }

  /**
   * FT-6B closeout, Section 3/4: "Remove from Product" for a Preset-linked
   * Modifier Group -- ADAPTIVE: hard-deletes when historically safe, or
   * deactivates (preserving history) otherwise. Registered as a literal
   * `remove` segment, mirroring `apply-preset`'s own convention.
   */
  @Post(':groupId/remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async removeModifierGroupFromProduct(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: ModifierGroupView | null }> {
    const result = await this.modifiersService.removeModifierGroupFromProduct({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'deleted') {
      return { data: null };
    }
    return { data: result.data };
  }

  @Post(':groupId/options')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async createModifierOption(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateModifierOptionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierOptionResponseBody> {
    const result = await this.modifiersService.createModifierOption({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      name: dto.name,
      status: dto.status,
      priceAdjustment: dto.priceAdjustment,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  @Patch(':groupId/options/:optionId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async updateModifierOption(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateModifierOptionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierOptionResponseBody> {
    const result = await this.modifiersService.updateModifierOption({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
      name: dto.name,
      status: dto.status,
      priceAdjustment: dto.priceAdjustment,
      displayOrder: dto.displayOrder,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6B closeout, Section 3/4/6: "Delete" for a Custom Modifier Option --
   * hard DELETE, ONLY when it has never been referenced by a historical
   * Order (`ModifierOptionView.canDelete`). Applies equally to a Custom
   * Option added inside an otherwise Preset-linked Group -- only the
   * OPTION's own link determines this, never its parent Group's.
   */
  @Delete(':groupId/options/:optionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteModifierOption(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.modifiersService.deleteModifierOption({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'hasHistoricalReferences') {
      throw new ConflictException(HAS_HISTORICAL_REFERENCES_RESPONSE);
    }
  }

  /**
   * FT-6B, Section 5 "Reset to preset": re-adopts the linked Preset
   * Option's CURRENT price for this Product and clears the override flag.
   * A dedicated action rather than overloading `PATCH .../options/:optionId`
   * -- the target price is looked up server-side, never client-supplied
   * (Section 5: "Do not allow the client to become the pricing authority").
   */
  @Post(':groupId/options/:optionId/reset-price')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async resetModifierOptionPrice(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierOptionResponseBody> {
    const result = await this.modifiersService.resetModifierOptionPrice({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6A closeout (localization gap): returns EVERY existing
   * `ModifierGroupTranslation` row, raw -- see
   * `ProductsController.getProductTranslations`'s docstring for the full
   * rationale (identical shape/behavior).
   */
  @Get(':groupId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getModifierGroupTranslations(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupTranslationListResponseBody> {
    const result = await this.modifiersService.getModifierGroupTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6A closeout: full replacement of one Modifier Group Translation
   * resource -- see `ProductsController.putProductTranslation`'s docstring
   * for the full rationale (identical shape/behavior).
   */
  @Put(':groupId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putModifierGroupTranslation(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutModifierGroupTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierGroupTranslationResponseBody> {
    const result = await this.modifiersService.putModifierGroupTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      locale,
      name: dto.name,
      helperText: dto.helperText ?? null,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6A closeout: deletes one Modifier Group Translation resource -- see
   * `ProductsController.deleteProductTranslation`'s docstring for the full
   * rationale (identical shape/behavior).
   */
  @Delete(':groupId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteModifierGroupTranslation(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.modifiersService.deleteModifierGroupTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      locale,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }

  /**
   * FT-6A closeout (localization gap): returns EVERY existing
   * `ModifierOptionTranslation` row, raw.
   */
  @Get(':groupId/options/:optionId/translations')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  async getModifierOptionTranslations(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierOptionTranslationListResponseBody> {
    const result = await this.modifiersService.getModifierOptionTranslations({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6A closeout: full replacement of one Modifier Option Translation
   * resource.
   */
  @Put(':groupId/options/:optionId/translations/:locale')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async putModifierOptionTranslation(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Body() dto: PutModifierOptionTranslationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ModifierOptionTranslationResponseBody> {
    const result = await this.modifiersService.putModifierOptionTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
      locale,
      name: dto.name,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    return { data: result.data };
  }

  /**
   * FT-6A closeout: deletes one Modifier Option Translation resource.
   */
  @Delete(':groupId/options/:optionId/translations/:locale')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
  @RequirePermission(PERMISSIONS.MENU_MANAGE)
  async deleteModifierOptionTranslation(
    @Param('productId') productId: string,
    @Param('groupId') groupId: string,
    @Param('optionId') optionId: string,
    @Param('locale', LocaleParamPipe) locale: PlatformSupportedLocale,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.modifiersService.deleteModifierOptionTranslation({
      restaurantId: request.restaurantAccess.restaurantId,
      productId,
      groupId,
      optionId,
      locale,
    });
    if (result.outcome === 'productNotFound') {
      throw new NotFoundException(PRODUCT_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'groupNotFound') {
      throw new NotFoundException(GROUP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'optionNotFound') {
      throw new NotFoundException(OPTION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'localeNotActive') {
      throw new ConflictException(LOCALE_NOT_ACTIVE_RESPONSE);
    }
    if (result.outcome === 'defaultTranslationRequired') {
      throw new ConflictException(DEFAULT_TRANSLATION_REQUIRED_RESPONSE);
    }
  }
}
