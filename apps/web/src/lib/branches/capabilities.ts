import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating for Branch Management (`branches.view` /
 * `branches.manage`). Creating a Branch is a Restaurant-structural mutation
 * and additionally needs Restaurant-wide Branch scope (`allBranches`);
 * editing / activating / deactivating a Branch needs only `branches.manage`
 * plus access to that Branch (the Backend's `BranchManagementAccessGuard`).
 * The Backend remains the sole authority.
 */

export function canViewBranches(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('branches.view');
}

export function canManageBranches(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('branches.manage');
}

export function canCreateBranch(membership: AuthContextMembership): boolean {
  return canManageBranches(membership) && membership.allBranches === true;
}
