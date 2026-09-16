import type { OrderStatus } from '../generated/prisma/client';
import { PERMISSIONS, type Permission } from '../auth/permission/permission';

/** The exact `OrderStatus` enum values, for DTO `@IsIn` validation (mirrors `PRODUCT_AVAILABILITIES`'s established pattern). */
export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
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
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * Looks up the one rule (if any) allowing `from -> to`. Returns `null` for
 * every unlisted pair, including any backward transition and any transition
 * out of a terminal status -- there is deliberately no wildcard/fallback
 * case, so a status value this map has not been updated for fails closed
 * rather than silently permitting it.
 */
export function findOrderTransitionRule(
  from: OrderStatus,
  to: OrderStatus,
): OrderTransitionRule | null {
  return ORDER_TRANSITIONS[from].find((rule) => rule.to === to) ?? null;
}
