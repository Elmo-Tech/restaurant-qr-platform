import { Module } from '@nestjs/common';
import { AiSettingsModule } from '../ai-settings/ai-settings.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GeminiMenuExtractor } from './direct/gemini-menu-extractor';
import { MenuImportController } from './menu-import.controller';
import {
  MenuImportExtractor,
  N8nMenuImportExtractor,
} from './menu-import-extractor';
import { MenuImportExtractorRouter } from './menu-import-extractor-router';
import { MenuImportService } from './menu-import.service';

/**
 * Menu Import (DEC-040, DEC-057, DEC-059): create Menu content from uploaded images, a PDF or an Excel file; a
 * platform feature. The extraction engine (n8n, or the Backend calling the model) is chosen in the console.
 */
@Module({
  imports: [DatabaseModule, AuthModule, EntitlementsModule, AiSettingsModule],
  controllers: [MenuImportController],
  providers: [
    MenuImportService,
    N8nMenuImportExtractor,
    GeminiMenuExtractor,
    { provide: MenuImportExtractor, useClass: MenuImportExtractorRouter },
  ],
})
export class MenuImportModule {}
