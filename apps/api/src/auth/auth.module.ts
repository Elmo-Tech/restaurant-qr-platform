import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LoginService } from './login/login.service';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, and login infrastructure only (Auth Foundation
 * A + B + C). No controllers, guards, cookies, or Restaurant/Branch
 * authorization yet. Kept explicit (not global), matching DatabaseModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    SessionTokenService,
    AuthSessionService,
    PasswordHasherService,
    LoginService,
  ],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details, only consumed inside this module.
  // AuthSessionService and LoginService are exported for the future HTTP
  // login/session slice.
  exports: [AuthSessionService, LoginService],
})
export class AuthModule {}
