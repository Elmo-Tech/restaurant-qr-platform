import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
