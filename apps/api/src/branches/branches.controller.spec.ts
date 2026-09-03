import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
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

function buildActivateRequest(params: {
  restaurantId: string;
  branchId: string;
  routeParamBranchId?: string;
}): BranchAuthorizedRequest {
  return {
    params: {
      restaurantId: params.restaurantId,
      branchId: params.routeParamBranchId ?? params.branchId,
    },
    restaurantAccess: {
      membershipId: 'membership-1',
      restaurantId: params.restaurantId,
      role: 'OWNER',
      allBranches: true,
    },
    branchAccess: { branchId: params.branchId },
  } as unknown as BranchAuthorizedRequest;
}

describe('BranchesController', () => {
  let branchesService: {
    listBranches: jest.Mock;
    createBranch: jest.Mock;
    activateBranch: jest.Mock;
  };
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
      activateBranch: jest
        .fn()
        .mockResolvedValue({ id: 'branch-1', status: 'ACTIVE' }),
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

  describe('activateBranch', () => {
    // Nest metadata reflection targets a class method reference without
    // ever invoking it -- not the unintended-`this`-scoping pattern
    // @typescript-eslint/unbound-method guards against.
    /* eslint-disable @typescript-eslint/unbound-method */
    const activateBranchHandler = BranchesController.prototype.activateBranch;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('A. declares exactly the settled guard order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        activateBranchHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        BranchManagementAccessGuard,
        PermissionGuard,
      ]);
    });

    it('B. requires exactly branches.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        activateBranchHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.BRANCHES_MANAGE);
    });

    it('E. never declares AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        activateBranchHandler,
      ) as unknown[];

      expect(guards).not.toContain(AllBranchesRequiredGuard);
    });

    it('F. never declares BranchAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        activateBranchHandler,
      ) as unknown[];

      expect(guards).not.toContain(BranchAccessGuard);
    });

    it('C. passes branchId from request.branchAccess, not the raw route param', async () => {
      const request = buildActivateRequest({
        restaurantId: 'restaurant-1',
        branchId: 'authorized-branch',
        routeParamBranchId: 'attacker-branch',
      });

      await controller.activateBranch(request);

      expect(branchesService.activateBranch).toHaveBeenCalledWith({
        branchId: 'authorized-branch',
      });
    });

    it('D. wraps the result in the exact data envelope', async () => {
      branchesService.activateBranch.mockResolvedValue({
        id: 'branch-1',
        status: 'ACTIVE',
      });

      const body = await controller.activateBranch(
        buildActivateRequest({
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        }),
      );

      expect(body).toEqual({ data: { id: 'branch-1', status: 'ACTIVE' } });
    });
  });
});
