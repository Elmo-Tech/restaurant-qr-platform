import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TableSessionsController } from './table-sessions.controller';
import { TableSessionsService } from './table-sessions.service';

/**
 * Staff Table Session module (design v3): reads, manual open, close and the
 * payment ledger. Imports `AuthModule` for the already-exported guards and
 * `BranchAccessService`, reused for per-session Branch scope exactly like
 * Orders -- never a new authorization mechanism.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TableSessionsController],
  providers: [TableSessionsService],
})
export class TableSessionsModule {}
