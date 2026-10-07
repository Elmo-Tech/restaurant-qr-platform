import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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
import { CreateStaffInvitationDto } from './dto/create-staff-invitation.dto';
import { StaffInvitationsService } from './staff-invitations.service';
import type { CreatedStaffInvitation, StaffInvitationListItem } from './staff-invitations.service';

const STAFF_INVITATION_NOT_FOUND_RESPONSE = {
  error: { code: 'STAFF_INVITATION_NOT_FOUND', message: 'Invitation not found.' },
};

const BRANCH_NOT_FOUND_RESPONSE = {
  error: {
    code: 'BRANCH_NOT_FOUND',
    message: 'Branch not found.',
  },
};

/**
 * Business Foundation S, settled contract: never discloses which requested
 * Branch exceeded the inviter's authority, or that authority was the
 * specific reason -- one generic reason for every scope-exceeding grant
 * attempt.
 */
const STAFF_SCOPE_EXCEEDS_AUTHORITY_RESPONSE = {
  error: {
    code: 'STAFF_SCOPE_EXCEEDS_AUTHORITY',
    message:
      'You cannot grant Staff access beyond your authorized Branch scope.',
  },
};

/**
 * Business Foundation S, settled contract: one privacy-preserving conflict
 * for every reason (existing Membership of any status, or an existing
 * pending Invitation) -- never distinguishes them externally.
 */
const STAFF_INVITATION_CONFLICT_RESPONSE = {
  error: {
    code: 'STAFF_INVITATION_CONFLICT',
    message: 'An invitation cannot be created for this email.',
  },
};

interface CreateStaffInvitationResponseBody {
  data: CreatedStaffInvitation;
}

interface ListStaffInvitationsResponseBody {
  data: StaffInvitationListItem[];
}

/**
 * Business Foundation S: Staff Invitation Creation.
 * `POST /api/v1/restaurants/{restaurantId}/invitations`
 * (API_CONVENTIONS.md #117B).
 *
 * INVITATION-ONLY creation: this route never creates or mutates a `User` or
 * `RestaurantMembership`. Requires `users.manage`. Restaurant-scoped -- no
 * Branch-nested route, and no Branch guard of any kind (`BranchAccessGuard`,
 * `BranchManagementAccessGuard`, `AllBranchesRequiredGuard` are all
 * deliberately unused): the requested Branch ids in the body are proposed
 * authorization grants, validated as Domain data by
 * `StaffInvitationsService`, not an existing resource this route itself is
 * scoped to.
 *
 * Settled guard order: `AuthGuard` -> `CsrfGuard` -> `RestaurantAccessGuard`
 * -> `PermissionGuard` (AUTH_TENANCY_SPEC.md #65L). `RestaurantAccessGuard`
 * keeps its existing unchanged behavior: unknown/inaccessible Restaurant ->
 * `404 RESTAURANT_NOT_FOUND`; authorized but `INACTIVE`/`SUSPENDED`
 * Restaurant -> `409 RESTAURANT_NOT_OPERATIONAL`, both before the Staff
 * Invitation business method ever runs. Authority comes only from
 * `request.auth.userId` and `request.restaurantAccess` -- never the request
 * body or the raw `:restaurantId` route parameter.
 */
@Controller('restaurants/:restaurantId/invitations')
export class StaffInvitationsController {
  constructor(
    private readonly staffInvitationsService: StaffInvitationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async createInvitation(
    @Body() dto: CreateStaffInvitationDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<CreateStaffInvitationResponseBody> {
    const result = await this.staffInvitationsService.createInvitation({
      restaurantId: request.restaurantAccess.restaurantId,
      inviterMembershipId: request.restaurantAccess.membershipId,
      inviterAllBranches: request.restaurantAccess.allBranches,
      invitedByUserId: request.auth.userId,
      email: dto.email,
      role: dto.role,
      allBranches: dto.allBranches,
      branchIds: dto.branchIds,
    });

    if (result.outcome === 'branchNotFound') {
      throw new NotFoundException(BRANCH_NOT_FOUND_RESPONSE);
    }

    if (result.outcome === 'scopeExceedsAuthority') {
      throw new ForbiddenException(STAFF_SCOPE_EXCEEDS_AUTHORITY_RESPONSE);
    }

    if (result.outcome === 'conflict') {
      throw new ConflictException(STAFF_INVITATION_CONFLICT_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * FT-12 (API_CONVENTIONS.md #117): the previously-unimplemented Invitation
   * List. Requires `users.view` -- read visibility, distinct from
   * `users.manage`'s mutation authority, exactly like Staff Membership List
   * (#117A). Read-only, so no `CsrfGuard`.
   */
  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_VIEW)
  async listInvitations(
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<ListStaffInvitationsResponseBody> {
    const data = await this.staffInvitationsService.listInvitations({
      restaurantId: request.restaurantAccess.restaurantId,
    });

    return { data };
  }

  /**
   * FT-12: cancel a still-pending Invitation. Requires `users.manage`,
   * matching Create's own mutation authority. `notFound` covers unknown,
   * foreign-Restaurant, already-accepted, and already-revoked Invitations
   * identically (existence-hiding convention).
   */
  @Post(':invitationId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<void> {
    const result = await this.staffInvitationsService.revokeInvitation({
      restaurantId: request.restaurantAccess.restaurantId,
      invitationId,
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(STAFF_INVITATION_NOT_FOUND_RESPONSE);
    }
  }
}
