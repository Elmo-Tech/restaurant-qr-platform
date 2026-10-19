import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { PlatformBillingController } from './billing/platform-billing.controller';
import { PlatformBillingService } from './billing/platform-billing.service';
import { SubscriptionSyncService } from './billing/subscription-sync.service';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard, PlatformCsrfGuard } from './platform-guards';
import { PlatformRequestsController } from './requests/platform-requests.controller';
import { PlatformRequestsService } from './requests/platform-requests.service';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformPackagesService } from './platform-packages.service';
import { PlatformRestaurantCreationService } from './platform-restaurant-creation.service';
import { PlatformRestaurantsService } from './platform-restaurants.service';
import { PlatformController } from './platform.controller';

/**
 * The platform control dashboard's backend (DEC-045): Platform Administrator login and the
 * cross-restaurant management routes. It imports `AuthModule` only for the password hasher and the
 * opaque-token primitive; Restaurant Staff authentication is never used here.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    PlatformController,
    PlatformBillingController,
    PlatformRequestsController,
  ],
  providers: [
    PlatformAuthService,
    PlatformAuthGuard,
    PlatformCsrfGuard,
    PlatformAuditService,
    PlatformAdminsService,
    PlatformRestaurantsService,
    PlatformRestaurantCreationService,
    PlatformPackagesService,
    PlatformOverviewService,
    PlatformBillingService,
    SubscriptionSyncService,
    PlatformRequestsService,
  ],
  // the restaurant-facing "My subscription" module records its requests in the same audit log
  exports: [PlatformAuditService],
})
export class PlatformModule {}
