import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  BranchStatus,
  RestaurantMembershipRole,
  RestaurantMembershipStatus,
} from '../generated/prisma/client';

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
  role: RestaurantMembershipRole;
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
}
