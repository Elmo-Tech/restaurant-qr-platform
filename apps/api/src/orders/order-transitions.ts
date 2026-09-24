import type { OrderStatus, OrderType } from '../generated/prisma/client';
import { PERMISSIONS, type Permission } from '../auth/permission/permission';

/** The exact `OrderStatus` enum values, for DTO `@IsIn` validation (mirrors `PRODUCT_AVAILABILITIES`'s established pattern). */
export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
] as const;

/**
 * FT-5, ORDER_LIFECYCLE_SPEC.md #25-28: the exact documented V1 Order
 * lifecycle -- every valid transition and the ONE existing Permission
 * constant that authorizes it. Never invented: `orders.accept`/
 * `orders.reject`/`orders.cancel`/`orders.markServed`/`kitchen.update` all
 * already existed in `PERMISSIONS`/`ROLE_PERMISSIONS` before this batch,
 * clearly pre-designed for exactly these five actions. `PENDING->ACCEPTED`/
 * `PENDING->REJECTED` are front-of-house decisions (`orders.*`);
 * `ACCEPTED->PREPARING`/`PREPARING->READY` are kitchen work
 * (`kitchen.update`); `READY->SERVED` is front-of-house delivery
 * (`orders.markServed`). `SERVED`/`REJECTED`/`CANCELLED` are terminal --
 * no outgoing transition exists for any of them, matching
 * ORDER_LIFECYCLE_SPEC.md #22/#23/#28 exactly (no backward transitions,
 * ever).
 */
interface OrderTransitionRule {
  to: OrderStatus;
  permission: Permission;
}

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderTransitionRule[]> = {
  PENDING: [
    { to: 'ACCEPTED', permission: PERMISSIONS.ORDERS_ACCEPT },
    { to: 'REJECTED', permission: PERMISSIONS.ORDERS_REJECT },
  ],
  ACCEPTED: [
    { to: 'PREPARING', permission: PERMISSIONS.KITCHEN_UPDATE },
    { to: 'CANCELLED', permission: PERMISSIONS.ORDERS_CANCEL },
  ],
  PREPARING: [
    { to: 'READY', permission: PERMISSIONS.KITCHEN_UPDATE },
    { to: 'CANCELLED', permission: PERMISSIONS.ORDERS_CANCEL },
  ],
  READY: [{ to: 'SERVED', permission: PERMISSIONS.ORDERS_MARK_SERVED }],
  // FT-8: only reachable for DELIVERY Orders -- see `transitionsFor`.
  OUT_FOR_DELIVERY: [],
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * FT-8: DELIVERY Orders take the extra hop READY -> OUT_FOR_DELIVERY ->
 * SERVED (both front-of-house handover actions, so both use
 * orders.markServed -- no new Permission). DINE_IN and PICKUP keep the
 * exact FT-5 rules and can never reach OUT_FOR_DELIVERY: for them READY still
 * goes straight to SERVED and OUT_FOR_DELIVERY has no outgoing transition
 * (and nothing leads into it), so it fails closed for every non-DELIVERY
 * type. Reject/Cancel rules are unchanged for every type.
 */
function transitionsFor(from: OrderStatus, type: OrderType): readonly OrderTransitionRule[] {
  if (type === 'DELIVERY') {
    if (from === 'READY') {
      return [{ to: 'OUT_FOR_DELIVERY', permission: PERMISSIONS.ORDERS_MARK_SERVED }];
    }
    if (from === 'OUT_FOR_DELIVERY') {
      return [{ to: 'SERVED', permission: PERMISSIONS.ORDERS_MARK_SERVED }];
    }
  }
  return ORDER_TRANSITIONS[from];
}

/**
 * Looks up the one rule (if any) allowing from -> to for an Order of the
 * given type. Returns null for every unlisted pair, including any
 * backward transition and any transition out of a terminal status -- there is
 * deliberately no wildcard/fallback case, so a status value this map has not
 * been updated for fails closed rather than silently permitting it.
 */
export function findOrderTransitionRule(
  from: OrderStatus,
  to: OrderStatus,
  type: OrderType,
): OrderTransitionRule | null {
  return transitionsFor(from, type).find((rule) => rule.to === to) ?? null;
}
