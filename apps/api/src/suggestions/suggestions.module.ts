import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

/** Smart suggestions (DEC-042): Staff configuration. The Guest endpoint lives in `PublicModule`. */
@Module({
  imports: [DatabaseModule, AuthModule, EntitlementsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
