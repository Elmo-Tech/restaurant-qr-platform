import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { FoodLibraryService } from './food-library/food-library.service';
import { PlatformFoodImagesController, PlatformFoodTagsController } from './food-library/food-library.controller';
import { AiSettingsModule } from '../ai-settings/ai-settings.module';
import { DemoModule } from '../demo/demo.module';
import { PlatformAiController } from './platform-ai.controller';
import { PlatformDemoController } from './platform-demo.controller';
import { PlatformAiService } from './platform-ai.service';
import { PlatformBillingController } from './billing/platform-billing.controller';
import { PlatformBillingService } from './billing/platform-billing.service';
import { SubscriptionSyncService } from './billing/subscription-sync.service';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard, PlatformCsrfGuard } from './platform-guards';
import { PlatformLeadsController } from './leads/platform-leads.controller';
import { PlatformLeadsService } from './leads/platform-leads.service';
import { PlatformRequestsController } from './requests/platform-requests.controller';
import { PlatformRequestsService } from './requests/platform-requests.service';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformPackagesService } from './platform-packages.service';
import { PlatformPublicSettingsService } from './platform-public-settings.service';
import { PlatformTrialSettingsService } from './platform-trial-settings.service';
import { PlatformRestaurantCreationService } from './platform-restaurant-creation.service';
import { PlatformRestaurantsService } from './platform-restaurants.service';
import { PlatformController } from './platform.controller';

/**
 * The platform control dashboard's backend (DEC-045): Platform Administrator login and the
 * cross-restaurant management routes. It imports `AuthModule` only for the password hasher and the
 * opaque-token primitive; Restaurant Staff authentication is never used here.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AiSettingsModule, DemoModule, StorageModule],
  controllers: [
    PlatformController,
    PlatformFoodImagesController,
    PlatformFoodTagsController,
    PlatformAiController,
    PlatformDemoController,
    PlatformBillingController,
    PlatformRequestsController,
    PlatformLeadsController,
  ],
  providers: [
    PlatformAuthService,
    PlatformAuthGuard,
    PlatformCsrfGuard,
    PlatformAuditService,
    FoodLibraryService,
    PlatformAdminsService,
    PlatformRestaurantsService,
    PlatformRestaurantCreationService,
    PlatformPackagesService,
    PlatformPublicSettingsService,
    PlatformTrialSettingsService,
    PlatformAiService,
    PlatformOverviewService,
    PlatformBillingService,
    SubscriptionSyncService,
    PlatformRequestsService,
    PlatformLeadsService,
  ],
  // the restaurant-facing "My subscription" module records its requests in the same audit log
  exports: [PlatformAuditService],
})
export class PlatformModule {}
