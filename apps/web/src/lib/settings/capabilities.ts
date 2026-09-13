import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating (LOC-3, Section 6), mirroring
 * `lib/menu/capabilities.ts`'s exact pattern: derived exclusively from the
 * actual `/auth/me` Membership fields (`permissions`, `allBranches`), never
 * inferred from `role` names. Hiding/disabling a control here changes
 * nothing about what the Backend will accept -- `PermissionGuard` and
 * `AllBranchesRequiredGuard` remain the sole authorization authority on
 * every real request.
 */

const RESTAURANT_VIEW = 'restaurant.view';
const RESTAURANT_MANAGE = 'restaurant.manage';

export function canViewRestaurantSettings(
  membership: AuthContextMembership,
): boolean {
  return membership.permissions.includes(RESTAURANT_VIEW);
}

export function hasRestaurantManagePermission(
  membership: AuthContextMembership,
): boolean {
  return membership.permissions.includes(RESTAURANT_MANAGE);
}

/**
 * Restaurant Language mutation requires BOTH `restaurant.manage` AND
 * `allBranches === true` -- the Backend's `PUT .../locales/:locale` route is
 * gated by `AllBranchesRequiredGuard` exactly like every other
 * Restaurant-structural mutation (Menu Create, Category Create, ...). A
 * Branch-scoped Membership (`allBranches === false`) never gains this
 * authority merely because its Role holds `restaurant.manage`.
 */
export function canManageLanguages(membership: AuthContextMembership): boolean {
  return (
    hasRestaurantManagePermission(membership) && membership.allBranches === true
  );
}
