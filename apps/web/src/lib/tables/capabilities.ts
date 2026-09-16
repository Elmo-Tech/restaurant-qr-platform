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
