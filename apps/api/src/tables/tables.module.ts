import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

/**
 * Business Foundation L3: first Table feature module. Imports AuthModule
 * for the already-exported AuthGuard/CsrfGuard/RestaurantAccessGuard/
 * BranchManagementAccessGuard/PermissionGuard -- this module never
 * redefines authentication, Tenant, Branch, or Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
