import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { BranchManagementAccessGuard } from './branch-management-access.guard';
import type { BranchAuthorizedRequest } from './branch-authorized-request';

const RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BRANCH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const RESTAURANT_ACCESS = {
  membershipId: 'membership-1',
  restaurantId: RESTAURANT_ID,
  role: 'OWNER' as const,
  allBranches: true,
};

function buildContext(
  params: Record<string, string> = {},
  restaurantAccess: typeof RESTAURANT_ACCESS | undefined = RESTAURANT_ACCESS,
): {
  context: ExecutionContext;
  request: Partial<BranchAuthorizedRequest>;
} {
  const request: Partial<BranchAuthorizedRequest> = {
    restaurantAccess,
    params,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('BranchManagementAccessGuard', () => {
  let branchAccessService: { resolveBranchManagementAccess: jest.Mock };
  let guard: BranchManagementAccessGuard;

  beforeEach(() => {
    branchAccessService = { resolveBranchManagementAccess: jest.fn() };
    guard = new BranchManagementAccessGuard(branchAccessService as never);
  });

  it('passes request.restaurantAccess (attached by RestaurantAccessGuard) and the canonical branchId param', async () => {
    branchAccessService.resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'authorized',
      context: { branchId: BRANCH_ID },
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    await guard.canActivate(context);

    expect(
      branchAccessService.resolveBranchManagementAccess,
    ).toHaveBeenCalledWith(RESTAURANT_ACCESS, BRANCH_ID);
  });

  it('notFound -> 404 BRANCH_NOT_FOUND', async () => {
    branchAccessService.resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'notFound',
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(caught?.getResponse()).toEqual({
      error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
    });
  });

  it('accessDenied -> 403 BRANCH_ACCESS_DENIED, without exposing membershipId or role', async () => {
    branchAccessService.resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'accessDenied',
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.FORBIDDEN);
    const body = caught?.getResponse();
    expect(body).toEqual({
      error: {
        code: 'BRANCH_ACCESS_DENIED',
        message: 'You do not have access to this Branch.',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/membership|role/i);
  });

  it('authorized -> attaches the exact same request.branchAccess shape as BranchAccessGuard and returns true', async () => {
    branchAccessService.resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'authorized',
      context: { branchId: BRANCH_ID },
    });
    const { context, request } = buildContext({ branchId: BRANCH_ID });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.branchAccess).toEqual({ branchId: BRANCH_ID });
  });

  it('never maps any outcome to a 409/BRANCH_NOT_OPERATIONAL response', async () => {
    branchAccessService.resolveBranchManagementAccess.mockResolvedValue({
      outcome: 'authorized',
      context: { branchId: BRANCH_ID },
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    await guard.canActivate(context);

    expect(
      branchAccessService.resolveBranchManagementAccess,
    ).toHaveBeenCalled();
    // The service contract for management access has no 'notOperational'
    // outcome at all, so there is no code path in this guard that could
    // ever throw HttpStatus.CONFLICT / BRANCH_NOT_OPERATIONAL.
  });

  it('fails closed: missing request.restaurantAccess -> 404 BRANCH_NOT_FOUND, never a TypeError/500', async () => {
    // Built without the `buildContext` helper: a JS default parameter would
    // silently fall back to RESTAURANT_ACCESS if `undefined` were passed
    // explicitly, defeating the point of this test. `restaurantAccess` is
    // genuinely absent from the request here.
    const request: Partial<BranchAuthorizedRequest> = {
      params: { branchId: BRANCH_ID },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(caught?.getResponse()).toEqual({
      error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' },
    });
    expect(
      branchAccessService.resolveBranchManagementAccess,
    ).not.toHaveBeenCalled();
  });
});
