import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PromotionContextualPreviewService } from './promotion-contextual-preview.service';
import { PromotionPreviewService } from './promotion-preview.service';
import { PromotionTargetsService } from './promotion-targets.service';
import { PromotionsFeatureGuard } from './promotions-feature.guard';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule, DatabaseModule, EntitlementsModule],
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    PromotionTargetsService,
    PromotionPreviewService,
    PromotionContextualPreviewService,
    PromotionsFeatureGuard,
  ],
})
export class PromotionsModule {}
