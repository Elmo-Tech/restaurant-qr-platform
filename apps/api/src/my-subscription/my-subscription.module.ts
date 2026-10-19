import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { PlatformModule } from '../platform/platform.module';
import { MySubscriptionController } from './my-subscription.controller';
import { MySubscriptionService } from './my-subscription.service';

/** "My subscription" and upgrade requests of a Restaurant (DEC-050). Requests are audited through the platform's log. */
@Module({
  imports: [DatabaseModule, AuthModule, PlatformModule],
  controllers: [MySubscriptionController],
  providers: [MySubscriptionService],
})
export class MySubscriptionModule {}
