import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthContextService } from './context/auth-context.service';
import { AuthGuard } from './guard/auth.guard';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { MeController } from './me/me.controller';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, login, HTTP login transport, cookie-session
 * AuthGuard, and read-only /auth/me authorization context (Auth Foundation
 * A-F). No CurrentUser/CurrentRestaurant decorator, no permission/
 * Restaurant/Branch enforcement guards yet -- those belong to a later
 * slice. Kept explicit (not global), matching DatabaseModule. AuthGuard is
 * NOT registered as a global APP_GUARD: most V1 routes (login, public QR,
 * guest menu, guest AI) are intentionally unauthenticated, so protection is
 * applied explicitly per controller/route with `@UseGuards(AuthGuard)`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [LoginController, MeController],
  providers: [
    SessionTokenService,
    AuthSessionService,
    PasswordHasherService,
    LoginService,
    AuthGuard,
    AuthContextService,
  ],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details, only consumed inside this module.
  // AuthSessionService, LoginService, AuthGuard, and AuthContextService are
  // exported for future feature modules that need to authenticate, resolve
  // sessions, or read authorization context.
  exports: [AuthSessionService, LoginService, AuthGuard, AuthContextService],
})
export class AuthModule {}
