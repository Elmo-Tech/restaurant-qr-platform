import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StaffController } from './staff.controller';
import { StaffInvitationsController } from './staff-invitations.controller';
import { StaffInvitationsService } from './staff-invitations.service';
import { StaffService } from './staff.service';

/**
 * Business Foundation R: first Staff/Team business module. Business
 * Foundation S adds Staff Invitation Creation into this same module for
 * cohesion (settled contract #27) rather than a separate top-level
 * invitations module. Imports AuthModule for the already-exported
 * AuthGuard/CsrfGuard/RestaurantAccessGuard/PermissionGuard/
 * SessionTokenService -- this module never redefines authentication,
 * Tenant, Permission, or token-primitive policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StaffController, StaffInvitationsController],
  providers: [StaffService, StaffInvitationsService],
})
export class StaffModule {}
