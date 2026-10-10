import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating for Table Sessions, derived exclusively from the
 * `/auth/me` Membership `permissions` (never from role names). Hiding a control
 * changes nothing about what the Backend accepts: `PermissionGuard` and the
 * per-session Branch scope remain the sole authority on every request.
 */
export interface SessionCapabilities {
  canView: boolean;
  canOpen: boolean;
  canClose: boolean;
  /** Closing with "reject pending orders" additionally needs `orders.reject`. */
  canRejectOrders: boolean;
}

export function sessionCapabilities(
  membership: AuthContextMembership,
): SessionCapabilities {
  const has = (key: string) => membership.permissions.includes(key);
  return {
    canView: has('sessions.view'),
    canOpen: has('sessions.open'),
    canClose: has('sessions.close'),
    canRejectOrders: has('orders.reject'),
  };
}

export const NO_SESSION_CAPABILITIES: SessionCapabilities = {
  canView: false,
  canOpen: false,
  canClose: false,
  canRejectOrders: false,
};
