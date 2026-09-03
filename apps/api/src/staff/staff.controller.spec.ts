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
import { StaffController } from './staff.controller';
import type { StaffMembershipListItem } from './staff.service';

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
      allBranches: params.allBranches,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

describe('StaffController', () => {
  let staffService: { listStaffMemberships: jest.Mock };
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
    };
    controller = new StaffController(staffService as never);
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
