import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthGuard } from './guard/auth.guard';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, login, HTTP login transport, and cookie-session
 * AuthGuard (Auth Foundation A-E). No CurrentUser decorator, /auth/me, or
 * Restaurant/Branch/Permission authorization yet -- those belong to a later
 * slice. Kept explicit (not global), matching DatabaseModule. AuthGuard is
 * NOT registered as a global APP_GUARD: most V1 routes (login, public QR,
 * guest menu, guest AI) are intentionally unauthenticated, so protection is
 * applied explicitly per controller/route with `@UseGuards(AuthGuard)`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [LoginController],
  providers: [
    SessionTokenService,
    AuthSessionService,
    PasswordHasherService,
    LoginService,
    AuthGuard,
  ],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details, only consumed inside this module.
  // AuthSessionService, LoginService, and AuthGuard are exported for future
  // feature modules that need to authenticate or resolve sessions.
  exports: [AuthSessionService, LoginService, AuthGuard],
})
export class AuthModule {}
