import { ConflictException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import type { CreateTableDto } from './dto/create-table.dto';
import type { UpdateTableDto } from './dto/update-table.dto';
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
  let tablesService: {
    createTable: jest.Mock;
    listTables: jest.Mock;
    getTableDetail: jest.Mock;
    updateTable: jest.Mock;
  };
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
    tablesService = {
      createTable: jest.fn().mockResolvedValue(CREATED),
      listTables: jest.fn().mockResolvedValue([]),
      getTableDetail: jest.fn().mockResolvedValue({ outcome: 'notFound' }),
      updateTable: jest.fn().mockResolvedValue({ outcome: 'notFound' }),
    };
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

  describe('listTables', () => {
    // Nest metadata reflection targets a class method reference without
    // ever invoking it -- not the unintended-`this`-scoping pattern
    // @typescript-eslint/unbound-method guards against.
    /* eslint-disable @typescript-eslint/unbound-method */
    const listTablesHandler = TablesController.prototype.listTables;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('A. declares exactly the settled guard order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        listTablesHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        RestaurantAccessGuard,
        BranchManagementAccessGuard,
        PermissionGuard,
      ]);
    });

    it('B. requires exactly tables.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        listTablesHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.TABLES_VIEW);
    });

    it('C. never declares CsrfGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        listTablesHandler,
      ) as unknown[];

      expect(guards).not.toContain(CsrfGuard);
    });

    it('D. never declares BranchAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        listTablesHandler,
      ) as unknown[];

      expect(guards).not.toContain(BranchAccessGuard);
    });

    it('E. never declares AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        listTablesHandler,
      ) as unknown[];

      expect(guards).not.toContain(AllBranchesRequiredGuard);
    });

    it('F. passes restaurantId from request.restaurantAccess, not the raw route param', async () => {
      const request = buildRequest({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        routeParamRestaurantId: 'attacker-restaurant',
      });

      await controller.listTables(request);

      expect(tablesService.listTables).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });

    it('G. passes branchId from request.branchAccess, not the raw route param', async () => {
      const request = buildRequest({
        restaurantId: 'restaurant-1',
        branchId: 'authorized-branch',
        routeParamBranchId: 'attacker-branch',
      });

      await controller.listTables(request);

      expect(tablesService.listTables).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'authorized-branch' }),
      );
    });

    it('H. wraps the result in the exact { data } envelope', async () => {
      const rows = [
        { id: 'table-1', tableNumber: 'A1', status: 'ACTIVE' as const },
        { id: 'table-2', tableNumber: 'B2', status: 'INACTIVE' as const },
      ];
      tablesService.listTables.mockResolvedValue(rows);

      const body = await controller.listTables(
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(body).toEqual({ data: rows });
    });

    it('returns an empty array as data, not an error, for a Branch with zero Tables', async () => {
      tablesService.listTables.mockResolvedValue([]);

      const body = await controller.listTables(
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(body).toEqual({ data: [] });
    });
  });

  describe('getTableDetail', () => {
    const FOUND = {
      outcome: 'found' as const,
      data: {
        id: 'table-1',
        tableNumber: 'A1',
        status: 'ACTIVE' as const,
        qr: {
          id: 'qr-1',
          publicCode: 'a-public-code',
          status: 'ACTIVE' as const,
        },
      },
    };

    // Nest metadata reflection targets a class method reference without
    // ever invoking it -- not the unintended-`this`-scoping pattern
    // @typescript-eslint/unbound-method guards against.
    /* eslint-disable @typescript-eslint/unbound-method */
    const getTableDetailHandler = TablesController.prototype.getTableDetail;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('A. declares exactly the settled guard order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTableDetailHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        RestaurantAccessGuard,
        BranchManagementAccessGuard,
        PermissionGuard,
      ]);
    });

    it('B. requires exactly tables.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        getTableDetailHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.TABLES_VIEW);
    });

    it('C. never declares CsrfGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTableDetailHandler,
      ) as unknown[];

      expect(guards).not.toContain(CsrfGuard);
    });

    it('D. never declares BranchAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTableDetailHandler,
      ) as unknown[];

      expect(guards).not.toContain(BranchAccessGuard);
    });

    it('E. never declares AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTableDetailHandler,
      ) as unknown[];

      expect(guards).not.toContain(AllBranchesRequiredGuard);
    });

    it('F. passes restaurantId from request.restaurantAccess, not the raw route param', async () => {
      tablesService.getTableDetail.mockResolvedValue(FOUND);
      const request = buildRequest({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        routeParamRestaurantId: 'attacker-restaurant',
      });

      await controller.getTableDetail('table-1', request);

      expect(tablesService.getTableDetail).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });

    it('G. passes branchId from request.branchAccess, not the raw route param', async () => {
      tablesService.getTableDetail.mockResolvedValue(FOUND);
      const request = buildRequest({
        restaurantId: 'restaurant-1',
        branchId: 'authorized-branch',
        routeParamBranchId: 'attacker-branch',
      });

      await controller.getTableDetail('table-1', request);

      expect(tablesService.getTableDetail).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'authorized-branch' }),
      );
    });

    it('H. tableId comes from the :tableId identifier', async () => {
      tablesService.getTableDetail.mockResolvedValue(FOUND);

      await controller.getTableDetail(
        'table-identifier',
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(tablesService.getTableDetail).toHaveBeenCalledWith(
        expect.objectContaining({ tableId: 'table-identifier' }),
      );
    });

    it('I. service notFound -> exact 404 TABLE_NOT_FOUND', async () => {
      tablesService.getTableDetail.mockResolvedValue({ outcome: 'notFound' });

      let caught: NotFoundException | undefined;
      try {
        await controller.getTableDetail(
          'table-1',
          buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
        );
      } catch (error) {
        caught = error as NotFoundException;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(caught?.getStatus()).toBe(404);
      expect(caught?.getResponse()).toEqual({
        error: { code: 'TABLE_NOT_FOUND', message: 'Table not found.' },
      });
    });

    it('J. service found -> exact { data } envelope', async () => {
      tablesService.getTableDetail.mockResolvedValue(FOUND);

      const body = await controller.getTableDetail(
        'table-1',
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(body).toEqual({ data: FOUND.data });
    });

    it('K. no Table-specific access guard exists in the guard chain', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTableDetailHandler,
      ) as unknown[];

      expect(
        guards.map((guard) => (guard as { name: string }).name),
      ).not.toContain('TableAccessGuard');
    });
  });

  describe('updateTable', () => {
    const UPDATE_DTO: UpdateTableDto = { tableNumber: 'A2' };
    const UPDATED = {
      outcome: 'updated' as const,
      data: { id: 'table-1', tableNumber: 'A2', status: 'ACTIVE' as const },
    };

    // Nest metadata reflection targets a class method reference without
    // ever invoking it -- not the unintended-`this`-scoping pattern
    // @typescript-eslint/unbound-method guards against.
    /* eslint-disable @typescript-eslint/unbound-method */
    const updateTableHandler = TablesController.prototype.updateTable;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('A. declares exactly the settled guard order', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateTableHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        BranchManagementAccessGuard,
        PermissionGuard,
      ]);
    });

    it('B. requires exactly tables.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        updateTableHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.TABLES_MANAGE);
    });

    it('C. never declares BranchAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateTableHandler,
      ) as unknown[];

      expect(guards).not.toContain(BranchAccessGuard);
    });

    it('D. never declares AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateTableHandler,
      ) as unknown[];

      expect(guards).not.toContain(AllBranchesRequiredGuard);
    });

    it('E. no Table-specific access guard exists in the guard chain', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateTableHandler,
      ) as unknown[];

      expect(
        guards.map((guard) => (guard as { name: string }).name),
      ).not.toContain('TableAccessGuard');
    });

    it('F. passes restaurantId from request.restaurantAccess, not the raw route param', async () => {
      tablesService.updateTable.mockResolvedValue(UPDATED);
      const request = buildRequest({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        routeParamRestaurantId: 'attacker-restaurant',
      });

      await controller.updateTable('table-1', UPDATE_DTO, request);

      expect(tablesService.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: 'authorized-restaurant' }),
      );
    });

    it('G. passes branchId from request.branchAccess, not the raw route param', async () => {
      tablesService.updateTable.mockResolvedValue(UPDATED);
      const request = buildRequest({
        restaurantId: 'restaurant-1',
        branchId: 'authorized-branch',
        routeParamBranchId: 'attacker-branch',
      });

      await controller.updateTable('table-1', UPDATE_DTO, request);

      expect(tablesService.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'authorized-branch' }),
      );
    });

    it('H. tableId comes from the route identifier', async () => {
      tablesService.updateTable.mockResolvedValue(UPDATED);

      await controller.updateTable(
        'table-identifier',
        UPDATE_DTO,
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(tablesService.updateTable).toHaveBeenCalledWith(
        expect.objectContaining({ tableId: 'table-identifier' }),
      );
    });

    it('I. the DTO supplies only tableNumber', async () => {
      tablesService.updateTable.mockResolvedValue(UPDATED);
      const dtoWithForeignFields = {
        tableNumber: 'A2',
        status: 'INACTIVE',
        restaurantId: 'attacker-restaurant',
        branchId: 'attacker-branch',
      } as UpdateTableDto & Record<string, unknown>;

      await controller.updateTable(
        'table-1',
        dtoWithForeignFields,
        buildRequest({
          restaurantId: 'authorized-restaurant',
          branchId: 'authorized-branch',
        }),
      );

      expect(tablesService.updateTable).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        branchId: 'authorized-branch',
        tableId: 'table-1',
        tableNumber: 'A2',
      });
    });

    it('J. service notFound -> exact 404 TABLE_NOT_FOUND', async () => {
      tablesService.updateTable.mockResolvedValue({ outcome: 'notFound' });

      let caught: NotFoundException | undefined;
      try {
        await controller.updateTable(
          'table-1',
          UPDATE_DTO,
          buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
        );
      } catch (error) {
        caught = error as NotFoundException;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(caught?.getStatus()).toBe(404);
      expect(caught?.getResponse()).toEqual({
        error: { code: 'TABLE_NOT_FOUND', message: 'Table not found.' },
      });
    });

    it('K. service tableNumberConflict -> exact 409 TABLE_NUMBER_ALREADY_EXISTS', async () => {
      tablesService.updateTable.mockResolvedValue({
        outcome: 'tableNumberConflict',
      });

      let caught: ConflictException | undefined;
      try {
        await controller.updateTable(
          'table-1',
          UPDATE_DTO,
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

    it('L. success -> exact { data } envelope', async () => {
      tablesService.updateTable.mockResolvedValue(UPDATED);

      const body = await controller.updateTable(
        'table-1',
        UPDATE_DTO,
        buildRequest({ restaurantId: 'restaurant-1', branchId: 'branch-1' }),
      );

      expect(body).toEqual({ data: UPDATED.data });
    });
  });
});
