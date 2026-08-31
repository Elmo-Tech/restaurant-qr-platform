import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session + password-hashing infrastructure only (Auth Foundation A + B).
 * No controllers, guards, cookies, or Restaurant/Branch authorization yet.
 * Kept explicit (not global), matching DatabaseModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [SessionTokenService, AuthSessionService, PasswordHasherService],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details; future HTTP/use-case code (e.g. Login) will
  // need PasswordHasherService directly and can be added to this list once
  // that slice actually consumes it.
  exports: [AuthSessionService],
})
export class AuthModule {}
