import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
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
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';
import type {
  CreatedTable,
  TableDetail,
  TableListItem,
  UpdatedTable,
} from './tables.service';

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

/**
 * Business Foundation P, settled contract: one existence-hiding response for
 * every Table identity/ownership failure (malformed id, unknown id,
 * foreign-Branch id, foreign-Restaurant id) -- never a distinct public
 * reason, consistent with the Restaurant/Branch `_NOT_FOUND` convention
 * (AUTH_TENANCY_SPEC.md #61A/#65A). No request-supplied value ever appears
 * in the message.
 */
const TABLE_NOT_FOUND_RESPONSE = {
  error: {
    code: 'TABLE_NOT_FOUND',
    message: 'Table not found.',
  },
};

interface CreateTableResponseBody {
  data: CreatedTable;
}

interface TableListResponseBody {
  data: TableListItem[];
}

interface TableDetailResponseBody {
  data: TableDetail;
}

interface UpdateTableResponseBody {
  data: UpdatedTable;
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

  /**
   * Business Foundation P, settled contract: the Staff-facing Table Detail
   * read for one Table already contained inside one authorized Branch
   * (API_CONVENTIONS.md #114B). Reuses List's exact access model
   * (`BranchManagementAccessGuard`, `tables.view`) -- both `ACTIVE` and
   * `INACTIVE` Branches and Tables are visible. `RestaurantAccessGuard`
   * still applies unchanged. GET is read-only, so no `CsrfGuard`.
   *
   * Settled guard order for this route specifically: `AuthGuard` ->
   * `RestaurantAccessGuard` -> `BranchManagementAccessGuard` ->
   * `PermissionGuard` (AUTH_TENANCY_SPEC.md #65I). `:tableId` is resource
   * IDENTIFICATION, not authorization -- it is trusted only after
   * `TablesService.getTableDetail`'s Tenant/Branch-scoped lookup actually
   * finds a matching row (`restaurantId`/`branchId` come only from the
   * already-authorized request contexts). No `TableAccessGuard` exists or
   * is introduced -- Table resource ownership is enforced by the business
   * lookup itself, which only runs after this entire guard chain
   * (including `PermissionGuard`) has already succeeded: a caller lacking
   * `tables.view` receives `PERMISSION_DENIED` before the application ever
   * attempts to disclose whether a Table id exists.
   *
   * A `notFound` service outcome (malformed id, unknown id, foreign-Branch
   * id, or foreign-Restaurant id -- all indistinguishable) maps to the one
   * `404 TABLE_NOT_FOUND` contract.
   */
  @Get(':tableId')
  @UseGuards(
    AuthGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  async getTableDetail(
    @Param('tableId') tableId: string,
    @Req() request: BranchAuthorizedRequest,
  ): Promise<TableDetailResponseBody> {
    const result = await this.tablesService.getTableDetail({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
      tableId,
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(TABLE_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  /**
   * Business Foundation Q, settled contract: partial update of one Table's
   * basic info (`tableNumber` only) for a Table already contained inside
   * one authorized Branch (API_CONVENTIONS.md #114C). Reuses List/Detail's
   * exact Branch access model (`BranchManagementAccessGuard`, both `ACTIVE`
   * and `INACTIVE` Branches/Tables editable) and Foundation P's exact Table
   * identity/ownership contract (`TABLE_NOT_FOUND` existence-hides every
   * malformed/unknown/foreign-Branch/foreign-Restaurant `tableId`
   * identically). This is an unsafe mutation, so `CsrfGuard` applies.
   *
   * Settled guard order for this route specifically: `AuthGuard` ->
   * `CsrfGuard` -> `RestaurantAccessGuard` -> `BranchManagementAccessGuard`
   * -> `PermissionGuard` (AUTH_TENANCY_SPEC.md #65J). The Table resource is
   * resolved only after this entire guard chain (including
   * `PermissionGuard`) succeeds -- a caller lacking `tables.manage`
   * receives `PERMISSION_DENIED` before the application ever attempts to
   * disclose whether a Table id exists. No `TableAccessGuard` exists or is
   * introduced.
   *
   * `restaurantId`/`branchId` authority come only from
   * `request.restaurantAccess`/`request.branchAccess`; `tableId` is the raw
   * route identifier (identification only); `tableNumber` comes only from
   * the DTO. An omitted `tableNumber` (including an empty body `{}`) is a
   * true no-op, handled entirely inside `TablesService.updateTable` -- the
   * response is still `200` with the Table's current data.
   */
  @Patch(':tableId')
  @UseGuards(
    AuthGuard,
    CsrfGuard,
    RestaurantAccessGuard,
    BranchManagementAccessGuard,
    PermissionGuard,
  )
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  async updateTable(
    @Param('tableId') tableId: string,
    @Body() dto: UpdateTableDto,
    @Req() request: BranchAuthorizedRequest,
  ): Promise<UpdateTableResponseBody> {
    const result = await this.tablesService.updateTable({
      restaurantId: request.restaurantAccess.restaurantId,
      branchId: request.branchAccess.branchId,
      tableId,
      tableNumber: dto.tableNumber,
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(TABLE_NOT_FOUND_RESPONSE);
    }

    if (result.outcome === 'tableNumberConflict') {
      throw new ConflictException(TABLE_NUMBER_ALREADY_EXISTS_RESPONSE);
    }

    return { data: result.data };
  }
}
