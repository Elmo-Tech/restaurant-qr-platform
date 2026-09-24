import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from './health.controller';

/** FT-9: `/health` and `/ready` probes. */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
