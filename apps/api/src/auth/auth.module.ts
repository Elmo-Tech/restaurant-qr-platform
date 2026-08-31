import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session infrastructure only (Auth Foundation A). No controllers, guards,
 * cookies, or Restaurant/Branch authorization yet. Kept explicit (not
 * global), matching DatabaseModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [SessionTokenService, AuthSessionService],
  // SessionTokenService is an internal implementation detail of
  // AuthSessionService; future HTTP/use-case code only needs the latter.
  exports: [AuthSessionService],
})
export class AuthModule {}
