import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';

/**
 * FT-3: the public, unauthenticated Guest QR Menu. Deliberately imports
 * only `DatabaseModule` -- unlike `MenuModule`, this never imports
 * `AuthModule` (no guards apply to anything in here at all) or
 * `StorageModule` (Public Menu only ever reads an already-persisted
 * `imageAssetPath`/`primaryImageAssetPath`, it never uploads).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicMenuController],
  providers: [PublicMenuService],
})
export class PublicModule {}
