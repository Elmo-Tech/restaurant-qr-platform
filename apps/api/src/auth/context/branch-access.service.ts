import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../../common/is-uuid';
import { PrismaService } from '../../database/prisma.service';
import type { BranchStatus } from '../../generated/prisma/client';
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
 * Business Foundation L2: the management variant has no `notOperational`
 * outcome at all -- Branch operational status never blocks a management
 * mutation, so there is no code path that could produce it.
 */
export type BranchManagementAccessResult =
  | { outcome: 'notFound' }
  | { outcome: 'accessDenied' }
  | { outcome: 'authorized'; context: BranchAccessContext };

type IdentityAndScopeResult =
  | { outcome: 'notFound' }
  | { outcome: 'accessDenied' }
  | { outcome: 'inScope'; branch: { id: string; status: BranchStatus } };

/**
 * Resolves whether an already-authorized Restaurant context also authorizes
 * a requested Branch, using only current database state
 * (AUTHORIZATION FOUNDATION G decisions, AUTH_TENANCY_SPEC.md #58-61/#61A).
 *
 * Exposes two public resolution modes over the exact same identity/Branch-
 * scope logic (Business Foundation L2, AUTH_TENANCY_SPEC.md #65D):
 * - `resolveBranchAccess` -- OPERATIONAL access. Additionally requires
 *   `Branch.status === 'ACTIVE'`. Unchanged behavior from Authorization
 *   Foundation G; used by the existing `BranchAccessGuard` for ordinary
 *   Branch-scoped business operations.
 * - `resolveBranchManagementAccess` -- MANAGEMENT access. Deliberately does
 *   NOT check `Branch.status` -- Staff configuration/lifecycle mutations
 *   (e.g. adding a Table) must remain possible while a Branch is still
 *   `INACTIVE` during onboarding. Used by `BranchManagementAccessGuard`.
 *
 * Both modes share one private identity+scope resolver so the Branch lookup
 * and Membership-scope logic is never duplicated.
 */
@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBranchAccess(
    restaurantAccess: RestaurantAccessContext,
    requestedBranchId: string,
  ): Promise<BranchAccessResult> {
    const scoped = await this.resolveIdentityAndScope(
      restaurantAccess,
      requestedBranchId,
    );

    if (scoped.outcome !== 'inScope') {
      return scoped;
    }

    // Operational status is the third precedence step, only reachable once
    // both identity and scope have already been proven -- unchanged from
    // Authorization Foundation G.
    if (scoped.branch.status !== 'ACTIVE') {
      return { outcome: 'notOperational' };
    }

    return { outcome: 'authorized', context: { branchId: scoped.branch.id } };
  }

  async resolveBranchManagementAccess(
    restaurantAccess: RestaurantAccessContext,
    requestedBranchId: string,
  ): Promise<BranchManagementAccessResult> {
    const scoped = await this.resolveIdentityAndScope(
      restaurantAccess,
      requestedBranchId,
    );

    if (scoped.outcome !== 'inScope') {
      return scoped;
    }

    // Business Foundation L2: management access intentionally stops here --
    // no Branch.status check. A Branch-scoped Membership assigned to this
    // Branch may configure it regardless of ACTIVE/INACTIVE.
    return { outcome: 'authorized', context: { branchId: scoped.branch.id } };
  }

  /**
   * Mandatory precedence (security-critical -- do not reorder):
   * 1. Branch exists AND belongs to the authorized Restaurant -- otherwise
   *    `notFound`. This also defends the Foundation F/#61A same-Restaurant
   *    invariant: a malformed RestaurantMembershipBranch row pointing at a
   *    foreign-Restaurant Branch can never pass this check, regardless of
   *    `allBranches`.
   * 2. The Branch lies inside the Membership's authorized Branch scope --
   *    otherwise `accessDenied`. `allBranches` true means every
   *    same-Restaurant Branch (already proven in step 1) is in scope;
   *    `allBranches` false requires an explicit, same-Restaurant
   *    `RestaurantMembershipBranch` row.
   *
   * Branch identity/scope is never disclosed before both checks above have
   * passed. Operational status is deliberately NOT resolved here -- each
   * public method decides independently whether to apply it.
   */
  private async resolveIdentityAndScope(
    restaurantAccess: RestaurantAccessContext,
    requestedBranchId: string,
  ): Promise<IdentityAndScopeResult> {
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

    return {
      outcome: 'inScope',
      branch: { id: branch.id, status: branch.status },
    };
  }
}
