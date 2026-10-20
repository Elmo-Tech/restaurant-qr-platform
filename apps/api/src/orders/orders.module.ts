import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * FT-5: the Staff-facing Order module. Imports `AuthModule` for the
 * already-exported guards (`AuthGuard`/`CsrfGuard`/`RestaurantAccessGuard`/
 * `PermissionGuard`) and for `BranchAccessService`, reused directly by
 * `OrdersService` for per-Order Branch-scope resolution (Section 15/17) --
 * never a new Branch authorization mechanism.
 */
@Module({
  imports: [DatabaseModule, AuthModule, EntitlementsModule],
  controllers: [OrdersController, KitchenController],
  providers: [OrdersService, KitchenService],
})
export class OrdersModule {}
