import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthContextService } from './context/auth-context.service';
import { BranchAccessService } from './context/branch-access.service';
import { RestaurantAccessService } from './context/restaurant-access.service';
import { AuthGuard } from './guard/auth.guard';
import { BranchAccessGuard } from './guard/branch-access.guard';
import { RestaurantAccessGuard } from './guard/restaurant-access.guard';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { MeController } from './me/me.controller';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, login, HTTP login transport, cookie-session
 * AuthGuard, read-only /auth/me authorization context, and Restaurant/Branch
 * Tenant-scope enforcement (Auth Foundation A-F, Authorization Foundation
 * G). No CurrentUser/CurrentRestaurant decorator, no Permission guard yet --
 * that belongs to a later slice. Kept explicit (not global), matching
 * DatabaseModule. None of these guards are registered as a global
 * APP_GUARD: most V1 routes (login, public QR, guest menu, guest AI) are
 * intentionally unauthenticated/untenanted, so protection is applied
 * explicitly per controller/route with
 * `@UseGuards(AuthGuard, RestaurantAccessGuard, BranchAccessGuard)`.
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
    RestaurantAccessService,
    BranchAccessService,
    RestaurantAccessGuard,
    BranchAccessGuard,
  ],
  // SessionTokenService and PasswordHasherService are internal
  // implementation details, only consumed inside this module. The rest are
  // exported for future feature modules that need to authenticate, resolve
  // sessions, read authorization context, or enforce Restaurant/Branch
  // scope.
  exports: [
    AuthSessionService,
    LoginService,
    AuthGuard,
    AuthContextService,
    RestaurantAccessService,
    BranchAccessService,
    RestaurantAccessGuard,
    BranchAccessGuard,
  ],
})
export class AuthModule {}
