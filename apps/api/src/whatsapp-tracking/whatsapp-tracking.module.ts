import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappTrackingController, WhatsappTrackingWebhookController } from './whatsapp-tracking.controller';
import { WhatsappTrackingService } from './whatsapp-tracking.service';
@Module({
  imports:[DatabaseModule,EntitlementsModule,AuthModule],
  controllers:[WhatsappTrackingController,WhatsappTrackingWebhookController],
  providers:[WhatsappTrackingService], exports:[WhatsappTrackingService],
})
export class WhatsappTrackingModule {}
