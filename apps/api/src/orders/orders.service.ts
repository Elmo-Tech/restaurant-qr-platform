import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { BranchAccessService } from '../auth/context/branch-access.service';
import type { RestaurantAccessContext } from '../auth/context/restaurant-access.service';
import { hasPermission } from '../auth/permission/has-permission';
import type { OrderStatus, OrderType, RestaurantMembershipRole } from '../generated/prisma/client';
import { findOrderTransitionRule } from './order-transitions';

/** Safe Staff-facing Order List row (Section 16/17). Never internal FK ids beyond what Staff needs to render/navigate, never Guest-only fields. */
export interface OrderListItem {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  /** FT-7/FT-8: DINE_IN, PICKUP or DELIVERY. */
  type: OrderType;
  branch: { id: string; name: string };
  /** Null for a PICKUP Order. */
  table: { id: string; tableNumber: string } | null;
  /** PICKUP/DELIVERY only (null for DINE_IN): the card's primary identity and client-side search. Notes stay Detail-only. */
  customer: { name: string; phone: string } | null;
  /** FT-8: DELIVERY only -- the zone name snapshot shown on the card. */
  deliveryZoneName: string | null;
  currencyCode: string;
  totalAmount: string;
  itemCount: number;
}

/** FT-6A: one selected Modifier Option snapshot (ORDER_LIFECYCLE_SPEC.md #41) -- always the value at Order submission time, never re-derived from the live (possibly since-changed) Modifier configuration. */
export interface OrderItemModifierView {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface OrderItemView {
  productId: string;
  productNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  modifiers: OrderItemModifierView[];
}

/** Safe Staff-facing Order Detail shape (Section 26). Includes every item snapshot -- List deliberately does not. */
export interface OrderDetail {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  /** FT-7/FT-8: DINE_IN, PICKUP or DELIVERY. */
  type: OrderType;
  restaurant: { id: string; name: string };
  branch: { id: string; name: string };
  /** Null for a PICKUP Order. */
  table: { id: string; tableNumber: string } | null;
  /** FT-7/FT-8: PICKUP/DELIVERY customer snapshots (null for DINE_IN); notes null when not provided. */
  customer: { name: string; phone: string; notes: string | null } | null;
  /** FT-8: DELIVERY-only snapshot details (null otherwise) -- always the values at submission time, never the live zone. */
  delivery: {
    zoneName: string;
    address: string;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  } | null;
  /** FT-8: exact money breakdown: subtotal + deliveryFee = totalAmount. */
  subtotalAmount: string;
  deliveryFee: string;
  currencyCode: string;
  totalAmount: string;
  items: OrderItemView[];
}

/** Exactly the fields already produced by `RestaurantAccessGuard` on `request.restaurantAccess` -- never the full Express request. `role` is only actually USED for the specific-transition Permission check in `updateOrderStatus`, but is carried on every scope so the shared `isBranchInScope` helper can build a real `RestaurantAccessContext` without fabricating one. */
export interface AuthorizedOrderScope {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
  role: RestaurantMembershipRole;
}

export interface ListOrdersFilters {
  branchId?: string;
  status?: OrderStatus;
}

export type GetOrderDetailResult =
  | { outcome: 'found'; data: OrderDetail }
  | { outcome: 'notFound' };

export interface UpdateOrderStatusInput {
  scope: AuthorizedOrderScope;
  orderId: string;
  expectedStatus: OrderStatus;
  status: OrderStatus;
}

export type UpdateOrderStatusResult =
  | { outcome: 'updated'; data: OrderDetail }
  | { outcome: 'notFound' }
  | { outcome: 'invalidTransition' }
  | { outcome: 'permissionDenied' }
  | { outcome: 'staleStatus'; currentStatus: OrderStatus };

function formatMoney(value: { toFixed(digits: number): string }): string {
  return value.toFixed(2);
}

const ORDER_ITEM_VIEW_SELECT = {
  productId: true,
  productNameSnapshot: true,
  unitPrice: true,
  quantity: true,
  lineTotal: true,
  modifiers: {
    select: {
      modifierGroupNameSnapshot: true,
      modifierOptionNameSnapshot: true,
      priceAdjustmentSnapshot: true,
    },
    orderBy: { displayOrder: 'asc' },
  },
} as const;

function toOrderItemView(item: {
  productId: string;
  productNameSnapshot: string;
  unitPrice: { toFixed(digits: number): string };
  quantity: number;
  lineTotal: { toFixed(digits: number): string };
  modifiers: {
    modifierGroupNameSnapshot: string;
    modifierOptionNameSnapshot: string;
    priceAdjustmentSnapshot: { toFixed(digits: number): string };
  }[];
}): OrderItemView {
  return {
    productId: item.productId,
    productNameSnapshot: item.productNameSnapshot,
    unitPrice: formatMoney(item.unitPrice),
    quantity: item.quantity,
    lineTotal: formatMoney(item.lineTotal),
    modifiers: item.modifiers.map((modifier) => ({
      groupName: modifier.modifierGroupNameSnapshot,
      optionName: modifier.modifierOptionNameSnapshot,
      priceAdjustment: formatMoney(modifier.priceAdjustmentSnapshot),
    })),
  };
}

/**
 * FT-5: the Staff-facing Order read/status-transition service. Order is
 * operational Branch/Table data (Section 15), not a Restaurant-structural
 * resource -- Branch authorization is resolved per-row via the existing
 * `BranchAccessService`/`RestaurantMembershipBranch` scope, exactly like
 * `BranchesService.listBranches`, never `AllBranchesRequiredGuard`. A
 * cross-Restaurant OR cross-Branch-scope Order lookup both converge on the
 * identical `notFound` outcome -- this never distinguishes "does not exist"
 * from "exists in a Branch you cannot access" (mirrors the established
 * `TABLE_NOT_FOUND`/`CATEGORY_NOT_FOUND` existence-hiding convention).
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchAccessService: BranchAccessService,
  ) {}

  /**
   * Section 17: Branch scope is resolved once here (all Restaurant Branches
   * if `allBranches`, else the Membership's explicit assignments) and
   * applied as a `branchId IN (...)` filter -- never a per-row post-filter,
   * and never a separate query per Branch/Order. An explicit `branchId`
   * filter can only narrow within that already-authorized set; a
   * foreign/unauthorized value simply yields zero rows, never a distinct
   * error (mirrors `BranchesService`'s own stated rationale).
   */
  async listOrders(
    scope: AuthorizedOrderScope,
    filters: ListOrdersFilters,
  ): Promise<OrderListItem[]> {
    let branchIdFilter: string[] | undefined;

    if (scope.allBranches) {
      branchIdFilter = filters.branchId ? [filters.branchId] : undefined;
    } else {
      const assignments = await this.prisma.restaurantMembershipBranch.findMany({
        where: {
          restaurantMembershipId: scope.membershipId,
          branch: { restaurantId: scope.restaurantId },
        },
        select: { branchId: true },
      });
      const assignedIds = assignments.map((row) => row.branchId);
      branchIdFilter =
        filters.branchId && assignedIds.includes(filters.branchId)
          ? [filters.branchId]
          : assignedIds;
    }

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId: scope.restaurantId,
        ...(branchIdFilter ? { branchId: { in: branchIdFilter } } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        type: true,
        customerNameSnapshot: true,
        customerPhoneSnapshot: true,
        deliveryZoneNameSnapshot: true,
        currencyCode: true,
        totalAmount: true,
        branch: { select: { id: true, name: true } },
        table: { select: { id: true, tableNumber: true } },
        _count: { select: { items: true } },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      status: order.status,
      type: order.type,
      branch: order.branch,
      table: order.table,
      customer:
        order.type !== 'DINE_IN' &&
        order.customerNameSnapshot !== null &&
        order.customerPhoneSnapshot !== null
          ? { name: order.customerNameSnapshot, phone: order.customerPhoneSnapshot }
          : null,
      deliveryZoneName: order.type === 'DELIVERY' ? order.deliveryZoneNameSnapshot : null,
      currencyCode: order.currencyCode,
      totalAmount: formatMoney(order.totalAmount),
      itemCount: order._count.items,
    }));
  }

  async getOrderDetail(
    scope: AuthorizedOrderScope,
    orderId: string,
  ): Promise<GetOrderDetailResult> {
    if (!isWellFormedUuid(orderId)) {
      return { outcome: 'notFound' };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId: scope.restaurantId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        type: true,
        customerNameSnapshot: true,
        customerPhoneSnapshot: true,
        customerNotesSnapshot: true,
        subtotalAmount: true,
        deliveryFeeAmount: true,
        deliveryZoneNameSnapshot: true,
        deliveryAddressSnapshot: true,
        deliveryBuildingSnapshot: true,
        deliveryFloorSnapshot: true,
        deliveryApartmentSnapshot: true,
        deliveryLandmarkSnapshot: true,
        branchId: true,
        currencyCode: true,
        totalAmount: true,
        restaurant: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        table: { select: { id: true, tableNumber: true } },
        items: { select: ORDER_ITEM_VIEW_SELECT, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) {
      return { outcome: 'notFound' };
    }

    const branchAuthorized = await this.isBranchInScope(scope, order.branchId);
    if (!branchAuthorized) {
      return { outcome: 'notFound' };
    }

    return {
      outcome: 'found',
      data: {
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        type: order.type,
        restaurant: order.restaurant,
        branch: order.branch,
        table: order.table,
        customer:
          order.type !== 'DINE_IN' &&
          order.customerNameSnapshot !== null &&
          order.customerPhoneSnapshot !== null
            ? {
                name: order.customerNameSnapshot,
                phone: order.customerPhoneSnapshot,
                notes: order.customerNotesSnapshot,
              }
            : null,
        currencyCode: order.currencyCode,
        delivery:
          order.type === 'DELIVERY' &&
          order.deliveryZoneNameSnapshot !== null &&
          order.deliveryAddressSnapshot !== null
            ? {
                zoneName: order.deliveryZoneNameSnapshot,
                address: order.deliveryAddressSnapshot,
                building: order.deliveryBuildingSnapshot,
                floor: order.deliveryFloorSnapshot,
                apartment: order.deliveryApartmentSnapshot,
                landmark: order.deliveryLandmarkSnapshot,
              }
            : null,
        subtotalAmount: formatMoney(order.subtotalAmount),
        deliveryFee: formatMoney(order.deliveryFeeAmount),
        totalAmount: formatMoney(order.totalAmount),
        items: order.items.map(toOrderItemView),
      },
    };
  }

  /**
   * Section 13/14: validates the transition against the exact documented
   * lifecycle, checks the SPECIFIC Permission that transition requires
   * (never a single static Permission for the whole route -- see
   * `order-transitions.ts`), then performs a conditional
   * (`WHERE status = expectedStatus`) update so a concurrent Staff change
   * can never be silently overwritten (Section 14). `expectedStatus` is
   * checked twice: once against the already-loaded row (a fast, clear
   * rejection for the common case) and again, atomically, as part of the
   * `updateMany` `where` clause itself (the actual race-safety guarantee --
   * the first check alone would still be a TOCTOU race).
   */
  async updateOrderStatus(
    input: UpdateOrderStatusInput,
  ): Promise<UpdateOrderStatusResult> {
    if (!isWellFormedUuid(input.orderId)) {
      return { outcome: 'notFound' };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, restaurantId: input.scope.restaurantId },
      select: { id: true, branchId: true, status: true, type: true },
    });
    if (!order) {
      return { outcome: 'notFound' };
    }

    const branchAuthorized = await this.isBranchInScope(input.scope, order.branchId);
    if (!branchAuthorized) {
      return { outcome: 'notFound' };
    }

    const rule = findOrderTransitionRule(order.status, input.status, order.type);
    if (!rule) {
      return { outcome: 'invalidTransition' };
    }

    if (!hasPermission(input.scope.role, rule.permission)) {
      return { outcome: 'permissionDenied' };
    }

    if (order.status !== input.expectedStatus) {
      return { outcome: 'staleStatus', currentStatus: order.status };
    }

    const written = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        restaurantId: input.scope.restaurantId,
        status: input.expectedStatus,
      },
      data: { status: input.status },
    });

    if (written.count === 0) {
      // Section 14: another request changed the status between our read
      // above and this write -- re-fetch to report the CURRENT status
      // rather than fabricating success or a generic error.
      const current = await this.prisma.order.findFirst({
        where: { id: order.id, restaurantId: input.scope.restaurantId },
        select: { status: true },
      });
      return {
        outcome: 'staleStatus',
        currentStatus: current?.status ?? order.status,
      };
    }

    const detail = await this.getOrderDetail(input.scope, order.id);
    // Defensive only: the row we just updated cannot have vanished or
    // become out-of-scope between the write above and this read.
    return detail.outcome === 'found'
      ? { outcome: 'updated', data: detail.data }
      : { outcome: 'notFound' };
  }

  /**
   * Section 15/17: mirrors `BranchAccessService.resolveBranchManagementAccess`
   * semantics (identity + Membership scope only, no `Branch.status` check --
   * managing an already-created Order must remain possible even if its
   * Branch later became INACTIVE), applied to an Order's already-known
   * `branchId` rather than a route `:branchId` param.
   */
  private async isBranchInScope(
    scope: AuthorizedOrderScope,
    branchId: string,
  ): Promise<boolean> {
    const restaurantAccess: RestaurantAccessContext = {
      membershipId: scope.membershipId,
      restaurantId: scope.restaurantId,
      role: scope.role,
      allBranches: scope.allBranches,
    };
    const result = await this.branchAccessService.resolveBranchManagementAccess(
      restaurantAccess,
      branchId,
    );
    return result.outcome === 'authorized';
  }
}
