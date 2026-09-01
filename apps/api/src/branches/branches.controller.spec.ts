import { BranchesController } from './branches.controller';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';

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

describe('BranchesController', () => {
  let branchesService: { listBranches: jest.Mock };
  let controller: BranchesController;

  beforeEach(() => {
    branchesService = { listBranches: jest.fn().mockResolvedValue([]) };
    controller = new BranchesController(branchesService as never);
  });

  it('passes restaurantId, membershipId, and allBranches from request.restaurantAccess, not the raw route param', async () => {
    const request = buildRequest({
      restaurantId: 'authorized-restaurant',
      membershipId: 'membership-1',
      allBranches: false,
      routeParamRestaurantId: 'other-value',
    });

    await controller.listBranches(request);

    expect(branchesService.listBranches).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      membershipId: 'membership-1',
      allBranches: false,
    });
  });

  it('forwards allBranches=true unchanged', async () => {
    const request = buildRequest({
      restaurantId: 'restaurant-1',
      membershipId: 'membership-1',
      allBranches: true,
    });

    await controller.listBranches(request);

    expect(branchesService.listBranches).toHaveBeenCalledWith(
      expect.objectContaining({ allBranches: true }),
    );
  });

  it('wraps the result in a data envelope', async () => {
    const rows = [{ id: 'b1', name: 'Maadi', status: 'ACTIVE' as const }];
    branchesService.listBranches.mockResolvedValue(rows);

    const body = await controller.listBranches(
      buildRequest({
        restaurantId: 'restaurant-1',
        membershipId: 'membership-1',
        allBranches: true,
      }),
    );

    expect(body).toEqual({ data: rows });
  });

  it('returns an empty array as data, not an error, when the scope has zero Branches', async () => {
    branchesService.listBranches.mockResolvedValue([]);

    const body = await controller.listBranches(
      buildRequest({
        restaurantId: 'restaurant-1',
        membershipId: 'membership-1',
        allBranches: false,
      }),
    );

    expect(body).toEqual({ data: [] });
  });
});
