import type { AuthContextMembership } from '../auth/types';
import { receivesDashboardOrders } from '../entitlements/access';

/**
 * UX-only capability gating (FT-11), mirroring `lib/orders/capabilities.ts`'s
 * exact pattern: derived exclusively from the actual `/auth/me` Membership
 * `permissions` field. Hiding the analytics Dashboard here changes nothing
 * about what the Backend will accept -- `PermissionGuard` on
 * `GET /restaurants/:restaurantId/dashboard` remains the sole authorization
 * authority. `analytics.view` is already granted to OWNER/MANAGER only
 * (`role-permissions.ts`) -- CASHIER/KITCHEN/WAITER keep the existing
 * navigation-tile landing screen instead.
 */
const ANALYTICS_VIEW = 'analytics.view';

export function canViewAnalytics(membership: AuthContextMembership): boolean {
  // the figures are about orders: nothing to show for a package that receives none
  return membership.permissions.includes(ANALYTICS_VIEW) && receivesDashboardOrders(membership);
}
