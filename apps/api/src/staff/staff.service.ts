import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type {
  BranchStatus,
  RestaurantMembershipRole,
  RestaurantMembershipStatus,
} from '../generated/prisma/client';
import type { Permission } from '../auth/permission/permission';
import { resolveAssignableRole } from './staff-role-assignment';
import { validateBranchGrant } from './staff-branch-scope';

/** Safe User identity fields (mirrors AuthContextUser). Never passwordHash, emailNormalized, or preferredLocale. */
export interface StaffMembershipUser {
  id: string;
  email: string;
}

/** `status` is current operational state, not authorization (AUTH_TENANCY_SPEC.md #148A). */
export interface StaffMembershipBranch {
  id: string;
  name: string;
  status: BranchStatus;
}

/** One persisted RestaurantMembership row -- ACTIVE, INVITED, and DISABLED all included (Business Foundation R deliberately differs from /auth/me's ACTIVE-only filter). */
export interface StaffMembershipListItem {
  id: string;
  user: StaffMembershipUser;
  /** The Role's immutable kind label (`CUSTOM` for a Restaurant-defined Role). */
  role: RestaurantMembershipRole;
  roleId: string;
  /** The Restaurant Role's display name. */
  roleName: string;
  status: RestaurantMembershipStatus;
  allBranches: boolean;
  branches: StaffMembershipBranch[];
}

/**
 * The minimum safe authorized scope this query needs -- exactly the fields
 * already produced by `RestaurantAccessGuard` on `request.restaurantAccess`.
 * Never the full Express request, never a re-derived Role/Membership query.
 */
export interface AuthorizedStaffListScope {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
}

/** The authorized GRANTER's scope -- never the target Membership's own scope. */
export interface AuthorizedStaffGranterScope {
  restaurantId: string;
  granterMembershipId: string;
  granterAllBranches: boolean;
}

export interface UpdateStaffMembershipInput extends AuthorizedStaffGranterScope {
  /** The granter's effective Permissions (from `request.restaurantAccess`) -- a Role may only be given if it grants nothing beyond these. */
  granterPermissions: readonly string[];
  targetMembershipId: string;
  roleId: string;
  allBranches: boolean;
  branchIds: string[];
}

export type UpdateStaffMembershipResult =
  | { outcome: 'updated'; data: StaffMembershipListItem }
  | { outcome: 'notFound' }
  | { outcome: 'selfManagementForbidden' }
  | { outcome: 'lastOwnerProtected' }
  | { outcome: 'branchNotFound' }
  | { outcome: 'scopeExceedsAuthority' }
  | { outcome: 'roleNotFound' }
  | { outcome: 'roleNotAssignable' }
  | { outcome: 'roleExceedsAuthority' };

export interface SetStaffMembershipStatusInput extends AuthorizedStaffGranterScope {
  targetMembershipId: string;
  status: RestaurantMembershipStatus;
}

export type SetStaffMembershipStatusResult =
  | { outcome: 'updated'; data: StaffMembershipListItem }
  | { outcome: 'notFound' }
  | { outcome: 'selfManagementForbidden' }
  | { outcome: 'lastOwnerProtected' };

