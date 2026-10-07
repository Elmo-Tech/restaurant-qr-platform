import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffMembershipDto } from './dto/update-staff-membership.dto';
import { StaffProvisioningService } from './staff-provisioning.service';
import {
  ROLE_EXCEEDS_AUTHORITY_RESPONSE,
  ROLE_NOT_ASSIGNABLE_RESPONSE,
  ROLE_NOT_FOUND_RESPONSE,
} from './staff-role-errors';
import { StaffService } from './staff.service';
import type { StaffMembershipListItem } from './staff.service';

interface StaffMembershipListResponseBody {
  data: StaffMembershipListItem[];
}

interface StaffMembershipResponseBody {
  data: StaffMembershipListItem;
}

/**
 * FT-12B: one generic conflict for "this Restaurant already has a Membership
 * for that email" and "that account cannot be added" -- never distinguishes
 * them, and never reveals anything else about an existing account.
 */
const STAFF_PASSWORD_REQUIRED_RESPONSE = {
  error: {
    code: 'PASSWORD_REQUIRED',
    message: 'A password is required to create a new account.',
  },
};

const STAFF_MEMBERSHIP_CONFLICT_RESPONSE = {
  error: {
    code: 'STAFF_MEMBERSHIP_CONFLICT',
    message: 'This email cannot be added to this Restaurant.',
  },
};

interface CreateStaffUserResponseBody {
  data: {
    membership: StaffMembershipListItem;
    accountCreated: boolean;
  };
}

const STAFF_MEMBERSHIP_NOT_FOUND_RESPONSE = {
  error: { code: 'STAFF_MEMBERSHIP_NOT_FOUND', message: 'Staff Membership not found.' },
};

const BRANCH_NOT_FOUND_RESPONSE = {
  error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
};

const STAFF_SCOPE_EXCEEDS_AUTHORITY_RESPONSE = {
  error: {
    code: 'STAFF_SCOPE_EXCEEDS_AUTHORITY',
    message: 'You cannot grant Staff access beyond your authorized Branch scope.',
  },
};

/** STAFF_DASHBOARD_UX_SPEC.md #167: a caller can never edit their own role/Branch access/enabled-state through this ordinary Team page, regardless of Role. */
const STAFF_SELF_MANAGEMENT_FORBIDDEN_RESPONSE = {
  error: {
    code: 'STAFF_SELF_MANAGEMENT_FORBIDDEN',
    message: 'You cannot change your own Staff access from this page.',
  },
};

/** AUTH_TENANCY_SPEC.md #56: a Restaurant must not lose its final active OWNER. */
const STAFF_LAST_OWNER_PROTECTED_RESPONSE = {
  error: {
    code: 'STAFF_LAST_OWNER_PROTECTED',
    message: 'This Restaurant must always have at least one active Owner.',
  },
};

/**
 * Business Foundation R: the Restaurant Staff Membership List.
 * `GET /api/v1/restaurants/{restaurantId}/memberships`
 * (API_CONVENTIONS.md #117A).
 *
 * Membership-centric, Restaurant-wide (no Branch-nested route): Memberships
 * are a Restaurant-wide resource (AUTH_TENANCY_SPEC.md #63), so this route
 * carries no Branch guard of any kind -- Branch-scoped subset visibility is
 * enforced entirely inside `StaffService`, not by a guard. Read-only, so no
 * `CsrfGuard` (AUTH_TENANCY_SPEC.md #106A).
 *
 * Settled guard order: `AuthGuard` -> `RestaurantAccessGuard` ->
 * `PermissionGuard` (AUTH_TENANCY_SPEC.md #65K). Requires exactly
 * `users.view` -- distinct from `users.manage`; read visibility and future
 * Staff-management (mutation) authority are separate concerns. All
 * authorization fields (`restaurantId`, `membershipId`, `allBranches`) come
 * only from `request.restaurantAccess`, produced by `RestaurantAccessGuard`'s
 * own current database lookup this request -- never re-read from the raw
 * route param, body, query, or headers here.
 */
