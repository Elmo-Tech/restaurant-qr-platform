import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { CloseSessionDto } from './dto/close-session.dto';
import { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import { BoardQueryDto } from './dto/board-query.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import {
  toStaffBoardRow,
  toStaffDetail,
  toStaffListItem,
  toStaffSummary,
  type StaffSessionDetail,
  type StaffSessionListItem,
  type StaffSessionSummaryDocument,
  type StaffTableBoardRow,
} from './session-v1-view';
import { TableSessionsService } from './table-sessions.service';
import type { SessionScope } from './table-sessions.service';

/** One stable, existence-hiding response for an unknown, foreign-Restaurant or out-of-Branch-scope session. */
const SESSION_NOT_FOUND_RESPONSE = {
  error: {
    code: 'TABLE_SESSION_NOT_FOUND',
    message: 'Table session not found.',
  },
};

const TABLE_NOT_FOUND_RESPONSE = {
  error: { code: 'TABLE_NOT_FOUND', message: 'Table not found.' },
};

const PERMISSION_DENIED_RESPONSE = {
  error: {
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  },
};

interface SessionListResponseBody {
  data: StaffSessionListItem[];
}

interface SessionDetailResponseBody {
  data: StaffSessionDetail;
}

function scopeOf(request: RestaurantAuthorizedRequest): SessionScope {
  return {
    restaurantId: request.restaurantAccess.restaurantId,
    membershipId: request.restaurantAccess.membershipId,
    allBranches: request.restaurantAccess.allBranches,
    role: request.restaurantAccess.role,
    roleId: request.restaurantAccess.roleId,
    permissions: request.restaurantAccess.permissions,
  };
}

/**
 * Staff Table Session routes (Table Sessions design v3, V1 scope correction).
 * Like Orders, sessions are operational Branch data: there is deliberately NO
 * `AllBranchesRequiredGuard` and no `:branchId` path segment; Branch scope is
 * resolved per row inside `TableSessionsService`. Each route carries ONE static
 * Permission: `sessions.view` (reads), `sessions.open`, `sessions.close`.
 * Closing with `pendingOrders: "REJECT"` additionally needs `orders.reject`,
 * which a static guard cannot express, so the service checks it and reports
 * `permissionDenied`.
 *
 * V1 manages no payments: there is deliberately NO route that records or voids
 * a payment, and every response goes through `session-v1-view.ts`, which
 * carries order totals only. The payment ledger and its service methods are
 * deferred POS-integration infrastructure that no V1 client can reach.
 */
@Controller('restaurants/:restaurantId/table-sessions')
export class TableSessionsController {
  constructor(private readonly sessions: TableSessionsService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_VIEW)
  async list(
    @Query() query: ListSessionsQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionListResponseBody> {
    const data = await this.sessions.listSessions(scopeOf(request), {
      branchId: query.branchId,
      tableId: query.tableId,
      status: query.status,
      limit: query.limit,
    });
    return { data: data.map(toStaffListItem) };
  }

  /**
   * Dashboard board: every table in the caller's Branch scope with its ordering
   * availability and live session summary. Declared BEFORE `:sessionId` so
   * "board" is never read as a session id.
   */
  @Get('board')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_VIEW)
  async board(
    @Query() query: BoardQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffTableBoardRow[] }> {
    const data = await this.sessions.getBoard(scopeOf(request), {
      branchId: query.branchId,
    });
    return { data: data.map(toStaffBoardRow) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_OPEN)
  async open(
    @Body() dto: OpenSessionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionDetailResponseBody> {
    const result = await this.sessions.openSession(scopeOf(request), {
      tableId: dto.tableId,
    });
    if (result.outcome === 'tableNotFound') {
      throw new NotFoundException(TABLE_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'tableInactive') {
      throw new ConflictException({
        error: {
          code: 'TABLE_INACTIVE',
          message: 'This table is inactive, so a session cannot be opened.',
        },
      });
    }
    if (result.outcome === 'alreadyOpen') {
      throw new ConflictException({
        error: {
          code: 'TABLE_SESSION_ALREADY_OPEN',
          message: 'This table already has an open session.',
          details: { sessionId: result.sessionId },
        },
      });
    }
    return { data: toStaffDetail(result.data) };
  }

  @Get(':sessionId')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_VIEW)
  async detail(
    @Param('sessionId') sessionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionDetailResponseBody> {
    const result = await this.sessions.getSession(scopeOf(request), sessionId);
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    return { data: toStaffDetail(result.data) };
  }

  /**
   * The combined table order summary document (accepted orders by round, pending
   * orders separately, order totals). The route keeps its `/bill` path for
   * contract stability; it carries no payment information.
   */
  @Get(':sessionId/bill')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_VIEW)
  async bill(
    @Param('sessionId') sessionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: StaffSessionSummaryDocument }> {
    const result = await this.sessions.getBill(scopeOf(request), sessionId);
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    return { data: toStaffSummary(result.data) };
  }

  /** Audit only: the staff member pressed Print on the order summary. Changes nothing about the session. */
  @Post(':sessionId/bill/printed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_VIEW)
  async billPrinted(
    @Param('sessionId') sessionId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<{ data: { recorded: true } }> {
    const result = await this.sessions.recordBillPrinted(
      scopeOf(request),
      sessionId,
    );
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    return { data: { recorded: true } };
  }

  @Post(':sessionId/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_CLOSE)
  async close(
    @Param('sessionId') sessionId: string,
    @Body() dto: CloseSessionDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionDetailResponseBody> {
    const result = await this.sessions.closeSession(
      scopeOf(request),
      sessionId,
      dto,
    );
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'permissionDenied') {
      throw new ForbiddenException(PERMISSION_DENIED_RESPONSE);
    }
    if (result.outcome === 'pendingOrders') {
      throw new ConflictException({
        error: {
          code: 'SESSION_HAS_PENDING_ORDERS',
          message:
            'This session has pending orders. Choose whether to keep or reject them before closing.',
          details: { pendingOrderCount: result.pendingOrderCount },
        },
      });
    }
    return { data: toStaffDetail(result.data) };
  }
}
