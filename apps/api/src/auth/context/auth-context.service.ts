import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  BranchStatus,
  RestaurantMembershipRole,
  RestaurantStatus,
} from '../../generated/prisma/client';
import type { Permission } from '../permission/permission';
import { effectiveRolePermissions } from '../permission/role-permissions';

/** Safe User identity fields (AUTH_TENANCY_SPEC.md #148/#148A). Never passwordHash. */
export interface AuthContextUser {
  id: string;
  email: string;
  preferredLocale: string | null;
}

/**
 * `status` is current operational state, not authorization
 * (AUTH_TENANCY_SPEC.md #148A) -- a non-ACTIVE Restaurant does not remove
 * the Membership that references it. `currencyCode`/`defaultLocale` are the
 * only other Restaurant fields exposed here (Batch G0) -- both are already
 * safe, non-secret configuration; no internal timestamps, billing data, or
 * other Restaurant settings are added.
 */
export interface AuthContextRestaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
  currencyCode: string;
  defaultLocale: string;
  /** FT-12: the Staff Restaurant-identity surface (Sidebar) needs this to render the logo without a second request. Null when no logo has been uploaded. */
  logoAssetPath: string | null;
}

/**
 * `status` is current operational state, not Branch-scope authorization
 * (AUTH_TENANCY_SPEC.md #148A) -- an INACTIVE Branch within an authorized
 * scope is still returned.
 */
export interface AuthContextBranch {
  id: string;
  name: string;
  status: BranchStatus;
}

/**
 * One ACTIVE RestaurantMembership (AUTH_TENANCY_SPEC.md #39) and its
 * Backend-derived authorization context. `branches` is the Membership's
 * exact authorized Branch scope (AUTH_TENANCY_SPEC.md #58-60): every
 * Restaurant Branch when `allBranches` is true, or exactly the assigned
 * `RestaurantMembershipBranch` rows (possibly empty) when it is false.
 *
 * `permissions` (Batch G0, FT-12C) is the Membership's Restaurant Role's
 * effective Permission set -- the exact same source
 * `PermissionGuard`/`hasPermission` enforce against, never a second matrix.
 * This is ADVISORY FRONTEND CONTEXT ONLY, for hiding/disabling inappropriate
 * UI controls -- it grants nothing by itself. Backend guards re-check
 * current database state on every real request and remain the sole
 * authorization authority regardless of what a client has cached or sends.
 */
export interface AuthContextMembership {
  id: string;
  /** The Role's immutable kind label (`CUSTOM` for a Restaurant-defined Role). */
  role: RestaurantMembershipRole;
  roleId: string;
  /** The Restaurant Role's display name -- what to show for a custom or renamed Role. */
  roleName: string;
  allBranches: boolean;
  permissions: Permission[];
  restaurant: AuthContextRestaurant;
  branches: AuthContextBranch[];
}

export interface AuthContext {
  user: AuthContextUser;
  memberships: AuthContextMembership[];
}

/**
 * Read-only authorization context for an already-authenticated User
 * (Auth Foundation F). Input is a Backend-authenticated `userId` only --
 * never a client-supplied restaurantId/branchId/membershipId/role. This
 * service does not enforce Restaurant/Branch/Permission policy; it exposes
 * the authorized context that a later authorization slice will enforce
 * against.
 */
