import type { PrismaService } from '../database/prisma.service';

export interface OrderBranchScope {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
}

/**
 * Shared Branch-scope resolution for every Order-adjacent list/aggregate
 * query (Orders list, Dashboard analytics): Branch scope is resolved ONCE
 * here (every Restaurant Branch when `allBranches`, else the Membership's
 * explicit `restaurant_membership_branches` assignments) and returned as a
 * `branchId IN (...)` filter -- never a per-row post-filter. An explicit
 * `requestedBranchId` can only narrow within that already-authorized set; a
 * foreign/unauthorized value is silently dropped (yields zero matching rows
 * downstream), never a distinct error, mirroring `BranchesService`'s own
 * stated rationale. `undefined` means "every Branch this Membership can
 * see" (no filter needed); a defined array is the exact allowed set,
 * possibly empty.
 *
 * Extracted from `OrdersService.listOrders`'s original inline logic so the
 * Dashboard's analytics queries reuse the identical authorization decision
 * instead of a second hand-written copy of it.
 */
export async function resolveOrderBranchIdFilter(
  prisma: PrismaService,
  scope: OrderBranchScope,
  requestedBranchId: string | undefined,
): Promise<string[] | undefined> {
  if (scope.allBranches) {
    return requestedBranchId ? [requestedBranchId] : undefined;
  }

  const assignments = await prisma.restaurantMembershipBranch.findMany({
    where: {
      restaurantMembershipId: scope.membershipId,
      branch: { restaurantId: scope.restaurantId },
    },
    select: { branchId: true },
  });
  const assignedIds = assignments.map((row) => row.branchId);
  return requestedBranchId && assignedIds.includes(requestedBranchId)
    ? [requestedBranchId]
    : assignedIds;
}
