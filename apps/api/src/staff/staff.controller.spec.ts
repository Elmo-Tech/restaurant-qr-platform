import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { StaffController } from './staff.controller';
import type { StaffMembershipListItem } from './staff.service';
import type { UpdateStaffMembershipDto } from './dto/update-staff-membership.dto';

function buildRequest(params: {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
  routeParamRestaurantId?: string;
}): RestaurantAuthorizedRequest {
  return {
    params: {
      restaurantId: params.routeParamRestaurantId ?? params.restaurantId,
    },
    restaurantAccess: {
      membershipId: params.membershipId,
      restaurantId: params.restaurantId,
      role: 'OWNER',
      roleId: 'role-owner',
      permissions: ['users.manage'],
      allBranches: params.allBranches,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

const TARGET_ID = 'membership-target';

const SAMPLE_MEMBERSHIP: StaffMembershipListItem = {
  id: TARGET_ID,
  user: { id: 'u2', email: 'staff@example.test' },
  role: 'CASHIER',
  roleId: 'role-cashier',
  roleName: 'Cashier',
  status: 'ACTIVE',
  allBranches: true,
  branches: [],
};

describe('StaffController', () => {
  let staffService: {
    listStaffMemberships: jest.Mock;
    updateMembership: jest.Mock;
    setMembershipStatus: jest.Mock;
  };
  let controller: StaffController;

  // Nest metadata reflection targets a class method reference without ever
  // invoking it -- not the unintended-`this`-scoping pattern
  // @typescript-eslint/unbound-method guards against.
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = StaffController.prototype.listStaffMemberships;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    staffService = {
      listStaffMemberships: jest.fn().mockResolvedValue([]),
      updateMembership: jest.fn().mockResolvedValue({ outcome: 'updated', data: SAMPLE_MEMBERSHIP }),
      setMembershipStatus: jest.fn().mockResolvedValue({ outcome: 'updated', data: SAMPLE_MEMBERSHIP }),
    };
    controller = new StaffController(staffService as never, {} as never);
  });

  it('A. declares exactly the settled guard order', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
  });

  it('B. requires exactly users.view', () => {
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      handler,
    ) as string;

    expect(permission).toBe(PERMISSIONS.USERS_VIEW);
  });

  it('C. never declares CsrfGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(CsrfGuard);
  });

  it('D. never declares BranchAccessGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(BranchAccessGuard);
  });

  it('E. never declares BranchManagementAccessGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(BranchManagementAccessGuard);
  });

  it('F. never declares AllBranchesRequiredGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).not.toContain(AllBranchesRequiredGuard);
  });

  it('G. passes restaurantId/membershipId/allBranches from request.restaurantAccess, never the raw route param', async () => {
    const request = buildRequest({
      restaurantId: 'authorized-restaurant',
      membershipId: 'membership-1',
      allBranches: false,
      routeParamRestaurantId: 'attacker-supplied-value',
    });

    await controller.listStaffMemberships(request);

    expect(staffService.listStaffMemberships).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      membershipId: 'membership-1',
      allBranches: false,
    });
  });

  it('H. wraps the result in the exact { data } envelope', async () => {
    const rows: StaffMembershipListItem[] = [
      {
        id: 'm1',
        user: { id: 'u1', email: 'owner@example.test' },
        role: 'OWNER',
        roleId: 'role-owner',
        roleName: 'Owner',
        status: 'ACTIVE',
        allBranches: true,
        branches: [],
      },
    ];
    staffService.listStaffMemberships.mockResolvedValue(rows);

    const body = await controller.listStaffMemberships(
      buildRequest({
        restaurantId: 'restaurant-1',
        membershipId: 'membership-1',
        allBranches: true,
      }),
    );

    expect(body).toEqual({ data: rows });
  });

  it('I. returns an empty array as data, not an error, when the visible set is empty', async () => {
    staffService.listStaffMemberships.mockResolvedValue([]);

    const body = await controller.listStaffMemberships(
      buildRequest({
        restaurantId: 'restaurant-1',
        membershipId: 'membership-1',
        allBranches: false,
      }),
    );

    expect(body).toEqual({ data: [] });
  });
});

const UPDATE_DTO: UpdateStaffMembershipDto = { roleId: 'role-cashier', allBranches: true, branchIds: [] };

