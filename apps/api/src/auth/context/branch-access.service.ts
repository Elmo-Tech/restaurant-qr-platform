import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../../common/is-uuid';
import { PrismaService } from '../../database/prisma.service';
import type { RestaurantAccessContext } from './restaurant-access.service';

/** Safe authorized Branch context. Never a Prisma record, never a Branch name. */
export interface BranchAccessContext {
  branchId: string;
}

export type BranchAccessResult =
  | { outcome: 'notFound' }
  | { outcome: 'accessDenied' }
  | { outcome: 'notOperational' }
  | { outcome: 'authorized'; context: BranchAccessContext };

/**
 * Resolves whether an already-authorized Restaurant context also authorizes
 * a requested Branch, using only current database state
 * (AUTHORIZATION FOUNDATION G decisions, AUTH_TENANCY_SPEC.md #58-61/#61A).
 *
 * Mandatory precedence (security-critical -- do not reorder):
 * 1. Branch exists AND belongs to the authorized Restaurant -- otherwise
 *    `notFound`. This also defends the Foundation F/#61A same-Restaurant
 *    invariant: a malformed RestaurantMembershipBranch row pointing at a
 *    foreign-Restaurant Branch can never pass this check, regardless of
 *    `allBranches`.
 * 2. The Branch lies inside the Membership's authorized Branch scope --
 *    otherwise `accessDenied`. `allBranches` true means every same-Restaurant
 *    Branch (already proven in step 1) is in scope; `allBranches` false
 *    requires an explicit, same-Restaurant `RestaurantMembershipBranch` row.
 * 3. Only then, `Branch.status` -- `notOperational` if not ACTIVE.
 *
 * Branch operational state is never disclosed before both authorization
 * checks above have passed.
 */
@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBranchAccess(
    restaurantAccess: RestaurantAccessContext,
    requestedBranchId: string,
  ): Promise<BranchAccessResult> {
    if (!isWellFormedUuid(requestedBranchId)) {
      return { outcome: 'notFound' };
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: requestedBranchId },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!branch || branch.restaurantId !== restaurantAccess.restaurantId) {
      return { outcome: 'notFound' };
    }

    if (!restaurantAccess.allBranches) {
      // Defense-in-depth (Foundation F/#61A): the same-Restaurant invariant
      // is enforced again here at the query level, not trusted merely
      // because restaurantMembershipId matches.
      const assignment = await this.prisma.restaurantMembershipBranch.findFirst(
        {
          where: {
            restaurantMembershipId: restaurantAccess.membershipId,
            branchId: branch.id,
            branch: { restaurantId: restaurantAccess.restaurantId },
          },
          select: { branchId: true },
        },
      );

      if (!assignment) {
        return { outcome: 'accessDenied' };
      }
    }

    if (branch.status !== 'ACTIVE') {
      return { outcome: 'notOperational' };
    }

    return { outcome: 'authorized', context: { branchId: branch.id } };
  }
}
