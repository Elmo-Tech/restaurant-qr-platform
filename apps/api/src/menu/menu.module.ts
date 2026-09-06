import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Day 1 Menu Vertical Slice, Batch C/D: Menu + Category + Product backend,
 * one cohesive module (mirrors StaffModule holding both Membership List and
 * Invitation Creation together). Imports AuthModule for the already-exported
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard/
 * AllBranchesRequiredGuard -- this module never redefines authentication,
 * Tenant, or Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MenusController, CategoriesController, ProductsController],
  providers: [MenusService, CategoriesService, ProductsService],
})
export class MenuModule {}
