import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildContext(params: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Partial<RestaurantAuthorizedRequest>;
} {
  const request: Partial<RestaurantAuthorizedRequest> = {
    auth: {
      sessionId: 'session-1',
      userId: USER_ID,
      expiresAt: new Date(),
      lastSeenAt: new Date(),
      userState: 'ACTIVE',
    },
    params,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('RestaurantAccessGuard', () => {
  let restaurantAccessService: { resolveRestaurantAccess: jest.Mock };
  let guard: RestaurantAccessGuard;

  beforeEach(() => {
    restaurantAccessService = { resolveRestaurantAccess: jest.fn() };
    guard = new RestaurantAccessGuard(restaurantAccessService as never);
  });

  it('reads the authenticated userId from request.auth, never elsewhere', async () => {
    restaurantAccessService.resolveRestaurantAccess.mockResolvedValue({
      outcome: 'authorized',
      context: {
        membershipId: 'm1',
        restaurantId: RESTAURANT_ID,
        role: 'OWNER',
        allBranches: true,
      },
    });
    const { context } = buildContext({ restaurantId: RESTAURANT_ID });

    await guard.canActivate(context);

    expect(
      restaurantAccessService.resolveRestaurantAccess,
    ).toHaveBeenCalledWith(USER_ID, RESTAURANT_ID);
  });

  it('reads only the canonical restaurantId route parameter', async () => {
    restaurantAccessService.resolveRestaurantAccess.mockResolvedValue({
      outcome: 'notFound',
    });
    const { context } = buildContext({
      restaurantId: RESTAURANT_ID,
      somethingElse: 'ignored',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

    expect(
      restaurantAccessService.resolveRestaurantAccess,
    ).toHaveBeenCalledWith(USER_ID, RESTAURANT_ID);
  });

  it('notFound -> 404 RESTAURANT_NOT_FOUND', async () => {
    restaurantAccessService.resolveRestaurantAccess.mockResolvedValue({
      outcome: 'notFound',
    });
    const { context } = buildContext({ restaurantId: RESTAURANT_ID });

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(caught?.getResponse()).toEqual({
      error: { code: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' },
    });
  });

  it('notOperational -> 409 RESTAURANT_NOT_OPERATIONAL', async () => {
    restaurantAccessService.resolveRestaurantAccess.mockResolvedValue({
      outcome: 'notOperational',
    });
    const { context } = buildContext({ restaurantId: RESTAURANT_ID });

    let caught: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      caught = error as HttpException;
    }

    expect(caught?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(caught?.getResponse()).toEqual({
      error: {
        code: 'RESTAURANT_NOT_OPERATIONAL',
        message: 'Restaurant is not currently operational.',
      },
    });
  });

  it('authorized -> attaches the exact safe context and returns true', async () => {
    const safeContext = {
      membershipId: 'm1',
      restaurantId: RESTAURANT_ID,
      role: 'WAITER',
      allBranches: false,
    };
    restaurantAccessService.resolveRestaurantAccess.mockResolvedValue({
      outcome: 'authorized',
      context: safeContext,
    });
    const { context, request } = buildContext({ restaurantId: RESTAURANT_ID });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.restaurantAccess).toEqual(safeContext);
  });
});
