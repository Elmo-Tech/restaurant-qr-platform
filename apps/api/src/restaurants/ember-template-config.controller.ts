import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { EmberTemplateSettingsDto } from './dto/ember-template-settings.dto';
import {
  EmberTemplateConfigService,
  type EmberConfigView,
} from './ember-template-config.service';

/** Staff-only EMBER settings with the exact same restaurant-wide scope as template selection. */
@Controller('restaurants/:restaurantId/ember-template')
@UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard)
@RequirePermission(PERMISSIONS.RESTAURANT_MANAGE)
export class EmberTemplateConfigController {
  constructor(
    private readonly configs: EmberTemplateConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async assertAvailable(restaurantId: string): Promise<void> {
    const allowed = await this.entitlements.templatesFor(restaurantId);
    if (!allowed.includes('EMBER')) {
      throw featureNotAvailableException(new FeatureNotAvailableError('MENU_TEMPLATES'));
    }
  }

  @Get()
  async get(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: EmberConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.get(id) };
  }

  @Patch('draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async saveDraft(
    @Req() request: RestaurantAuthorizedRequest,
    @Body() dto: EmberTemplateSettingsDto,
  ): Promise<{ data: EmberConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.saveDraft(id, dto) };
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async publish(@Req() request: RestaurantAuthorizedRequest): Promise<{ data: EmberConfigView }> {
    const id = request.restaurantAccess.restaurantId;
    await this.assertAvailable(id);
    return { data: await this.configs.publish(id) };
  }
}
