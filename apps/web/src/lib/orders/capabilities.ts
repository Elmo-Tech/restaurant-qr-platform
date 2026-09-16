import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating (FT-5), mirroring `lib/tables/capabilities.ts`'s
 * exact pattern: derived exclusively from the actual `/auth/me` Membership
 * `permissions` field. Hiding/disabling a control here changes nothing
 * about what the Backend will accept -- `PermissionGuard` and the
 * per-transition check inside `OrdersService.updateOrderStatus` remain the
 * sole authorization authority on every real request.
 *
 * Order management is genuinely Branch-scoped on the Backend (Section 15),
 * exactly like Tables -- `canViewOrders` never additionally requires
 * `allBranches`.
 */
const ORDERS_VIEW = 'orders.view';

export function canViewOrders(membership: AuthContextMembership): boolean {
  return membership.permissions.includes(ORDERS_VIEW);
}
