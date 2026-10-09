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
import { OpenSessionDto } from './dto/open-session.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { TableSessionsService } from './table-sessions.service';
import type {
  SessionDetail,
  SessionListItem,
  SessionScope,
} from './table-sessions.service';

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
  data: SessionListItem[];
}

interface SessionDetailResponseBody {
  data: SessionDetail;
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
 * Staff Table Session routes (Table Sessions design v3). Like Orders, sessions
 * are operational Branch data: there is deliberately NO `AllBranchesRequiredGuard`
 * and no `:branchId` path segment; Branch scope is resolved per row inside
 * `TableSessionsService`. Each route carries ONE static Permission:
 * `sessions.view` (reads), `sessions.open`, `sessions.close`, `sessions.settle`
 * (record and void payments). Closing with `pendingOrders: "REJECT"` additionally
 * needs `orders.reject`, which a static guard cannot express, so the service
 * checks it and reports `permissionDenied`.
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
      payment: query.payment,
      limit: query.limit,
    });
    return { data };
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
    return { data: result.data };
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
    return { data: result.data };
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
    return { data: result.data };
  }

  @Post(':sessionId/payments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_SETTLE)
  async recordPayment(
    @Param('sessionId') sessionId: string,
    @Body() dto: RecordPaymentDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionDetailResponseBody> {
    const result = await this.sessions.recordPayment(
      scopeOf(request),
      sessionId,
      {
        clientRequestId: dto.clientRequestId,
        method: dto.method,
        expectedAmount: dto.expectedAmount,
        note: dto.note,
      },
    );
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'notClosed') {
      throw new ConflictException({
        error: {
          code: 'SESSION_NOT_CLOSED',
          message: 'A payment can only be recorded on a closed session.',
        },
      });
    }
    if (result.outcome === 'nothingToSettle') {
      throw new ConflictException({
        error: {
          code: 'NOTHING_TO_SETTLE',
          message: 'This session has no outstanding balance.',
        },
      });
    }
    if (result.outcome === 'amountMismatch') {
      throw new ConflictException({
        error: {
          code: 'PAYMENT_AMOUNT_MISMATCH',
          message:
            'The balance changed. Review the current balance and try again.',
          details: { balance: result.balance },
        },
      });
    }
    return { data: result.data };
  }

  @Post(':sessionId/payments/:paymentId/void')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.SESSIONS_SETTLE)
  async voidPayment(
    @Param('sessionId') sessionId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidPaymentDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<SessionDetailResponseBody> {
    const result = await this.sessions.voidPayment(
      scopeOf(request),
      sessionId,
      paymentId,
      dto.reason,
    );
    if (result.outcome === 'notFound') {
      throw new NotFoundException(SESSION_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'paymentNotFound') {
      throw new NotFoundException({
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment record not found.',
        },
      });
    }
    if (result.outcome === 'alreadyVoided') {
      throw new ConflictException({
        error: {
          code: 'PAYMENT_ALREADY_VOIDED',
          message: 'This payment record was already voided.',
        },
      });
    }
    return { data: result.data };
  }
}
