import type { BranchStatus, RestaurantMembershipRole } from '../auth/types';

/**
 * Types mirroring the Backend's Staff & Access responses
 * (`/restaurants/:id/memberships`, `/restaurants/:id/roles`) exactly --
 * typing only. Never carries password hashes or session data. The one
 * password the admin types for a new user is sent once and never returned.
 */

export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export interface StaffBranchRef {
  id: string;
  name: string;
  status: BranchStatus;
}

export interface StaffMember {
  id: string;
  user: { id: string; email: string };
  /** The Role's immutable kind label (`CUSTOM` for a Restaurant-defined Role). */
  role: RestaurantMembershipRole;
  roleId: string;
  roleName: string;
  status: MembershipStatus;
  allBranches: boolean;
  branches: StaffBranchRef[];
}

export interface BranchScopeInput {
  allBranches: boolean;
  branchIds: string[];
}

export interface UpdateMembershipInput extends BranchScopeInput {
  roleId: string;
}

export interface CreateStaffUserInput extends BranchScopeInput {
  email: string;
  roleId: string;
  active: boolean;
  /** The password for a NEW account. Ignored by the Backend when the email already has an account. */
  password: string;
}

export interface CreateStaffUserResult {
  membership: StaffMember;
  /** `false` when the email already had an account: only Restaurant access was added and that account's password was not touched. */
  accountCreated: boolean;
}

/** One Restaurant Role and the Permissions it effectively grants (`GET /restaurants/:id/roles`). */
export interface StaffRole {
  id: string;
  name: string;
  /** Immutable kind label: OWNER (protected), a starter kind, or CUSTOM. */
  kind: RestaurantMembershipRole;
  isProtected: boolean;
  permissions: string[];
  /** Memberships of this Restaurant (any status) that hold the Role. */
  memberCount: number;
}

export interface CreateRoleInput {
  name: string;
  permissions: string[];
}

export interface UpdateRoleInput {
  name?: string;
  permissions?: string[];
}
