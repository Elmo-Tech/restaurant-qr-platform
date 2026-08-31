import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../../common/is-uuid';
import { PrismaService } from '../../database/prisma.service';
import type { RestaurantMembershipRole } from '../../generated/prisma/client';

/**
 * Safe authorized Restaurant context for downstream authorization
 * (AUTHORIZATION FOUNDATION G). `role` is carried forward as metadata only
 * -- it is not yet interpreted into permissions (that is a later slice).
 * Never a Prisma record, never a Restaurant/Branch name (not needed for
 * authorization), never a secret.
 */
export interface RestaurantAccessContext {
  membershipId: string;
  restaurantId: string;
  role: RestaurantMembershipRole;
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
        role: true,
        allBranches: true,
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
        role: membership.role,
        allBranches: membership.allBranches,
      },
    };
  }
}
