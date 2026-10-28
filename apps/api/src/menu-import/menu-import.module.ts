import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { MenuImportController } from './menu-import.controller';
import {
  MenuImportExtractor,
  N8nMenuImportExtractor,
} from './menu-import-extractor';
import { MenuImportService } from './menu-import.service';

/** Menu Import (DEC-040, DEC-057): create Menu content from uploaded images, a PDF or an Excel file; a platform feature. */
@Module({
  imports: [DatabaseModule, AuthModule, EntitlementsModule],
  controllers: [MenuImportController],
  providers: [
    MenuImportService,
    { provide: MenuImportExtractor, useClass: N8nMenuImportExtractor },
  ],
})
export class MenuImportModule {}
