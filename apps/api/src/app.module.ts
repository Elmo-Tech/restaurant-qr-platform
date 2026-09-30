import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveryModule } from './delivery/delivery.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { HealthModule } from './health/health.module';
import { QrModule } from './qr/qr.module';
import { PublicModule } from './public/public.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { StaffModule } from './staff/staff.module';
import { TablesModule } from './tables/tables.module';

// This repository owns a single root-level .env / .env.example. Resolving
// it relative to this file's own location (rather than process.cwd()) keeps
// loading correct whether the API is started from the repository root or
// from apps/api directly, and mirrors the same convention used by
// apps/api/prisma.config.ts.
const rootEnvFilePath = path.resolve(__dirname, '..', '..', '..', '.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: rootEnvFilePath,
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    BranchesModule,
    TablesModule,
    StaffModule,
    MenuModule,
    OrdersModule,
    DashboardModule,
    DeliveryModule,
    QrModule,
    RateLimitModule,
    HealthModule,
    PublicModule,
    RestaurantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