@Injectable()
export class AuthContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthContext(userId: string): Promise<AuthContext> {
    // AuthGuard already resolved this userId from a valid ACTIVE-User
    // session, so a missing row here would be a data-integrity violation
    // (User has an onDelete: Restrict FK from AuthSession), not a normal
    // authentication outcome -- it is allowed to surface as an unhandled
    // 500 rather than being folded into a 401.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, preferredLocale: true },
    });

    if (!user) {
      throw new Error('AuthContextService: authenticated User row not found');
    }

    // AUTH_TENANCY_SPEC.md #39: only ACTIVE Memberships are accessible.
    // INVITED/DISABLED are excluded regardless of Restaurant/Branch status
    // (#148A). Ordered by id for deterministic output only (#8 of the
    // approved decisions) -- no product meaning.
    const memberships = await this.prisma.restaurantMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        allBranches: true,
        restaurantRole: {
          select: { id: true, name: true, kind: true, permissions: true },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            status: true,
            currencyCode: true,
            defaultLocale: true,
            logoAssetPath: true,
          },
        },
      },
    });

    const allBranchesRestaurantIds = memberships
      .filter((membership) => membership.allBranches)
      .map((membership) => membership.restaurant.id);
    // Each pairs a restricted Membership with the one Restaurant it is
    // actually authorized for, so the branch-access query below can require
    // BOTH restaurantMembershipId AND Branch.restaurantId to match the SAME
    // Membership -- restaurantMembershipId alone is not proof of
    // authorization scope (see AUTH_TENANCY_SPEC.md #61A: RestaurantMembershipBranch is only a
    // valid grant when Branch.restaurantId equals the Membership's own
    // restaurantId).
    const scopedMemberships = memberships
      .filter((membership) => !membership.allBranches)
      .map((membership) => ({
        membershipId: membership.id,
        restaurantId: membership.restaurant.id,
      }));

    // Two batched queries (not one per Membership) to avoid N+1, grouped
    // back onto their owning Restaurant/Membership in application code.
    const [restaurantBranches, membershipBranchRows] = await Promise.all([
      allBranchesRestaurantIds.length > 0
        ? this.prisma.branch.findMany({
            where: { restaurantId: { in: allBranchesRestaurantIds } },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              name: true,
              status: true,
              restaurantId: true,
            },
          })
        : Promise.resolve([]),
      scopedMemberships.length > 0
        ? this.prisma.restaurantMembershipBranch.findMany({
            // Same-Restaurant invariant enforced in the query itself, not
            // trusted from the stored pair alone (AUTH_TENANCY_SPEC.md #61A): a malformed row
            // whose Branch belongs to a different Restaurant than this
            // Membership matches none of these OR branches and is silently
            // excluded -- it never becomes authorized context.
            where: {
              OR: scopedMemberships.map((membership) => ({
                restaurantMembershipId: membership.membershipId,
                branch: { restaurantId: membership.restaurantId },
              })),
            },
            orderBy: { branch: { id: 'asc' } },
            select: {
              restaurantMembershipId: true,
              branch: { select: { id: true, name: true, status: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const branchesByRestaurantId = new Map<string, AuthContextBranch[]>();
    for (const branch of restaurantBranches) {
      const list = branchesByRestaurantId.get(branch.restaurantId) ?? [];
      list.push({ id: branch.id, name: branch.name, status: branch.status });
      branchesByRestaurantId.set(branch.restaurantId, list);
    }

    const branchesByMembershipId = new Map<string, AuthContextBranch[]>();
    for (const row of membershipBranchRows) {
      const list = branchesByMembershipId.get(row.restaurantMembershipId) ?? [];
      list.push({
        id: row.branch.id,
        name: row.branch.name,
        status: row.branch.status,
      });
      branchesByMembershipId.set(row.restaurantMembershipId, list);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        preferredLocale: user.preferredLocale,
      },
      memberships: memberships.map((membership) => ({
        id: membership.id,
        role: membership.restaurantRole.kind,
        roleId: membership.restaurantRole.id,
        roleName: membership.restaurantRole.name,
        allBranches: membership.allBranches,
        // The Role's effective Permission set, from the same helper
        // RestaurantAccessService uses (registry order, fresh array) -- never
        // recomputed or duplicated here.
        permissions: effectiveRolePermissions(membership.restaurantRole),
        restaurant: {
          id: membership.restaurant.id,
          name: membership.restaurant.name,
          status: membership.restaurant.status,
          currencyCode: membership.restaurant.currencyCode,
          defaultLocale: membership.restaurant.defaultLocale,
          logoAssetPath: membership.restaurant.logoAssetPath,
        },
        branches: membership.allBranches
          ? (branchesByRestaurantId.get(membership.restaurant.id) ?? [])
          : (branchesByMembershipId.get(membership.id) ?? []),
      })),
    };
  }
}
