import type { AuthContextMembership } from '../auth/types';
import { usesTableOrdering } from '../entitlements/access';

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
  // without table ordering in the package there are no table sessions to see or manage
  if (!usesTableOrdering(membership)) return NO_SESSION_CAPABILITIES;
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
