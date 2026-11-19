import type { MessageKey } from '../i18n/messages';
import type { OrderStatus, OrderType } from './types';

/**
 * The action label for a target status -- shared by the Orders page and the
 * Table Session panel so both read exactly the same. (Pickup / Delivery word
 * SERVED differently; that stays in the Orders detail view.)
 */
export const TRANSITION_LABEL_KEYS = {
  PENDING: 'orders.action.reopen',
  ACCEPTED: 'orders.action.accept',
  PREPARING: 'orders.action.startPreparing',
  READY: 'orders.action.markReady',
  OUT_FOR_DELIVERY: 'orders.action.outForDelivery',
  SERVED: 'orders.action.markServed',
  REJECTED: 'orders.action.reject',
  CANCELLED: 'orders.action.cancel',
} as const satisfies Record<OrderStatus, MessageKey>;

/** Reject / Cancel end the order: shown apart from the forward action. */
export function isDestructiveTransition(to: OrderStatus): boolean {
  return to === 'REJECTED' || to === 'CANCELLED';
}

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

/** The action wording for a target status, type-aware like the Order detail: Pickup "Mark picked up", Delivery "Mark delivered". */
export function transitionLabelKey(to: OrderStatus, type: OrderType): MessageKey {
  if (to === 'SERVED' && type === 'PICKUP') return 'orders.action.markPickedUp';
  if (to === 'SERVED' && type === 'DELIVERY') return 'orders.action.markDelivered';
  return TRANSITION_LABEL_KEYS[to];
}

/** Neutral "where is this Order" copy for active statuses when the viewer has no next step of their own. */
const WAITING_LABEL_KEYS = {
  PENDING: 'orders.card.waiting.PENDING',
  ACCEPTED: 'orders.card.waiting.ACCEPTED',
  PREPARING: 'orders.card.waiting.PREPARING',
  READY: 'orders.card.waiting.READY',
  OUT_FOR_DELIVERY: 'orders.card.waiting.OUT_FOR_DELIVERY',
} as const satisfies Partial<Record<OrderStatus, MessageKey>>;

/**
 * Phase 1: the Order card's informational next-step hint -- text only, never
 * a button. `action` names the first non-destructive transition this
 * Membership's own permissions allow (Reject/Cancel are never suggested);
 * otherwise `status` gives neutral copy for where the Order is. `null` for
 * completed Orders. Same UX-only mirror as `getAvailableTransitions`: the
 * Backend still authorizes every real transition.
 */
export type OrderNextStep =
  | { kind: 'action'; to: OrderStatus; labelKey: MessageKey }
  | { kind: 'status'; labelKey: MessageKey };

export function nextStepFor(
  status: OrderStatus,
  type: OrderType,
  permissions: string[],
): OrderNextStep | null {
  const forward = getAvailableTransitions(status, permissions, type).find(
    (option) => !isDestructiveTransition(option.to),
  );
  if (forward) return { kind: 'action', to: forward.to, labelKey: transitionLabelKey(forward.to, type) };
  if (status in WAITING_LABEL_KEYS) {
    return { kind: 'status', labelKey: WAITING_LABEL_KEYS[status as keyof typeof WAITING_LABEL_KEYS] };
  }
  return null;
}
