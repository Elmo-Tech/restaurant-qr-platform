import type { AuthContextMembership } from '../auth/types';
import { usesKitchen } from '../entitlements/access';

/**
 * UX-only capability gating (Kitchen View V1), mirroring
 * `lib/orders/capabilities.ts`: derived from the Membership `permissions`
 * returned by `/auth/me`. The Backend (`PermissionGuard` on
 * `GET .../kitchen/orders`, and the transition rules of
 * `PATCH .../orders/{id}/status`) stays the only authorization authority.
 */
export function canViewKitchen(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('kitchen.view') && usesKitchen(membership);
}

/**
 * Start preparing / Mark ready go through `PATCH .../orders/{id}/status`,
 * which first requires `orders.view` (its baseline `PermissionGuard`) and
 * then `kitchen.update` for these two transitions. A custom role holding only
 * `kitchen.update` would be refused, so it must not see enabled actions.
 */
export function canUpdateKitchen(permissions: readonly string[]): boolean {
  return permissions.includes('orders.view') && permissions.includes('kitchen.update');
}
