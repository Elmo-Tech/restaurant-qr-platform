import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Kept explicit (not global): DatabaseModule has no other domain modules
 * consuming it yet, so there is no demonstrated repeated-wiring pain to
 * justify a global module. Revisit once real feature modules need it.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
