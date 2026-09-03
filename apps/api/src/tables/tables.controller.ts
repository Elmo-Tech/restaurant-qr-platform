import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import type { BranchAuthorizedRequest } from '../auth/guard/branch-authorized-request';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { CreateTableDto } from './dto/create-table.dto';
import { TablesService } from './tables.service';
import type { CreatedTable, TableListItem } from './tables.service';

/**
 * Business Foundation L3, settled contract: Table Number conflict reuses no
 * other existing error code. Never `BRANCH_NOT_OPERATIONAL` -- that would
 * conflate a durable uniqueness violation with Branch operational state.
 */
const TABLE_NUMBER_ALREADY_EXISTS_RESPONSE = {
  error: {
    code: 'TABLE_NUMBER_ALREADY_EXISTS',
    message: 'Table number already exists in this Branch.',
  },
};

interface CreateTableResponseBody {
  data: CreatedTable;
}

interface TableListResponseBody {
  data: TableListItem[];
}

/**
 * Business Foundation L3: the first complete Staff Table Creation vertical.
 * `POST /api/v1/restaurants/{restaurantId}/branches/{branchId}/tables`
 * (API_CONVENTIONS.md #114).
 *
 * Table creation is a Branch management/configuration mutation, not an
 * ordinary Branch-scoped business operation -- it uses
 * `BranchManagementAccessGuard`, not `BranchAccessGuard`, so an assigned
 * Branch that is currently `INACTIVE` still authorizes this route (Restaurant
 * operational state is still enforced normally by `RestaurantAccessGuard`).
 * Settled guard order for this route specifically (not a generalized
 * precedent): `AuthGuard` -> `CsrfGuard` -> `RestaurantAccessGuard` ->
 * `BranchManagementAccessGuard` -> `PermissionGuard`
 * (AUTH_TENANCY_SPEC.md #65E). `AllBranchesRequiredGuard` is deliberately
 * never used here -- unlike Create Branch, Table creation is not a
 * Restaurant-structural mutation, so a Branch-scoped MANAGER with
 * `tables.manage` legitimately creates Tables inside their own assigned
 * Branch.
 *
 * `restaurantId`/`branchId` persistence authority come only from
 * `request.restaurantAccess.restaurantId` / `request.branchAccess.branchId`
 * -- the already-authorized safe contexts -- never from the raw
 * `:restaurantId`/`:branchId` route parameters directly and never from the
 * request body.
 */
@Controller('restaurants/:restaurantId/branches/:branchId/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  async createTable(
    @Body() dto: CreateTableDto,
    @Req() request: BranchAuthorizedRequest,
  ): Promise<CreateTableResponseBody> {
    const result = await this.tablesService.createTable({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
      tableNumber: dto.tableNumber,
    });

    if (result.outcome === 'tableNumberConflict') {
      throw new ConflictException(TABLE_NUMBER_ALREADY_EXISTS_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Business Foundation O, settled contract: the Staff-facing Table
   * Management list for one authorized Branch (API_CONVENTIONS.md #114A).
   * This is a management/configuration read, not an ordinary Branch-scoped
   * business operation -- it reuses Table Creation's exact access model
   * (`BranchManagementAccessGuard`, not `BranchAccessGuard`), so Staff can
   * inspect Tables already configured inside an `INACTIVE` Branch before
   * activation. `RestaurantAccessGuard` still applies unchanged. GET is
   * read-only, so no `CsrfGuard` (AUTH_TENANCY_SPEC.md #106A). Settled
   * guard order for this route specifically: `AuthGuard` ->
   * `RestaurantAccessGuard` -> `BranchManagementAccessGuard` ->
   * `PermissionGuard` (AUTH_TENANCY_SPEC.md #65H). Returns both `ACTIVE`
   * and `INACTIVE` Tables -- no status filter.
   */
  @Get()
  @UseGuards(
    AuthGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  async listTables(
    @Req() request: BranchAuthorizedRequest,
  ): Promise<TableListResponseBody> {
    const data = await this.tablesService.listTables({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
    });

    return { data };
  }
}
