import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating (FT-4), mirroring `lib/menu/capabilities.ts`'s
 * exact pattern: derived exclusively from the actual `/auth/me` Membership
 * `permissions` field, never inferred from `role` names. Hiding/disabling a
 * control here changes nothing about what the Backend will accept --
 * `PermissionGuard`/`BranchManagementAccessGuard` remain the sole
 * authorization authority on every real request.
 *
 * Unlike Menu (`canManageMenu` also requires `allBranches === true`), Table
 * management is a genuinely Branch-scoped capability on the Backend
 * (`BranchManagementAccessGuard`, not `AllBranchesRequiredGuard`) -- a
 * Branch-scoped Membership legitimately manages Tables inside its own
 * assigned Branch, so `canManageTables` never additionally requires
 * `allBranches`.
 */

const TABLES_VIEW = 'tables.view';
const TABLES_MANAGE = 'tables.manage';

export function canViewTables(membership: AuthContextMembership): boolean {
  return membership.permissions.includes(TABLES_VIEW);
}

export function canManageTables(membership: AuthContextMembership): boolean {
  return membership.permissions.includes(TABLES_MANAGE);
}

/**
 * FT-9: the Restaurant-wide Generic QR belongs to the whole Restaurant, not
 * to any Branch, so the Backend requires `tables.manage` AND full Restaurant
 * branch scope (`AllBranchesRequiredGuard`) to create or change it -- unlike
 * per-Branch Table management. UX hint only; the Backend guards are authoritative.
 */
export function canManageGenericQr(membership: AuthContextMembership): boolean {
  return membership.permissions.includes(TABLES_MANAGE) && membership.allBranches === true;
}
