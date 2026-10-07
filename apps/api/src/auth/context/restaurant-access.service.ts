import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../../common/is-uuid';
import { PrismaService } from '../../database/prisma.service';
import type { RestaurantMembershipRole } from '../../generated/prisma/client';
import type { Permission } from '../permission/permission';
import { effectiveRolePermissions } from '../permission/role-permissions';

/**
 * Safe authorized Restaurant context for downstream authorization
 * (AUTHORIZATION FOUNDATION G). `role` is the Role's immutable KIND label;
 * `permissions` (FT-12C) is the Membership's EFFECTIVE Permission set, taken
 * from its Restaurant Role row as of this request -- the only thing
 * `PermissionGuard` and the Orders transition check ever consult. Never a
 * Prisma record, never a Restaurant/Branch name (not needed for
 * authorization), never a secret.
 */
export interface RestaurantAccessContext {
  membershipId: string;
  restaurantId: string;
  role: RestaurantMembershipRole;
  roleId: string;
  permissions: Permission[];
  allBranches: boolean;
}

export type RestaurantAccessResult =
  | { outcome: 'notFound' }
  | { outcome: 'notOperational' }
  | { outcome: 'authorized'; context: RestaurantAccessContext };

/**
 * Resolves whether an authenticated User currently has authorized
 * operational access to a requested Restaurant, using only Backend-derived,
 * current database state (AUTH_TENANCY_SPEC.md #39, #65A/#148A). The
 * requested Restaurant identifier is identification only -- authorization
 * always comes from `RestaurantMembership.userId` for the authenticated
 * `userId`, never from client-supplied trust.
 *
 * `notFound` deliberately covers every case that must be externally
 * indistinguishable: unknown Restaurant UUID, no Membership, INVITED
 * Membership, DISABLED Membership, and a Membership belonging to a
 * different Restaurant (API_CONVENTIONS.md #38/#38A, AUTH_TENANCY_SPEC.md
 * #65A). `notOperational` is only reachable after an ACTIVE Membership has
 * already been proven -- it never fires before authorization.
 */
@Injectable()
export class RestaurantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRestaurantAccess(
    userId: string,
    requestedRestaurantId: string,
  ): Promise<RestaurantAccessResult> {
    if (!isWellFormedUuid(requestedRestaurantId)) {
      return { outcome: 'notFound' };
    }

    // Compound-unique lookup (restaurantId + userId), narrowed to ACTIVE so
    // an unrelated/INVITED/DISABLED Membership never resolves.
    const membership = await this.prisma.restaurantMembership.findUnique({
      where: {
        restaurantId_userId: { restaurantId: requestedRestaurantId, userId },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        restaurantId: true,
        roleId: true,
        allBranches: true,
        restaurantRole: { select: { kind: true, permissions: true } },
        restaurant: { select: { status: true } },
      },
    });

    if (!membership) {
      return { outcome: 'notFound' };
    }

    // Only inspected after authorization is already proven -- operational
    // state is never disclosed before Tenant authorization.
    if (membership.restaurant.status !== 'ACTIVE') {
      return { outcome: 'notOperational' };
    }

    return {
      outcome: 'authorized',
      context: {
        membershipId: membership.id,
        restaurantId: membership.restaurantId,
        role: membership.restaurantRole.kind,
        roleId: membership.roleId,
        permissions: effectiveRolePermissions(membership.restaurantRole),
        allBranches: membership.allBranches,
      },
    };
  }
}
