import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

/**
 * Day 1 Menu Vertical Slice, Batch C: Menu + Category backend, one cohesive
 * module (mirrors StaffModule holding both Membership List and Invitation
 * Creation together). Imports AuthModule for the already-exported
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard/
 * AllBranchesRequiredGuard -- this module never redefines authentication,
 * Tenant, or Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MenusController, CategoriesController],
  providers: [MenusService, CategoriesService],
})
export class MenuModule {}
