import type { AuthContextMembership } from '../auth/types';

/**
 * UX-only capability gating for Staff & Access, derived exclusively from the
 * `/auth/me` Membership `permissions` -- never inferred from `role` names.
 * The Backend (`PermissionGuard`, plus its own self-management / last-Owner /
 * Branch-grant-authority checks) remains the sole authorization authority.
 */

export function canViewStaff(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('users.view');
}

export function canManageStaff(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('users.manage');
}

/** Create / rename / edit permissions of / delete Roles. UX only; `roles.manage` is enforced by the Backend. */
export function canManageRoles(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('roles.manage');
}
