import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import type { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { StaffController } from './staff.controller';

const DTO: CreateStaffUserDto = {
  email: 'cashier@example.test',
  roleId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  allBranches: false,
  branchIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
};

const MEMBERSHIP = {
  id: 'membership-new',
  user: { id: 'user-new', email: 'cashier@example.test' },
  role: 'CASHIER',
  roleId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  roleName: 'Cashier',
  status: 'ACTIVE',
  allBranches: false,
  branches: [],
};

function buildRequest(routeParamRestaurantId = 'authorized-restaurant'): RestaurantAuthorizedRequest {
  return {
    params: { restaurantId: routeParamRestaurantId },
    auth: { userId: 'user-1' },
    restaurantAccess: {
      membershipId: 'membership-granter',
      restaurantId: 'authorized-restaurant',
      role: 'OWNER',
      roleId: 'role-owner',
      permissions: ['users.manage', 'orders.view'],
      allBranches: true,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

describe('StaffController.createUser', () => {
  let provisioning: { createUser: jest.Mock };
  let controller: StaffController;
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = StaffController.prototype.createUser;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    provisioning = {
      createUser: jest.fn().mockResolvedValue({
        outcome: 'created',
        data: MEMBERSHIP,
        accountCreated: true,
      }),
    };
    controller = new StaffController({} as never, provisioning as never);
  });

  it('declares AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard and nothing Branch-related', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard]);
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(AllBranchesRequiredGuard);
  });

  it('requires exactly users.manage', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(PERMISSIONS.USERS_MANAGE);
  });

  it('takes Restaurant and granter authority from request.restaurantAccess, never the route param or body', async () => {
    await controller.createUser(DTO, buildRequest('attacker-supplied-value'));

    expect(provisioning.createUser).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      granterMembershipId: 'membership-granter',
      granterAllBranches: true,
      granterPermissions: ['users.manage', 'orders.view'],
      email: DTO.email,
      roleId: DTO.roleId,
      allBranches: DTO.allBranches,
      branchIds: DTO.branchIds,
      active: true,
      password: null,
    });
  });

  it('passes the entered password and an explicit inactive flag through', async () => {
    await controller.createUser(
      { ...DTO, active: false, password: 'admin-entered-pass-1' },
      buildRequest(),
    );

    expect(provisioning.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, password: 'admin-entered-pass-1' }),
    );
  });

  it('returns only the Membership and whether an account was created -- never a password', async () => {
    const body = await controller.createUser({ ...DTO, password: 'admin-entered-pass-1' }, buildRequest());

    expect(body).toEqual({ data: { membership: MEMBERSHIP, accountCreated: true } });
    expect(JSON.stringify(body)).not.toContain('admin-entered-pass-1');
  });

  it('tells the UI an existing account was only added (accountCreated false)', async () => {
    provisioning.createUser.mockResolvedValue({
      outcome: 'created',
      data: MEMBERSHIP,
      accountCreated: false,
    });

    const body = await controller.createUser(DTO, buildRequest());

    expect(body.data.accountCreated).toBe(false);
  });

  it('maps passwordRequired -> 400 PASSWORD_REQUIRED', async () => {
    provisioning.createUser.mockResolvedValue({ outcome: 'passwordRequired' });

    await expect(controller.createUser(DTO, buildRequest())).rejects.toMatchObject({
      response: { error: { code: 'PASSWORD_REQUIRED' } },
      status: 400,
    });
  });

  it('maps branchNotFound -> 404 BRANCH_NOT_FOUND', async () => {
    provisioning.createUser.mockResolvedValue({ outcome: 'branchNotFound' });

    await expect(controller.createUser(DTO, buildRequest())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps scopeExceedsAuthority -> 403 STAFF_SCOPE_EXCEEDS_AUTHORITY', async () => {
    provisioning.createUser.mockResolvedValue({ outcome: 'scopeExceedsAuthority' });

    await expect(controller.createUser(DTO, buildRequest())).rejects.toMatchObject({
      response: { error: { code: 'STAFF_SCOPE_EXCEEDS_AUTHORITY' } },
    });
    await expect(controller.createUser(DTO, buildRequest())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['roleNotFound', NotFoundException, 'ROLE_NOT_FOUND'],
    ['roleNotAssignable', ForbiddenException, 'ROLE_NOT_ASSIGNABLE'],
    ['roleExceedsAuthority', ForbiddenException, 'ROLE_EXCEEDS_AUTHORITY'],
  ] as const)('maps %s -> %s with code %s', async (outcome, ExceptionClass, code) => {
    provisioning.createUser.mockResolvedValue({ outcome });

    await expect(controller.createUser(DTO, buildRequest())).rejects.toBeInstanceOf(ExceptionClass);
    await expect(controller.createUser(DTO, buildRequest())).rejects.toMatchObject({
      response: { error: { code } },
    });
  });

  it('maps conflict -> 409 STAFF_MEMBERSHIP_CONFLICT', async () => {
    provisioning.createUser.mockResolvedValue({ outcome: 'conflict' });

    await expect(controller.createUser(DTO, buildRequest())).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.createUser(DTO, buildRequest())).rejects.toMatchObject({
      response: { error: { code: 'STAFF_MEMBERSHIP_CONFLICT' } },
    });
  });
});
