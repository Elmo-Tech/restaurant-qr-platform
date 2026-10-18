import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { StorageModule } from '../storage/storage.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantLocalesService } from './restaurant-locales.service';
import { RestaurantProfileController } from './restaurant-profile.controller';
import { RestaurantProfileService } from './restaurant-profile.service';

/**
 * LOC-2A, approved LOC-1 contract: Restaurant Language Settings. Imports
 * AuthModule for the already-exported AuthGuard/CsrfGuard/
 * RestaurantAccessGuard/PermissionGuard/AllBranchesRequiredGuard -- this
 * module never redefines authentication, Tenant, or Permission policy.
 *
 * FT-12: Restaurant Profile (name, logo) added alongside Language Settings
 * -- same Restaurant-wide-mutation Tenant/guard policy, so it lives in this
 * same module rather than a parallel one. `StorageModule` provides the
 * shared `ImageStorageService` the logo upload route reuses unchanged
 * (never a second image-storage implementation).
 */
@Module({
  imports: [DatabaseModule, AuthModule, StorageModule, EntitlementsModule],
  controllers: [RestaurantsController, RestaurantProfileController],
  providers: [RestaurantLocalesService, RestaurantProfileService],
})
export class RestaurantsModule {}
