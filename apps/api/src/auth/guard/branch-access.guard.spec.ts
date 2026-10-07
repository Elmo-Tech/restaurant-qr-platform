import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { restaurantAccessFor } from '../context/restaurant-access.fixture';
import { BranchAccessGuard } from './branch-access.guard';
import type { BranchAuthorizedRequest } from './branch-authorized-request';

const RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BRANCH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const RESTAURANT_ACCESS = restaurantAccessFor('OWNER', {
  membershipId: 'membership-1',
  restaurantId: RESTAURANT_ID,
  allBranches: true,
});

function buildContext(params: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Partial<BranchAuthorizedRequest>;
} {
  const request: Partial<BranchAuthorizedRequest> = {
    restaurantAccess: RESTAURANT_ACCESS,
    params,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('BranchAccessGuard', () => {
  let branchAccessService: { resolveBranchAccess: jest.Mock };
  let guard: BranchAccessGuard;

  beforeEach(() => {
    branchAccessService = { resolveBranchAccess: jest.fn() };
    guard = new BranchAccessGuard(branchAccessService as never);
  });

  it('passes request.restaurantAccess (attached by RestaurantAccessGuard) and the canonical branchId param', async () => {
    branchAccessService.resolveBranchAccess.mockResolvedValue({
      outcome: 'authorized',
      context: { branchId: BRANCH_ID },
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    await guard.canActivate(context);

    expect(branchAccessService.resolveBranchAccess).toHaveBeenCalledWith(
      RESTAURANT_ACCESS,
      BRANCH_ID,
    );
  });

  it('notFound -> 404 BRANCH_NOT_FOUND', async () => {
    branchAccessService.resolveBranchAccess.mockResolvedValue({
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
    branchAccessService.resolveBranchAccess.mockResolvedValue({
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

  it('notOperational -> 409 BRANCH_NOT_OPERATIONAL', async () => {
    branchAccessService.resolveBranchAccess.mockResolvedValue({
      outcome: 'notOperational',
    });
    const { context } = buildContext({ branchId: BRANCH_ID });

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'BRANCH_NOT_OPERATIONAL',
        message: 'Branch is not currently operational.',
      },
    });
  });

  it('authorized -> attaches the exact safe context and returns true', async () => {
    branchAccessService.resolveBranchAccess.mockResolvedValue({
      outcome: 'authorized',
      context: { branchId: BRANCH_ID },
    });
    const { context, request } = buildContext({ branchId: BRANCH_ID });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.branchAccess).toEqual({ branchId: BRANCH_ID });
  });
});
