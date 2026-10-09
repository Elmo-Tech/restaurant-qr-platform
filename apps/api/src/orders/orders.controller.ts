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
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { RequirePermission } from '../auth/permission/require-permission.decorator';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';
import type { OrderDetail, OrderListItem } from './orders.service';

/**
 * FT-5, settled contract: one stable existence-hiding response for every
 * Order identity/ownership/Branch-scope failure (malformed id, unknown id,
 * foreign-Restaurant id, or a Branch outside the Membership's authorized
 * scope) -- never a distinct public reason, mirroring the existing
 * `TABLE_NOT_FOUND`/`CATEGORY_NOT_FOUND` convention exactly.
 */
const ORDER_NOT_FOUND_RESPONSE = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
};

const ORDER_INVALID_TRANSITION_RESPONSE = {
  error: {
    code: 'ORDER_INVALID_TRANSITION',
    message: 'This status change is not allowed from the Order’s current status.',
  },
};

/**
 * Section 14: the Staff member's UI believed the Order was in a status it
 * no longer is -- another Staff member (or the same one, twice) already
 * changed it. The current status is included so the Web can refresh and
 * show the User what actually happened, without a second round trip.
 */
function orderStatusChangedResponse(currentStatus: string) {
  return {
    error: {
      code: 'ORDER_STATUS_CHANGED',
      message: 'This Order was already updated by someone else.',
      details: { currentStatus },
    },
  };
}

interface OrderListResponseBody {
  data: OrderListItem[];
}

interface OrderDetailResponseBody {
  data: OrderDetail;
}

/**
 * FT-5: the Staff-facing Order read/status-transition routes,
 * `/api/v1/restaurants/{restaurantId}/orders[...]`. Order is operational
 * Branch/Table data (Section 15) -- deliberately NO `AllBranchesRequiredGuard`
 * anywhere here (unlike Menu's Restaurant-structural mutations); Branch
 * authorization is instead resolved per-row inside `OrdersService`, since
 * these routes carry no `:branchId` route segment at all (List's `branchId`
 * is an optional filter, not a path authority).
 *
 * `PermissionGuard`/`@RequirePermission(PERMISSIONS.ORDERS_VIEW)` is only
 * the BASELINE gate common to every route here (must be able to view
 * Orders at all). The status-transition route additionally requires a
 * SPECIFIC Permission that depends on which transition was requested
 * (`orders.accept`/`orders.reject`/`orders.cancel`/`orders.markServed`/
 * `kitchen.update`) -- a single static `@RequirePermission` cannot express
 * that, so `OrdersService.updateOrderStatus` performs that finer check
 * itself (`order-transitions.ts`) and reports `permissionDenied` as its own
 * outcome, mapped to the identical `403 PERMISSION_DENIED` a static
 * `PermissionGuard` failure would have produced.
 */
@Controller('restaurants/:restaurantId/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  async listOrders(
    @Query() query: ListOrdersQueryDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<OrderListResponseBody> {
    const data = await this.ordersService.listOrders(
      {
        restaurantId: request.restaurantAccess.restaurantId,
        membershipId: request.restaurantAccess.membershipId,
        allBranches: request.restaurantAccess.allBranches,
        role: request.restaurantAccess.role,
        roleId: request.restaurantAccess.roleId,
        permissions: request.restaurantAccess.permissions,
      },
      { branchId: query.branchId, status: query.status },
    );

    return { data };
  }

  @Get(':orderId')
  @UseGuards(AuthGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  async getOrderDetail(
    @Param('orderId') orderId: string,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<OrderDetailResponseBody> {
    const result = await this.ordersService.getOrderDetail(
      {
        restaurantId: request.restaurantAccess.restaurantId,
        membershipId: request.restaurantAccess.membershipId,
        allBranches: request.restaurantAccess.allBranches,
        role: request.restaurantAccess.role,
        roleId: request.restaurantAccess.roleId,
        permissions: request.restaurantAccess.permissions,
      },
      orderId,
    );

    if (result.outcome === 'notFound') {
      throw new NotFoundException(ORDER_NOT_FOUND_RESPONSE);
    }

    return { data: result.data };
  }

  @Patch(':orderId/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard)
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() request: RestaurantAuthorizedRequest,
  ): Promise<OrderDetailResponseBody> {
    const result = await this.ordersService.updateOrderStatus({
      scope: {
        restaurantId: request.restaurantAccess.restaurantId,
        membershipId: request.restaurantAccess.membershipId,
        allBranches: request.restaurantAccess.allBranches,
        role: request.restaurantAccess.role,
        roleId: request.restaurantAccess.roleId,
        permissions: request.restaurantAccess.permissions,
      },
      orderId,
      expectedStatus: dto.expectedStatus,
      status: dto.status,
    });

    if (result.outcome === 'notFound') {
      throw new NotFoundException(ORDER_NOT_FOUND_RESPONSE);
    }
    if (result.outcome === 'invalidTransition') {
      throw new ConflictException(ORDER_INVALID_TRANSITION_RESPONSE);
    }
    if (result.outcome === 'permissionDenied') {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'You do not have permission to perform this action.',
        },
      });
    }
    if (result.outcome === 'cancelBlockedBySettlement') {
      throw new ConflictException({
        error: {
          code: 'ORDER_CANCEL_BLOCKED_BY_SETTLEMENT',
          message:
            'This order cannot be cancelled while its table session has a recorded payment. Void the payment first.',
        },
      });
    }
    if (result.outcome === 'staleStatus') {
      throw new ConflictException(orderStatusChangedResponse(result.currentStatus));
    }

    return { data: result.data };
  }
}
