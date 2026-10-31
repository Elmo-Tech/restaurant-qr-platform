import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { RestaurantSetupController } from './restaurant-setup.controller';

function request(role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'OWNER') {
  return {
    auth: { userId: 'user-1' },
    restaurantAccess: {
      restaurantId: 'restaurant-1',
      membershipId: 'membership-1',
      role,
      allBranches: true,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

const mutations = ['enroll', 'setVisibility', 'review', 'complete'] as const;

describe('RestaurantSetupController security contract', () => {
  const mock = {
    getStatus: jest.fn().mockResolvedValue({ enrolled: false, steps: [] }),
    enroll: jest.fn().mockResolvedValue(undefined),
    setHidden: jest.fn().mockResolvedValue(undefined),
    review: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new RestaurantSetupController(mock as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires session, tenant access, RESTAURANT_VIEW and full restaurant scope on read', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const handler = RestaurantSetupController.prototype.getStatus;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      AuthGuard,
      RestaurantAccessGuard,
      PermissionGuard,
      AllBranchesRequiredGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toEqual(
      PERMISSIONS.RESTAURANT_VIEW,
    );
  });

  it.each(mutations)(
    '%s requires CSRF, tenant, permission and allBranches for writes',
    (key) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const handler = RestaurantSetupController.prototype[key];
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
        AllBranchesRequiredGuard,
      ]);
      const required =
        key === 'setVisibility'
          ? PERMISSIONS.RESTAURANT_VIEW
          : PERMISSIONS.RESTAURANT_MANAGE;
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toEqual(
        required,
      );
    },
  );

  it('never leaks setup to CASHIER even with restaurant.view', async () => {
    await expect(
      controller.getStatus(request('CASHIER')),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.getStatus).not.toHaveBeenCalled();
  });

  it('only OWNER can enroll/finalize, never a MANAGER with manage permissions', async () => {
    await expect(controller.enroll(request('MANAGER'))).rejects.toMatchObject({
      status: 403,
    });
    await expect(controller.complete(request('MANAGER'))).rejects.toMatchObject(
      { status: 403 },
    );
    expect(mock.enroll).not.toHaveBeenCalled();
    expect(mock.complete).not.toHaveBeenCalled();
  });

  it('uses only authorized restaurantId and auth userId for read and visibility', async () => {
    await controller.getStatus(request());
    expect(mock.getStatus).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
      'user-1',
    );
    await controller.setVisibility({ hidden: true }, request());
    expect(mock.setHidden).toHaveBeenCalledWith('restaurant-1', 'user-1', true);
  });

  it('only the owner may waive optional branding for the whole restaurant', async () => {
    await expect(
      controller.review({ step: 'BRANDING_SKIP' }, request('MANAGER')),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.review).not.toHaveBeenCalled();
    await controller.review({ step: 'BRANDING_SKIP' }, request('OWNER'));
    expect(mock.review).toHaveBeenCalledWith('restaurant-1', 'BRANDING_SKIP');
  });

  it('stores explicit, non-client-derived review keys only', async () => {
    await controller.review({ step: 'ORDERING' }, request());
    expect(mock.review).toHaveBeenCalledWith('restaurant-1', 'ORDERING');
  });
});
