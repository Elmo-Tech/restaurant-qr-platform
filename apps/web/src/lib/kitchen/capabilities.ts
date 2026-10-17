import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating (Kitchen View V1), mirroring
 * `lib/orders/capabilities.ts`: derived from the Membership `permissions`
 * returned by `/auth/me`. The Backend (`PermissionGuard` on
 * `GET .../kitchen/orders`, and the transition rules of
 * `PATCH .../orders/{id}/status`) stays the only authorization authority.
 */
export function canViewKitchen(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('kitchen.view');
}

export function canUpdateKitchen(permissions: readonly string[]): boolean {
  return permissions.includes('kitchen.update');
}
