import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';

/**
 * FT-3/FT-5: the public, unauthenticated Guest QR Menu + Guest Order
 * creation. Deliberately imports only `DatabaseModule` -- unlike
 * `MenuModule`/`OrdersModule`, this never imports `AuthModule` (no guards
 * apply to anything in here at all) or `StorageModule` (Public Menu only
 * ever reads an already-persisted `imageAssetPath`/`primaryImageAssetPath`,
 * it never uploads).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicMenuController, PublicOrdersController],
  providers: [PublicMenuService, PublicOrdersService],
})
export class PublicModule {}
