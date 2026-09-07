import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating (Batch H, Section 5). Derived exclusively from
 * the actual `/auth/me` Membership fields (`permissions`, `allBranches`) --
 * never inferred from `role` names, and never a reimplementation of the
 * Backend's Role -> Permission matrix. Hiding/disabling a control here
 * changes nothing about what the Backend will accept: `PermissionGuard`,
 * `AllBranchesRequiredGuard`, and `RestaurantAccessGuard` remain the sole
 * authorization authority on every real request.
 */

const MENU_VIEW = 'menu.view';
const MENU_MANAGE = 'menu.manage';

export function canViewMenu(membership: AuthContextMembership): boolean {
  return membership.permissions.includes(MENU_VIEW);
}

export function hasMenuManagePermission(
  membership: AuthContextMembership,
): boolean {
  return membership.permissions.includes(MENU_MANAGE);
}

/**
 * Restaurant-wide Menu/Category/Product mutations require BOTH `menu.manage`
 * AND `allBranches === true` (Section 5) -- Menu/Category/Product are
 * Restaurant-structural resources gated by the Backend's
 * `AllBranchesRequiredGuard` on every mutation route, exactly like Create
 * Branch. A Branch-scoped Membership (`allBranches === false`) never gains
 * this authority merely because its Role holds `menu.manage`.
 */
export function canManageMenu(membership: AuthContextMembership): boolean {
  return hasMenuManagePermission(membership) && membership.allBranches === true;
}
