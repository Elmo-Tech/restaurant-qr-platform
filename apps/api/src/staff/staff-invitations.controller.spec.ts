import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { StaffInvitationsController } from './staff-invitations.controller';
import type { CreateStaffInvitationDto } from './dto/create-staff-invitation.dto';
import type { CreatedStaffInvitation } from './staff-invitations.service';

const DTO: CreateStaffInvitationDto = {
  email: 'manager@example.test',
  role: 'MANAGER',
  allBranches: false,
  branchIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
};

function buildRequest(params: {
  userId: string;
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
  routeParamRestaurantId?: string;
}): RestaurantAuthorizedRequest {
  return {
    params: {
      restaurantId: params.routeParamRestaurantId ?? params.restaurantId,
    },
    auth: { userId: params.userId },
    restaurantAccess: {
      membershipId: params.membershipId,
      restaurantId: params.restaurantId,
      role: 'MANAGER',
      allBranches: params.allBranches,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

describe('StaffInvitationsController', () => {
  let staffInvitationsService: { createInvitation: jest.Mock };
  let controller: StaffInvitationsController;

  // Nest metadata reflection targets a class method reference without ever
  // invoking it -- not the unintended-`this`-scoping pattern
  // @typescript-eslint/unbound-method guards against.
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = StaffInvitationsController.prototype.createInvitation;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    staffInvitationsService = {
      createInvitation: jest.fn().mockResolvedValue({ outcome: 'created' }),
    };
    controller = new StaffInvitationsController(
      staffInvitationsService as never,
    );
  });

  it('A. declares exactly the settled guard order', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).toEqual([
      AuthGuard,
      CsrfGuard,
      RestaurantAccessGuard,
      PermissionGuard,
    ]);
  });

  it('B. requires exactly users.manage', () => {
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      handler,
    ) as string;

    expect(permission).toBe(PERMISSIONS.USERS_MANAGE);
  });

  it('C. never declares BranchAccessGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(BranchAccessGuard);
  });

  it('D. never declares BranchManagementAccessGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(BranchManagementAccessGuard);
  });

  it('E. never declares AllBranchesRequiredGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(AllBranchesRequiredGuard);
  });

  it('F. passes authority from request.auth/request.restaurantAccess, never the raw route param or body', async () => {
    const request = buildRequest({
      userId: 'user-1',
      restaurantId: 'authorized-restaurant',
      membershipId: 'membership-1',
      allBranches: false,
      routeParamRestaurantId: 'attacker-supplied-value',
    });

    await controller.createInvitation(DTO, request);

    expect(staffInvitationsService.createInvitation).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      inviterMembershipId: 'membership-1',
      inviterAllBranches: false,
      invitedByUserId: 'user-1',
      email: DTO.email,
      role: DTO.role,
      allBranches: DTO.allBranches,
      branchIds: DTO.branchIds,
    });
  });

  it('G. 201 exact data envelope on success', async () => {
    const data: CreatedStaffInvitation = {
      id: 'invitation-1',
      email: 'manager@example.test',
      role: 'MANAGER',
      allBranches: false,
      branches: [{ id: 'branch-1', name: 'Maadi', status: 'ACTIVE' }],
      expiresAt: new Date('2026-09-11T00:00:00.000Z'),
      invitationToken: 'raw-token',
    };
    staffInvitationsService.createInvitation.mockResolvedValue({
      outcome: 'created',
      data,
    });

    const body = await controller.createInvitation(
      DTO,
      buildRequest({
        userId: 'user-1',
        restaurantId: 'restaurant-1',
        membershipId: 'membership-1',
        allBranches: false,
      }),
    );

    expect(body).toEqual({ data });
    expect(Object.keys(body)).toEqual(['data']);
  });

  it('H. branchNotFound -> 404 BRANCH_NOT_FOUND', async () => {
    staffInvitationsService.createInvitation.mockResolvedValue({
      outcome: 'branchNotFound',
    });

    await expect(
      controller.createInvitation(
        DTO,
        buildRequest({
          userId: 'user-1',
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: false,
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('I. scopeExceedsAuthority -> 403 STAFF_SCOPE_EXCEEDS_AUTHORITY', async () => {
    staffInvitationsService.createInvitation.mockResolvedValue({
      outcome: 'scopeExceedsAuthority',
    });

    let caught: ForbiddenException | undefined;
    try {
      await controller.createInvitation(
        DTO,
        buildRequest({
          userId: 'user-1',
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: false,
        }),
      );
    } catch (error) {
      caught = error as ForbiddenException;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'STAFF_SCOPE_EXCEEDS_AUTHORITY',
        message:
          'You cannot grant Staff access beyond your authorized Branch scope.',
      },
    });
  });

  it('J. conflict -> 409 STAFF_INVITATION_CONFLICT', async () => {
    staffInvitationsService.createInvitation.mockResolvedValue({
      outcome: 'conflict',
    });

    let caught: ConflictException | undefined;
    try {
      await controller.createInvitation(
        DTO,
        buildRequest({
          userId: 'user-1',
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: false,
        }),
      );
    } catch (error) {
      caught = error as ConflictException;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'STAFF_INVITATION_CONFLICT',
        message: 'An invitation cannot be created for this email.',
      },
    });
  });
});