describe('StaffController.updateMembership', () => {
  let staffService: { updateMembership: jest.Mock };
  let controller: StaffController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = StaffController.prototype.updateMembership;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    staffService = { updateMembership: jest.fn().mockResolvedValue({ outcome: 'updated', data: SAMPLE_MEMBERSHIP }) };
    controller = new StaffController(staffService as never, {} as never);
  });

  it('declares AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard, no Branch guard of any kind', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard]);
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(BranchManagementAccessGuard);
    expect(guards).not.toContain(AllBranchesRequiredGuard);
  });

  it('requires exactly users.manage', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(PERMISSIONS.USERS_MANAGE);
  });

  it('passes the authorized granter scope and the route param membershipId, wraps result in a data envelope', async () => {
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: false });
    const body = await controller.updateMembership(TARGET_ID, UPDATE_DTO, request);

    expect(staffService.updateMembership).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      granterMembershipId: 'granter-1',
      granterAllBranches: false,
      granterPermissions: expect.any(Array),
      targetMembershipId: TARGET_ID,
      roleId: 'role-cashier',
      allBranches: true,
      branchIds: [],
    });
    expect(body).toEqual({ data: SAMPLE_MEMBERSHIP });
  });

  it.each([
    ['notFound', NotFoundException, 'STAFF_MEMBERSHIP_NOT_FOUND'],
    ['selfManagementForbidden', ForbiddenException, 'STAFF_SELF_MANAGEMENT_FORBIDDEN'],
    ['lastOwnerProtected', ConflictException, 'STAFF_LAST_OWNER_PROTECTED'],
    ['branchNotFound', NotFoundException, 'BRANCH_NOT_FOUND'],
    ['scopeExceedsAuthority', ForbiddenException, 'STAFF_SCOPE_EXCEEDS_AUTHORITY'],
    ['roleNotFound', NotFoundException, 'ROLE_NOT_FOUND'],
    ['roleNotAssignable', ForbiddenException, 'ROLE_NOT_ASSIGNABLE'],
    ['roleExceedsAuthority', ForbiddenException, 'ROLE_EXCEEDS_AUTHORITY'],
  ] as const)('maps outcome %s to %s with code %s', async (outcome, ExceptionClass, code) => {
    staffService.updateMembership.mockResolvedValue({ outcome });
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });

    await expect(controller.updateMembership(TARGET_ID, UPDATE_DTO, request)).rejects.toBeInstanceOf(
      ExceptionClass,
    );
    try {
      await controller.updateMembership(TARGET_ID, UPDATE_DTO, request);
      fail('expected to throw');
    } catch (error) {
      expect((error as { getResponse: () => { error: { code: string } } }).getResponse().error.code).toBe(code);
    }
  });
});

describe('StaffController.disableMembership / enableMembership', () => {
  let staffService: { setMembershipStatus: jest.Mock };
  let controller: StaffController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const disableHandler = StaffController.prototype.disableMembership;
  const enableHandler = StaffController.prototype.enableMembership;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    staffService = {
      setMembershipStatus: jest.fn().mockResolvedValue({ outcome: 'updated', data: SAMPLE_MEMBERSHIP }),
    };
    controller = new StaffController(staffService as never, {} as never);
  });

  it('both declare AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard and require users.manage', () => {
    for (const handler of [disableHandler, enableHandler]) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard]);
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(PERMISSIONS.USERS_MANAGE);
    }
  });

  it('disable passes status: DISABLED with the authorized granter scope', async () => {
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });
    await controller.disableMembership(TARGET_ID, request);

    expect(staffService.setMembershipStatus).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      granterMembershipId: 'granter-1',
      granterAllBranches: true,
      targetMembershipId: TARGET_ID,
      status: 'DISABLED',
    });
  });

  it('enable passes status: ACTIVE', async () => {
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });
    await controller.enableMembership(TARGET_ID, request);

    expect(staffService.setMembershipStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
    );
  });

  it('maps lastOwnerProtected to 409 on disable', async () => {
    staffService.setMembershipStatus.mockResolvedValue({ outcome: 'lastOwnerProtected' });
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });

    await expect(controller.disableMembership(TARGET_ID, request)).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps selfManagementForbidden to 403 on disable', async () => {
    staffService.setMembershipStatus.mockResolvedValue({ outcome: 'selfManagementForbidden' });
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });

    await expect(controller.disableMembership(TARGET_ID, request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps notFound to 404 on enable', async () => {
    staffService.setMembershipStatus.mockResolvedValue({ outcome: 'notFound' });
    const request = buildRequest({ restaurantId: 'restaurant-1', membershipId: 'granter-1', allBranches: true });

    await expect(controller.enableMembership(TARGET_ID, request)).rejects.toBeInstanceOf(NotFoundException);
  });
});
