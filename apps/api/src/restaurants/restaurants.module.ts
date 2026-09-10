import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantLocalesService } from './restaurant-locales.service';

/**
 * LOC-2A, approved LOC-1 contract: Restaurant Language Settings. Imports
 * AuthModule for the already-exported AuthGuard/CsrfGuard/
 * RestaurantAccessGuard/PermissionGuard/AllBranchesRequiredGuard -- this
 * module never redefines authentication, Tenant, or Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RestaurantsController],
  providers: [RestaurantLocalesService],
})
export class RestaurantsModule {}
