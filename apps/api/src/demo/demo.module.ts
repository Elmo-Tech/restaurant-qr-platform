import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DemoController } from './demo.controller';
import { DemoExpiryService } from './demo-expiry.service';
import { DemoRestrictionsMiddleware } from './demo-restrictions.middleware';
import { DemoService } from './demo.service';

/** Temporary demo restaurants (DEC-060): create from the template, enter by a secret link, restrict, expire, purge. */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DemoController],
  providers: [DemoService, DemoExpiryService, DemoRestrictionsMiddleware],
  exports: [DemoService],
})
export class DemoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(DemoRestrictionsMiddleware).forRoutes('*');
  }
}
