import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, login, and HTTP login transport (Auth
 * Foundation A + B + C + D). No AuthGuard, CurrentUser decorator, or
 * Restaurant/Branch authorization yet -- those belong to a later slice.
 * Kept explicit (not global), matching DatabaseModule.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [LoginController],
  providers: [
    SessionTokenService,
    AuthSessionService,
    PasswordHasherService,
    LoginService,
  ],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details, only consumed inside this module.
  // AuthSessionService and LoginService are exported for a future
  // AuthGuard / session-resolution slice.
  exports: [AuthSessionService, LoginService],
})
export class AuthModule {}
