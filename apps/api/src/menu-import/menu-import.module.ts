import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { MenuImportController } from './menu-import.controller';
import {
  MenuImportExtractor,
  N8nMenuImportExtractor,
} from './menu-import-extractor';
import { MenuImportService } from './menu-import.service';

/** Menu Import (DEC-040): create Menu content from an uploaded image, PDF or Excel file. */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MenuImportController],
  providers: [
    MenuImportService,
    { provide: MenuImportExtractor, useClass: N8nMenuImportExtractor },
  ],
})
export class MenuImportModule {}
