import type { OrderStatus } from './types';

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
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function getAvailableTransitions(
  status: OrderStatus,
  permissions: string[],
): OrderTransitionOption[] {
  return ORDER_TRANSITIONS[status].filter((option) => permissions.includes(option.permission));
}