/**
 * Business Foundation R, settled contract: Restaurant Staff Membership List.
 * Read visibility only -- this service never mutates a Membership and never
 * enforces future Staff-management (mutation) authority rules (last-OWNER
 * protection, OWNER-assignment restriction, self-escalation protection);
 * those remain separate concerns for a later slice.
 */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async listStaffMemberships(
    scope: AuthorizedStaffListScope,
  ): Promise<StaffMembershipListItem[]> {
    // Restaurant-scoped at the database query itself (never fetched globally
    // then Tenant-filtered in application code), matching this repository's
    // established Tenant-scoped query convention. Every persisted status
    // (ACTIVE/INVITED/DISABLED) is included -- no status filter.
    const memberships = await this.prisma.restaurantMembership.findMany({
      where: { restaurantId: scope.restaurantId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        allBranches: true,
        restaurantRole: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    const allBranchesMembershipIds = memberships
      .filter((membership) => membership.allBranches)
      .map((membership) => membership.id);
    const scopedMembershipIds = memberships
      .filter((membership) => !membership.allBranches)
      .map((membership) => membership.id);

    // Two batched queries (not one per Membership) to avoid N+1. The second
    // query enforces the AUTH_TENANCY_SPEC.md #61A same-Restaurant invariant
    // directly in its `where` clause (`branch.restaurantId ==
    // scope.restaurantId`), not merely by trusting `restaurantMembershipId`
    // alone -- a malformed cross-Restaurant assignment row can never surface
    // a foreign Branch or widen visibility.
    const [restaurantBranches, membershipBranchRows] = await Promise.all([
      allBranchesMembershipIds.length > 0
        ? this.prisma.branch.findMany({
            where: { restaurantId: scope.restaurantId },
            orderBy: { id: 'asc' },
            select: { id: true, name: true, status: true },
          })
        : Promise.resolve([]),
      scopedMembershipIds.length > 0
        ? this.prisma.restaurantMembershipBranch.findMany({
            where: {
              restaurantMembershipId: { in: scopedMembershipIds },
              branch: { restaurantId: scope.restaurantId },
            },
            orderBy: { branch: { id: 'asc' } },
            select: {
              restaurantMembershipId: true,
              branch: { select: { id: true, name: true, status: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const branchesByMembershipId = new Map<string, StaffMembershipBranch[]>();
    for (const row of membershipBranchRows) {
      const list = branchesByMembershipId.get(row.restaurantMembershipId) ?? [];
      list.push({
        id: row.branch.id,
        name: row.branch.name,
        status: row.branch.status,
      });
      branchesByMembershipId.set(row.restaurantMembershipId, list);
    }

    // allBranches=true -> every same-Restaurant Branch regardless of status
    // (mirrors AuthContextService/#63A). allBranches=false -> exactly the
    // valid same-Restaurant assigned Branches, possibly empty.
    const items: StaffMembershipListItem[] = memberships.map((membership) => ({
      id: membership.id,
      user: { id: membership.user.id, email: membership.user.email },
      role: membership.role,
      roleId: membership.restaurantRole.id,
      roleName: membership.restaurantRole.name,
      status: membership.status,
      allBranches: membership.allBranches,
      branches: membership.allBranches
        ? restaurantBranches
        : (branchesByMembershipId.get(membership.id) ?? []),
    }));

    if (scope.allBranches) {
      return items;
    }

    // Branch-scoped caller: settled subset visibility rule. The caller's own
    // Membership is always visible regardless of its own Branch set. Every
    // other Membership is visible only when it is itself allBranches=false,
    // has at least one valid same-Restaurant Branch assignment, and that
    // complete assignment set is a subset of the caller's own valid Branch
    // set. Array#filter preserves the already-established `id asc` order.
    const callerBranchIds = new Set(
      (branchesByMembershipId.get(scope.membershipId) ?? []).map(
        (branch) => branch.id,
      ),
    );

    return items.filter((item) => {
      if (item.id === scope.membershipId) {
        return true;
      }
      if (item.allBranches) {
        return false;
      }
      if (item.branches.length === 0) {
        return false;
      }
      return item.branches.every((branch) => callerBranchIds.has(branch.id));
    });
  }

  /**
   * FT-12: Staff Membership role + Branch-scope edit. All Domain safety
   * checks run inside one transaction, re-reading current state live (never
   * trusted from a prior read):
   *
   * 1. `notFound` -- unknown/foreign-Restaurant target, identical to every
   *    other existence-hiding convention in this codebase.
   * 2. `selfManagementForbidden` -- STAFF_DASHBOARD_UX_SPEC.md #167: "User
   *    cannot edit own role / Branch access through ordinary Team page."
   *    Applies to every caller regardless of Role, not only a lockout risk.
   * 3. `lastOwnerProtected` -- AUTH_TENANCY_SPEC.md #56: a target that is
   *    CURRENTLY an ACTIVE OWNER can only be edited here (this endpoint's
   *    `role` can never itself be `OWNER`, so reaching this method always
   *    means "move them off OWNER") when at least one OTHER ACTIVE OWNER
   *    Membership exists in the Restaurant.
   * 4. Branch-grant identity + authority (`branchNotFound`/
   *    `scopeExceedsAuthority`) via the same `validateBranchGrant` Staff
   *    Invitation creation uses -- a Branch-scoped granter can never expand
   *    a target's scope beyond their own.
   *
   * `role`/`allBranches` are always written explicitly from `input`, never
   * derived from the target's prior values -- and the Prisma `data` object
   * never includes `status` (lifecycle stays `setMembershipStatus`'s own
   * concern, mirroring Branch's Update/Activate separation).
   */
  async updateMembership(input: UpdateStaffMembershipInput): Promise<UpdateStaffMembershipResult> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.restaurantMembership.findFirst({
        where: { id: input.targetMembershipId, restaurantId: input.restaurantId },
        select: {
          id: true,
          role: true,
          status: true,
          user: { select: { id: true, email: true } },
        },
      });
      if (!target) {
        return { outcome: 'notFound' };
      }

      if (target.id === input.granterMembershipId) {
        return { outcome: 'selfManagementForbidden' };
      }

      if (target.role === 'OWNER' && target.status === 'ACTIVE') {
        const otherActiveOwners = await tx.restaurantMembership.count({
          where: {
            restaurantId: input.restaurantId,
            role: 'OWNER',
            status: 'ACTIVE',
            id: { not: target.id },
          },
        });
        if (otherActiveOwners === 0) {
          return { outcome: 'lastOwnerProtected' };
        }
      }

      // FT-12C: the Role must be one of THIS Restaurant's, not the protected
      // Owner Role, and grant nothing the granter does not hold.
      const assignment = await resolveAssignableRole(tx, {
        restaurantId: input.restaurantId,
        roleId: input.roleId,
        granterPermissions: input.granterPermissions,
      });
      if (assignment.outcome !== 'valid') {
        return { outcome: assignment.outcome };
      }

      const grant = await validateBranchGrant(tx, {
        restaurantId: input.restaurantId,
        granterMembershipId: input.granterMembershipId,
        granterAllBranches: input.granterAllBranches,
        allBranches: input.allBranches,
        branchIds: input.branchIds,
      });
      if (grant.outcome === 'branchNotFound') {
        return { outcome: 'branchNotFound' };
      }
      if (grant.outcome === 'scopeExceedsAuthority') {
        return { outcome: 'scopeExceedsAuthority' };
      }

      await tx.restaurantMembership.update({
        where: { id: target.id },
        data: {
          role: assignment.role.kind,
          roleId: assignment.role.id,
          allBranches: input.allBranches,
        },
      });

      // Full replace: the target's previous Branch assignments (if any) are
      // no longer valid once the scope has been explicitly re-specified --
      // mirrors how Invitation creation always writes a fresh, complete set,
      // never a diff.
      await tx.restaurantMembershipBranch.deleteMany({
        where: { restaurantMembershipId: target.id },
      });
      if (!input.allBranches) {
        await tx.restaurantMembershipBranch.createMany({
          data: grant.branches.map((branch) => ({
            restaurantMembershipId: target.id,
            branchId: branch.id,
          })),
        });
      }

      return {
        outcome: 'updated',
        data: {
          id: target.id,
          user: target.user,
          role: assignment.role.kind,
          roleId: assignment.role.id,
          roleName: assignment.role.name,
          status: target.status,
          allBranches: input.allBranches,
          branches: grant.branches,
        },
      };
    });
  }

  /**
   * FT-12: enable/disable a Membership -- the preferred "removing Staff"
   * action (AUTH_TENANCY_SPEC.md #82: disable, never delete the User).
   * `selfManagementForbidden` and `lastOwnerProtected` mirror
   * `updateMembership`'s exact rationale above; `lastOwnerProtected` only
   * ever applies when disabling (enabling can never reduce the active-OWNER
   * count). Branch assignments are left completely untouched -- disabling
   * only ever changes `status`, so re-enabling restores the Membership to
   * exactly its previous Branch scope with no extra step.
   */
  async setMembershipStatus(
    input: SetStaffMembershipStatusInput,
  ): Promise<SetStaffMembershipStatusResult> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.restaurantMembership.findFirst({
        where: { id: input.targetMembershipId, restaurantId: input.restaurantId },
        select: {
          id: true,
          role: true,
          status: true,
          allBranches: true,
          restaurantRole: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      });
      if (!target) {
        return { outcome: 'notFound' };
      }

      if (target.id === input.granterMembershipId) {
        return { outcome: 'selfManagementForbidden' };
      }

      if (input.status === 'DISABLED' && target.role === 'OWNER' && target.status === 'ACTIVE') {
        const otherActiveOwners = await tx.restaurantMembership.count({
          where: {
            restaurantId: input.restaurantId,
            role: 'OWNER',
            status: 'ACTIVE',
            id: { not: target.id },
          },
        });
        if (otherActiveOwners === 0) {
          return { outcome: 'lastOwnerProtected' };
        }
      }

      await tx.restaurantMembership.update({
        where: { id: target.id },
        data: { status: input.status },
      });

      const branches = await resolveMembershipBranches(tx, {
        restaurantId: input.restaurantId,
        membershipId: target.id,
        allBranches: target.allBranches,
      });

      return {
        outcome: 'updated',
        data: {
          id: target.id,
          user: target.user,
          role: target.role,
          roleId: target.restaurantRole.id,
          roleName: target.restaurantRole.name,
          status: input.status,
          allBranches: target.allBranches,
          branches,
        },
      };
    });
  }
}

/** Shared "resolve this one Membership's current Branch list" helper -- `allBranches=true` returns every same-Restaurant Branch, `allBranches=false` returns exactly its assigned rows. */
async function resolveMembershipBranches(
  tx: Prisma.TransactionClient,
  params: { restaurantId: string; membershipId: string; allBranches: boolean },
): Promise<StaffMembershipBranch[]> {
  if (params.allBranches) {
    return tx.branch.findMany({
      where: { restaurantId: params.restaurantId },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, status: true },
    });
  }
  const rows = await tx.restaurantMembershipBranch.findMany({
    where: {
      restaurantMembershipId: params.membershipId,
      branch: { restaurantId: params.restaurantId },
    },
    orderBy: { branch: { id: 'asc' } },
    select: { branch: { select: { id: true, name: true, status: true } } },
  });
  return rows.map((row) => row.branch);
}
