import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { GenericQrController } from './generic-qr.controller';
import { GenericQrService } from './generic-qr.service';

/** FT-9: Restaurant-wide Generic QR management. Imports AuthModule for the already-exported guards -- never redefines auth/tenant/permission policy. */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [GenericQrController],
  providers: [GenericQrService],
})
export class QrModule {}
