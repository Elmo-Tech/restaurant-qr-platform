import { ConflictException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import type { CreateTableDto } from './dto/create-table.dto';
import { TablesController } from './tables.controller';

function buildRequest(params: {
  restaurantId: string;
  branchId: string;
  routeParamRestaurantId?: string;
  routeParamBranchId?: string;
}): BranchAuthorizedRequest {
  return {
    params: {
      restaurantId: params.routeParamRestaurantId ?? params.restaurantId,
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

describe('TablesController', () => {
  let tablesService: { createTable: jest.Mock };
  let controller: TablesController;

  const DTO: CreateTableDto = { tableNumber: 'A1' };
  const CREATED = {
    outcome: 'created' as const,
    data: {
      table: { id: 'table-1', tableNumber: 'A1', status: 'ACTIVE' as const },
      qr: {
        id: 'qr-1',
        publicCode: 'a-public-code',
        status: 'ACTIVE' as const,
      },
    },
  };

  beforeEach(() => {
    tablesService = { createTable: jest.fn().mockResolvedValue(CREATED) };
    controller = new TablesController(tablesService as never);
  });

  describe('guard/permission composition', () => {
    // Nest metadata reflection targets a class method reference without
    // ever invoking it -- not the unintended-`this`-scoping pattern
    // @typescript-eslint/unbound-method guards against.
    /* eslint-disable @typescript-eslint/unbound-method */
    const createTableHandler = TablesController.prototype.createTable;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('declares exactly the settled guard order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        createTableHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        BranchManagementAccessGuard,
        PermissionGuard,
      ]);
    });

    it('requires exactly tables.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        createTableHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.TABLES_MANAGE);
    });
  });

  describe('authorized request contexts', () => {
    it('passes restaurantId from request.restaurantAccess, not the raw route param', async () => {
      const request = buildRequest({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        routeParamRestaurantId: 'attacker-restaurant',
      });

      await controller.createTable(DTO, request);

      expect(tablesService.createTable).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });

    it('passes branchId from request.branchAccess, not the raw route param', async () => {
      const request = buildRequest({
        restaurantId: 'restaurant-1',
        branchId: 'authorized-branch',
        routeParamBranchId: 'attacker-branch',
      });

      await controller.createTable(DTO, request);

      expect(tablesService.createTable).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'authorized-branch' }),
      );
    });

    it('forwards the DTO tableNumber unchanged', async () => {
      await controller.createTable(
        { tableNumber: 'VIP-2' },
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(tablesService.createTable).toHaveBeenCalledWith(
        expect.objectContaining({ tableNumber: 'VIP-2' }),
      );
    });

    it('never forwards a body-supplied restaurantId/branchId/status as authority, even if present', async () => {
      const dtoWithForeignFields = {
        tableNumber: 'A1',
        restaurantId: 'attacker-restaurant',
        branchId: 'attacker-branch',
        status: 'INACTIVE',
      } as CreateTableDto & Record<string, unknown>;

      await controller.createTable(
        dtoWithForeignFields,
        buildRequest({
          restaurantId: 'authorized-restaurant',
          branchId: 'authorized-branch',
        }),
      );

      expect(tablesService.createTable).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        tableNumber: 'A1',
      });
    });
  });

  describe('response envelope', () => {
    it('wraps the created Table/QR in a data envelope, exact shape', async () => {
      const body = await controller.createTable(
        DTO,
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(body).toEqual({ data: CREATED.data });
    });
  });

  describe('duplicate Table Number', () => {
    it('maps a tableNumberConflict outcome to 409 TABLE_NUMBER_ALREADY_EXISTS', async () => {
      tablesService.createTable.mockResolvedValue({
        outcome: 'tableNumberConflict',
      });

      let caught: ConflictException | undefined;
      try {
        await controller.createTable(
          DTO,
          buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
        );
      } catch (error) {
        caught = error as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(caught?.getStatus()).toBe(409);
      expect(caught?.getResponse()).toEqual({
        error: {
          code: 'TABLE_NUMBER_ALREADY_EXISTS',
          message: 'Table number already exists in this Branch.',
        },
      });
    });
  });
});