@Controller('restaurants/:restaurantId/memberships')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly staffProvisioningService: StaffProvisioningService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_VIEW)
  async listStaffMemberships(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffMembershipListResponseBody> {
    const data = await this.staffService.listStaffMemberships({
      restaurantId: request.restaurantAccess.restaurantId,
      membershipId: request.restaurantAccess.membershipId,
      allBranches: request.restaurantAccess.allBranches,
    });

    return { data };
  }

  /**
   * FT-12: direct Staff User creation (the primary V1 way to add Staff).
   * `POST /api/v1/restaurants/{restaurantId}/memberships`. Requires
   * `users.manage`. For a NEW account the admin supplies the password (hashed,
   * never returned or logged) and the user signs in with it normally. For an
   * email that already has an account only the Restaurant Membership is
   * created: any submitted password is ignored and that account's password is
   * never touched (`accountCreated` is `false`).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async createUser(
    @Body() dto: CreateStaffUserDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateStaffUserResponseBody> {
    const result = await this.staffProvisioningService.createUser({
      restaurantId: request.restaurantAccess.restaurantId,
      granterMembershipId: request.restaurantAccess.membershipId,
      granterAllBranches: request.restaurantAccess.allBranches,
      granterPermissions: request.restaurantAccess.permissions,
      email: dto.email,
      roleId: dto.roleId,
      allBranches: dto.allBranches,
      branchIds: dto.branchIds,
      active: dto.active ?? true,
      password: dto.password ?? null,
    });

    if (result.outcome === 'branchNotFound') {
      throw new NotFoundException(BRANCH_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'roleNotFound') {
      throw new NotFoundException(ROLE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'roleNotAssignable') {
      throw new ForbiddenException(ROLE_NOT_ASSIGNABLE_RESPONSE);
    }
    if (result.outcome === 'roleExceedsAuthority') {
      throw new ForbiddenException(ROLE_EXCEEDS_AUTHORITY_RESPONSE);
    }
    if (result.outcome === 'scopeExceedsAuthority') {
      throw new ForbiddenException(STAFF_SCOPE_EXCEEDS_AUTHORITY_RESPONSE);
    }
    if (result.outcome === 'passwordRequired') {
      throw new BadRequestException(STAFF_PASSWORD_REQUIRED_RESPONSE);
    }
    if (result.outcome === 'conflict') {
      throw new ConflictException(STAFF_MEMBERSHIP_CONFLICT_RESPONSE);
    }

    return {
      data: {
        membership: result.data,
        accountCreated: result.accountCreated,
      },
    };
  }

  /**
   * FT-12: Staff Membership role + Branch-scope edit.
   * `PATCH /api/v1/restaurants/{restaurantId}/memberships/{membershipId}`.
   * Restaurant-scoped only, like Staff Invitation creation -- no Branch
   * guard of any kind, since the requested `branchIds` are proposed grants
   * validated as Domain data inside `StaffService`, not an existing resource
   * this route is scoped to. Requires `users.manage` (mutation authority is
   * separate from `users.view`'s read authority). Domain safety outcomes
   * (self-management, last-OWNER, Branch-grant authority) are enforced by
   * the Service, never this Controller -- see `StaffService.updateMembership`.
   */
  @Patch(':membershipId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async updateMembership(
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateStaffMembershipDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffMembershipResponseBody> {
    const result = await this.staffService.updateMembership({
      restaurantId: request.restaurantAccess.restaurantId,
      granterMembershipId: request.restaurantAccess.membershipId,
      granterAllBranches: request.restaurantAccess.allBranches,
      granterPermissions: request.restaurantAccess.permissions,
      targetMembershipId: membershipId,
      roleId: dto.roleId,
      allBranches: dto.allBranches,
      branchIds: dto.branchIds,
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(STAFF_MEMBERSHIP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'selfManagementForbidden') {
      throw new ForbiddenException(STAFF_SELF_MANAGEMENT_FORBIDDEN_RESPONSE);
    }
    if (result.outcome === 'lastOwnerProtected') {
      throw new ConflictException(STAFF_LAST_OWNER_PROTECTED_RESPONSE);
    }
    if (result.outcome === 'branchNotFound') {
      throw new NotFoundException(BRANCH_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'roleNotFound') {
      throw new NotFoundException(ROLE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'roleNotAssignable') {
      throw new ForbiddenException(ROLE_NOT_ASSIGNABLE_RESPONSE);
    }
    if (result.outcome === 'roleExceedsAuthority') {
      throw new ForbiddenException(ROLE_EXCEEDS_AUTHORITY_RESPONSE);
    }
    if (result.outcome === 'scopeExceedsAuthority') {
      throw new ForbiddenException(STAFF_SCOPE_EXCEEDS_AUTHORITY_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * FT-12: disable a Membership -- the preferred "remove Staff" action.
   * `POST /api/v1/restaurants/{restaurantId}/memberships/{membershipId}/disable`.
   * Mirrors `updateMembership`'s guard chain and Domain-safety outcomes
   * exactly (minus Branch-grant concerns, since disabling never touches
   * Branch scope).
   */
  @Post(':membershipId/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async disableMembership(
    @Param('membershipId') membershipId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffMembershipResponseBody> {
    const result = await this.staffService.setMembershipStatus({
      restaurantId: request.restaurantAccess.restaurantId,
      granterMembershipId: request.restaurantAccess.membershipId,
      granterAllBranches: request.restaurantAccess.allBranches,
      targetMembershipId: membershipId,
      status: 'DISABLED',
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(STAFF_MEMBERSHIP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'selfManagementForbidden') {
      throw new ForbiddenException(STAFF_SELF_MANAGEMENT_FORBIDDEN_RESPONSE);
    }
    if (result.outcome === 'lastOwnerProtected') {
      throw new ConflictException(STAFF_LAST_OWNER_PROTECTED_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * FT-12: re-enable a previously disabled Membership. `lastOwnerProtected`
   * can never actually trigger here (enabling never reduces the active-OWNER
   * count) -- `StaffService` still shares the exact same method/result type
   * as disable for symmetry, so the Controller handles both outcomes
   * identically without assuming which are reachable.
   */
  @Post(':membershipId/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async enableMembership(
    @Param('membershipId') membershipId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<StaffMembershipResponseBody> {
    const result = await this.staffService.setMembershipStatus({
      restaurantId: request.restaurantAccess.restaurantId,
      granterMembershipId: request.restaurantAccess.membershipId,
      granterAllBranches: request.restaurantAccess.allBranches,
      targetMembershipId: membershipId,
      status: 'ACTIVE',
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(STAFF_MEMBERSHIP_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'selfManagementForbidden') {
      throw new ForbiddenException(STAFF_SELF_MANAGEMENT_FORBIDDEN_RESPONSE);
    }
    if (result.outcome === 'lastOwnerProtected') {
      throw new ConflictException(STAFF_LAST_OWNER_PROTECTED_RESPONSE);
    }

    return { data: result.data };
  }
}
