import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthContextService } from './context/auth-context.service';
import { BranchAccessService } from './context/branch-access.service';
import { RestaurantAccessService } from './context/restaurant-access.service';
import { CsrfGuard } from './csrf/csrf.guard';
import { AllBranchesRequiredGuard } from './guard/all-branches-required.guard';
import { AuthGuard } from './guard/auth.guard';
import { BranchAccessGuard } from './guard/branch-access.guard';
import { BranchManagementAccessGuard } from './guard/branch-management-access.guard';
import { PermissionGuard } from './guard/permission.guard';
import { RestaurantAccessGuard } from './guard/restaurant-access.guard';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { LogoutController } from './logout/logout.controller';
import { MeController } from './me/me.controller';
import { PasswordHasherService } from './password/password-hasher.service';
import { AuthSessionService } from './session/auth-session.service';
import { SessionTokenService } from './session/session-token.service';

/**
 * Session, password-hashing, login, HTTP login transport, cookie-session
 * AuthGuard, read-only /auth/me authorization context, Restaurant/Branch
 * Tenant-scope enforcement, fixed V1 Role/Permission enforcement, the
 * reusable Staff cookie-mutation CSRF boundary, and Staff logout (Auth
 * Foundation A-F, Authorization Foundation G-H, Auth Foundation I). Business
 * Foundation S adds Staff Invitation Creation (INVITATION-ONLY: never
 * creates or mutates a User or RestaurantMembership). Staff Membership
 * mutation, ownership transfer, and last-OWNER logic remain future work.
 * Kept explicit (not global), matching
 * DatabaseModule. None of these guards are registered as a global
 * APP_GUARD: most V1 routes (login, public QR, guest menu, guest AI) are
 * intentionally unauthenticated/untenanted, so protection is applied
 * explicitly per controller/route. Every unsafe (state-changing)
 * cookie-authenticated Staff mutation requires AuthGuard and CsrfGuard
 * together with whatever Restaurant/Branch/Permission guards that route
 * also needs -- for a Tenant-scoped mutation that is AuthGuard,
 * RestaurantAccessGuard, BranchAccessGuard, PermissionGuard, and CsrfGuard
 * (AUTH_TENANCY_SPEC.md #65, #106A; the exact relative order of CsrfGuard
 * against the Tenant/Branch/Permission guards is not globally settled by
 * that documentation -- it is settled per mutation as each is implemented).
 * Logout carries no Tenant/Branch/Permission context, so its settled order
 * is exactly `@UseGuards(AuthGuard, CsrfGuard)` (AUTH_TENANCY_SPEC.md
 * #28A). Business Foundation K's Create Branch settled its own order as
 * `AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard,
 * AllBranchesRequiredGuard` (DATABASE_SPEC.md / AUTH_TENANCY_SPEC.md
 * Foundation K section) -- `AllBranchesRequiredGuard` enforces the
 * Restaurant-structural-authority rule that a Branch-scoped Membership
 * (`allBranches = false`) must never gain Restaurant-wide authority merely
 * because its Role holds a relevant Permission. Business Foundation L2 adds
 * `BranchManagementAccessGuard` alongside the existing `BranchAccessGuard`:
 * both enforce identical Branch identity/Membership-scope rules, but
 * `BranchAccessGuard` additionally requires `Branch.status === 'ACTIVE'`
 * (OPERATIONAL access, for ordinary Branch-scoped business operations),
 * while `BranchManagementAccessGuard` does not (MANAGEMENT access, for
 * Staff configuration mutations against a Branch that may still be
 * `INACTIVE`, e.g. adding a Table) -- see AUTH_TENANCY_SPEC.md #65D. The two
 * guards are never combined on the same route.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [LoginController, LogoutController, MeController],
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
    BranchManagementAccessGuard,
    PermissionGuard,
    CsrfGuard,
    AllBranchesRequiredGuard,
  ],
  // PasswordHasherService is an internal implementation detail, only
  // consumed inside this module. The rest are exported for future feature
  // modules that need to authenticate, resolve sessions, read authorization
  // context, enforce Restaurant/Branch/Permission/CSRF/structural-authority
  // scope, or generate/hash a generic opaque token. SessionTokenService is
  // exported starting with Business Foundation S, which reuses its generic
  // random-token/hash primitive for Staff Invitation tokens -- the same
  // reasoning AuthSessionService already relies on it for internally.
  exports: [
    AuthSessionService,
    LoginService,
    AuthGuard,
    AuthContextService,
    RestaurantAccessService,
    BranchAccessService,
    RestaurantAccessGuard,
    BranchAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
    CsrfGuard,
    AllBranchesRequiredGuard,
    SessionTokenService,
  ],
})
export class AuthModule {}
