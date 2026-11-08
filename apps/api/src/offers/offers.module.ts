import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { StorageModule } from '../storage/storage.module';
import { OffersController } from './offers.controller';
import { OffersFeatureGuard } from './offers-feature.guard';
import { OffersService } from './offers.service';

/** Offers / Bundles (DEC-069): Staff management. The Guest menu and order creation read Offers through their own services. */
@Module({
  imports: [DatabaseModule, AuthModule, EntitlementsModule, StorageModule],
  controllers: [OffersController],
  providers: [OffersService, OffersFeatureGuard],
})
export class OffersModule {}
