import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsService } from './entitlements.service';

/** Feature entitlements (DEC-043). Imports only the database, so any module can use it without cycles. */
@Module({
  imports: [DatabaseModule],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
