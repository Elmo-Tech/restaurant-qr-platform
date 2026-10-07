import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { restaurantAccessFor } from '../context/restaurant-access.fixture';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../permission/require-permission.decorator';
import { PermissionGuard } from './permission.guard';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

const PERMISSION_DENIED_BODY = {
  error: {
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  },
};

function buildContext(params: {
  requiredPermission?: string;
  restaurantAccess?: RestaurantAuthorizedRequest['restaurantAccess'];
}): ExecutionContext {
  const request: Partial<RestaurantAuthorizedRequest> = {
    restaurantAccess: params.restaurantAccess,
  };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildReflector(requiredPermission?: string): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === REQUIRED_PERMISSION_KEY ? requiredPermission : undefined,
  } as unknown as Reflector;
}

function expectDenied(context: ExecutionContext, guard: PermissionGuard) {
  let caught: HttpException | undefined;
  try {
    guard.canActivate(context);
  } catch (error) {
    caught = error as HttpException;
  }
  expect(caught).toBeInstanceOf(HttpException);
  expect(caught?.getStatus()).toBe(HttpStatus.FORBIDDEN);
  expect(caught?.getResponse()).toEqual(PERMISSION_DENIED_BODY);
}

describe('PermissionGuard', () => {
  it('no @RequirePermission metadata -> denies (fails closed, never an implicit allow)', () => {
    const guard = new PermissionGuard(buildReflector(undefined));
    const context = buildContext({
      restaurantAccess: restaurantAccessFor('OWNER', { membershipId: 'm1', restaurantId: 'r1', allBranches: true }),
    });

    expectDenied(context, guard);
  });

  it('missing request.restaurantAccess -> denies (PermissionGuard used without RestaurantAccessGuard ahead of it)', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.MENU_MANAGE));
    const context = buildContext({ restaurantAccess: undefined });

    expectDenied(context, guard);
  });

  it('Role lacking the required Permission -> denies', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.MENU_MANAGE));
    const context = buildContext({
      restaurantAccess: restaurantAccessFor('WAITER', { membershipId: 'm1', restaurantId: 'r1', allBranches: true }),
    });

    expectDenied(context, guard);
  });

  it('Role holding the required Permission -> returns true', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.MENU_MANAGE));
    const context = buildContext({
      restaurantAccess: restaurantAccessFor('MANAGER', { membershipId: 'm1', restaurantId: 'r1', allBranches: true }),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('performs no Permission-derivation Role lookup other than request.restaurantAccess.permissions', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.ORDERS_VIEW));
    const context = buildContext({
      restaurantAccess: restaurantAccessFor('KITCHEN', { membershipId: 'm1', restaurantId: 'r1', allBranches: false }),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('enforces the Role permissions of the Membership, not its kind label (a custom Role)', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.MENU_MANAGE));
    const allowed = buildContext({
      restaurantAccess: restaurantAccessFor('WAITER', {
        role: 'CUSTOM',
        permissions: [PERMISSIONS.MENU_MANAGE],
      }),
    });
    const denied = buildContext({
      restaurantAccess: restaurantAccessFor('MANAGER', { role: 'CUSTOM', permissions: [] }),
    });

    expect(guard.canActivate(allowed)).toBe(true);
    expectDenied(denied, guard);
  });

  it('every denial reason produces the exact same generic body -- never reveals which reason applied', () => {
    const guard = new PermissionGuard(buildReflector(PERMISSIONS.MENU_MANAGE));

    const missingMetadataGuard = new PermissionGuard(buildReflector(undefined));
    const missingMetadataContext = buildContext({
      restaurantAccess: restaurantAccessFor('OWNER', { membershipId: 'm1', restaurantId: 'r1', allBranches: true }),
    });
    const missingContextContext = buildContext({ restaurantAccess: undefined });
    const insufficientRoleContext = buildContext({
      restaurantAccess: restaurantAccessFor('WAITER', { membershipId: 'm1', restaurantId: 'r1', allBranches: true }),
    });

    const bodies: unknown[] = [];
    for (const [g, c] of [
      [missingMetadataGuard, missingMetadataContext],
      [guard, missingContextContext],
      [guard, insufficientRoleContext],
    ] as const) {
      try {
        g.canActivate(c);
      } catch (error) {
        bodies.push((error as HttpException).getResponse());
      }
    }

    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body).toEqual(PERMISSION_DENIED_BODY);
    }
  });
});
