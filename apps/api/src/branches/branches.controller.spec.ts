import { BranchesController } from './branches.controller';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import type { CreateBranchDto } from './dto/create-branch.dto';

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
  let branchesService: { listBranches: jest.Mock; createBranch: jest.Mock };
  let controller: BranchesController;

  beforeEach(() => {
    branchesService = {
      listBranches: jest.fn().mockResolvedValue([]),
      createBranch: jest.fn().mockResolvedValue({
        id: 'new-branch-id',
        name: 'Maadi',
        status: 'INACTIVE',
        timezone: 'Africa/Cairo',
        phone: null,
        address: null,
      }),
    };
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

  describe('createBranch', () => {
    const DTO: CreateBranchDto = {
      name: 'Maadi',
      timezone: 'Africa/Cairo',
      phone: null,
      address: null,
    };

    it('passes restaurantId from request.restaurantAccess, not the raw route param', async () => {
      const request = buildRequest({
        restaurantId: 'authorized-restaurant',
        membershipId: 'membership-1',
        allBranches: true,
        routeParamRestaurantId: 'other-value',
      });

      await controller.createBranch(DTO, request);

      expect(branchesService.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });

    it('forwards DTO name and timezone unchanged', async () => {
      await controller.createBranch(
        DTO,
        buildRequest({
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: true,
        }),
      );

      expect(branchesService.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Maadi', timezone: 'Africa/Cairo' }),
      );
    });

    it('defaults phone/address to null when the DTO omits them', async () => {
      const dtoWithoutOptional: CreateBranchDto = {
        name: 'Maadi',
        timezone: 'Africa/Cairo',
      };

      await controller.createBranch(
        dtoWithoutOptional,
        buildRequest({
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: true,
        }),
      );

      expect(branchesService.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ phone: null, address: null }),
      );
    });

    it('wraps the created Branch in a data envelope', async () => {
      const created = {
        id: 'b1',
        name: 'Maadi',
        status: 'INACTIVE' as const,
        timezone: 'Africa/Cairo',
        phone: null,
        address: null,
      };
      branchesService.createBranch.mockResolvedValue(created);

      const body = await controller.createBranch(
        DTO,
        buildRequest({
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: true,
        }),
      );

      expect(body).toEqual({ data: created });
    });

    it('never sends anything from the DTO as restaurantId authority, even if present', async () => {
      const dtoWithForeignField = {
        ...DTO,
        restaurantId: 'attacker-supplied-restaurant',
      } as CreateBranchDto & { restaurantId: string };

      await controller.createBranch(
        dtoWithForeignField,
        buildRequest({
          restaurantId: 'authorized-restaurant',
          membershipId: 'membership-1',
          allBranches: true,
        }),
      );

      expect(branchesService.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });
  });
});
