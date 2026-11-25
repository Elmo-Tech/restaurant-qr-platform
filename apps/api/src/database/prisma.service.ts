import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaClient } from '../generated/prisma/client';
import { assertUtcSession, createPrismaPgAdapter } from './postgres-connection';

/**
 * Prisma 7 requires a driver adapter for PostgreSQL; DATABASE_URL comes from
 * the already-validated ConfigService rather than process.env directly, so
 * this stays consistent with the single Zod-validated configuration source
 * (see src/config/env.schema.ts). Every pooled connection runs with session
 * TimeZone UTC whatever the server default is (see postgres-connection.ts).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService<EnvConfig, true>) {
    const connectionString = configService.get('DATABASE_URL', {
      infer: true,
    });

    super({ adapter: createPrismaPgAdapter(connectionString) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await assertUtcSession(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
