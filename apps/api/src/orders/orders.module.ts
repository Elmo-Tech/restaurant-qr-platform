import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
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
  imports: [DatabaseModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
