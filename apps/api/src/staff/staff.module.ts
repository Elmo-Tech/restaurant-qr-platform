import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/**
 * Business Foundation R: first Staff/Team business module. Imports
 * AuthModule for the already-exported AuthGuard/RestaurantAccessGuard/
 * PermissionGuard -- this module never redefines authentication, Tenant, or
 * Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
