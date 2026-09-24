import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DeliveryZonesController } from './delivery-zones.controller';
import { DeliveryZonesService } from './delivery-zones.service';

/**
 * FT-8: Staff management of Branch Delivery zones. Imports AuthModule for
 * the already-exported guards -- this module never redefines authentication,
 * Tenant, or Permission policy.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DeliveryZonesController],
  providers: [DeliveryZonesService],
})
export class DeliveryModule {}
