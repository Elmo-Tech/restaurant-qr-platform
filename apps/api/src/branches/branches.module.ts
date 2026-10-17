import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BranchHoursController } from './branch-hours.controller';
import { BranchHoursService } from './branch-hours.service';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

/**
 * Business Foundation J: first production Staff business vertical module.
 * Imports AuthModule for the already-exported AuthGuard/RestaurantAccessGuard/
 * PermissionGuard -- this module never redefines authentication, Tenant, or
 * Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BranchesController, BranchHoursController],
  providers: [BranchesService, BranchHoursService],
})
export class BranchesModule {}
