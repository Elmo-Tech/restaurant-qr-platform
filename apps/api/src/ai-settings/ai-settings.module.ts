import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AiSettingsService } from './ai-settings.service';

/** The AI settings and model keys managed from the Platform console (DEC-059). */
@Module({
  imports: [DatabaseModule],
  providers: [AiSettingsService],
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
