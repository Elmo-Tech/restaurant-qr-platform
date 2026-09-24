import type { OrderStatus, OrderType } from './types';

/**
 * FT-5: a client-side MIRROR of the Backend's `order-transitions.ts` --
 * used ONLY to decide which action button(s) to show/enable for a given
 * Order (Section 25: "Do not expose invalid transitions"). This is UX
 * convenience, never authorization: `OrdersService.updateOrderStatus`
 * re-validates the exact same transition/Permission rule server-side on
 * every real request regardless of what the Web chooses to render.
 */
export interface OrderTransitionOption {
  to: OrderStatus;
  /** The exact `PERMISSIONS.*` string this transition requires -- checked against the Membership's own `permissions` array, never inferred from `role`. */
  permission: string;
}

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderTransitionOption[]> = {
  PENDING: [
    { to: 'ACCEPTED', permission: 'orders.accept' },
    { to: 'REJECTED', permission: 'orders.reject' },
  ],
  ACCEPTED: [
    { to: 'PREPARING', permission: 'kitchen.update' },
    { to: 'CANCELLED', permission: 'orders.cancel' },
  ],
  PREPARING: [
    { to: 'READY', permission: 'kitchen.update' },
    { to: 'CANCELLED', permission: 'orders.cancel' },
  ],
  READY: [{ to: 'SERVED', permission: 'orders.markServed' }],
  // FT-8: only reachable for DELIVERY -- see transitionsFor.
  OUT_FOR_DELIVERY: [],
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** FT-8: DELIVERY takes READY -> OUT_FOR_DELIVERY -> SERVED; every other type keeps READY -> SERVED and never sees OUT_FOR_DELIVERY (mirrors the Backend's type-aware rules). */
function transitionsFor(status: OrderStatus, type: OrderType): readonly OrderTransitionOption[] {
  if (type === 'DELIVERY') {
    if (status === 'READY') return [{ to: 'OUT_FOR_DELIVERY', permission: 'orders.markServed' }];
    if (status === 'OUT_FOR_DELIVERY') return [{ to: 'SERVED', permission: 'orders.markServed' }];
  }
  return ORDER_TRANSITIONS[status];
}

export function getAvailableTransitions(
  status: OrderStatus,
  permissions: string[],
  type: OrderType,
): OrderTransitionOption[] {
  return transitionsFor(status, type).filter((option) => permissions.includes(option.permission));
}
