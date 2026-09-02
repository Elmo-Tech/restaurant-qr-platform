import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AllBranchesRequiredGuard } from './all-branches-required.guard';

const PERMISSION_DENIED_BODY = {
  error: {
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  },
};

function buildContext(allBranches: boolean): ExecutionContext {
  const request = {
    restaurantAccess: {
      membershipId: 'm1',
      restaurantId: 'r1',
      role: 'MANAGER',
      allBranches,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildContextWithoutRestaurantAccess(): ExecutionContext {
  const request = {};
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AllBranchesRequiredGuard', () => {
  const guard = new AllBranchesRequiredGuard();

  it('allows a Membership with allBranches = true', () => {
    expect(guard.canActivate(buildContext(true))).toBe(true);
  });

  it('denies a Membership with allBranches = false using the exact generic PERMISSION_DENIED contract', () => {
    let caught: HttpException | undefined;
    try {
      guard.canActivate(buildContext(false));
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(caught?.getResponse()).toEqual(PERMISSION_DENIED_BODY);
  });

  it('fails closed with the exact PERMISSION_DENIED contract when used without RestaurantAccessGuard ahead of it -- never a TypeError/500', () => {
    const context = buildContextWithoutRestaurantAccess();

    let caught: unknown;
    try {
      guard.canActivate(context);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((caught as HttpException).getResponse()).toEqual(
      PERMISSION_DENIED_BODY,
    );
  });
});
