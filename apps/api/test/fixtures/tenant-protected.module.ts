import { Module } from '@nestjs/common';
import { AuthModule } from '../../src/auth/auth.module';
import { TenantProtectedTestController } from './tenant-protected.controller';

/**
 * TEST-ONLY module wiring `TenantProtectedTestController` in for e2e
 * coverage of RestaurantAccessGuard/BranchAccessGuard. Imported only by
 * `authorization-http.e2e-spec.ts`'s Nest testing module alongside the real
 * `AppModule` -- never part of the production application.
 */
@Module({
  imports: [AuthModule],
  controllers: [TenantProtectedTestController],
})
export class TenantProtectedTestModule {}
