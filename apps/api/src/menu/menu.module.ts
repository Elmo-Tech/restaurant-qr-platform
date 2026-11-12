import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { GuestMenuLinkController } from './guest-menu-link.controller';
import { GuestMenuLinkService } from './guest-menu-link.service';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';
import { ModifierPresetsController } from './modifier-presets.controller';
import { ModifierPresetsService } from './modifier-presets.service';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from './modifiers.service';
import { ModifierSizeSettingsService } from './modifier-size-settings.service';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Day 1 Menu Vertical Slice, Batch C/D: Menu + Category + Product backend,
 * one cohesive module (mirrors StaffModule holding both Membership List and
 * Invitation Creation together). Imports AuthModule for the already-exported
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard/
 * AllBranchesRequiredGuard -- this module never redefines authentication,
 * Tenant, or Permission policy. FT-2: imports StorageModule for
 * `ImageStorageService`, used by `ProductsController`/`CategoriesController`
 * image upload/remove routes.
 */
@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [
    MenusController,
    CategoriesController,
    ProductsController,
    ModifiersController,
    ModifierPresetsController,
    ProductVariantsController,
    GuestMenuLinkController,
  ],
  providers: [
    MenusService,
    CategoriesService,
    ProductsService,
    ModifiersService,
    ModifierSizeSettingsService,
    ModifierPresetsService,
    ProductVariantsService,
    GuestMenuLinkService,
  ],
})
export class MenuModule {}
