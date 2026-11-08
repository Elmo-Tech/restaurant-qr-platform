import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { WhatsappTrackingModule } from '../whatsapp-tracking/whatsapp-tracking.module';
import { PublicLandingController } from './public-landing.controller';
import { PublicLandingService } from './public-landing.service';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';
import { PublicOrderTrackingController } from './public-order-tracking.controller';
import { PublicOrderTrackingService } from './public-order-tracking.service';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';
import { PublicSuggestionsController } from './public-suggestions.controller';
import { PublicSuggestionsService } from './public-suggestions.service';

/**
 * FT-3/FT-5: the public, unauthenticated Guest QR Menu + Guest Order
 * creation. Deliberately imports only `DatabaseModule` -- unlike
 * `MenuModule`/`OrdersModule`, this never imports `AuthModule` (no guards
 * apply to anything in here at all) or `StorageModule` (Public Menu only
 * ever reads an already-persisted `imageAssetPath`/`primaryImageAssetPath`,
 * it never uploads).
 */
@Module({
  imports: [DatabaseModule, EntitlementsModule, WhatsappTrackingModule],
  controllers: [
    PublicMenuController,
    PublicOrdersController,
    PublicOrderTrackingController,
    PublicSuggestionsController,
    PublicLandingController,
  ],
  providers: [
    PublicMenuService,
    PublicOrdersService,
    PublicOrderTrackingService,
    PublicSuggestionsService,
    PublicLandingService,
  ],
})
export class PublicModule {}
