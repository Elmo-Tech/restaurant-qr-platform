import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
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
import { EditorialTemplateSettingsDto } from './dto/editorial-template-settings.dto';
import { EditorialTemplateConfigService } from './editorial-template-config.service';
import type { EditorialTemplateSettings } from './editorial-template-config';

/** Exactly the same authorization and restaurant-wide scope as template selection. */
@Controller('restaurants/:restaurantId/editorial-template')
@UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
@RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
export class EditorialTemplateConfigController {
  constructor(
    private readonly configs: EditorialTemplateConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async assertAllowed(restaurantId: string): Promise<void> {
    if (!(await this.entitlements.templatesFor(restaurantId)).includes('EDITORIAL')) {
      throw featureNotAvailableException(new FeatureNotAvailableError('MENU_TEMPLATES'));
    }
  }

  @Get()
  async get(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: EditorialTemplateSettings }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAllowed(id);
    return { data: await this.configs.get(id) };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async save(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: EditorialTemplateSettingsDto,
  ): Promise<{ data: EditorialTemplateSettings }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAllowed(id);
    return { data: await this.configs.save(id, dto.priceDisplay) };
  }
}
