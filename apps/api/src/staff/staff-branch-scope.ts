import type { Prisma, BranchStatus } from '../generated/prisma/client';

export interface BranchGrantBranch {
  id: string;
  name: string;
  status: BranchStatus;
}

export interface ValidateBranchGrantInput {
  restaurantId: string;
  /** The Membership doing the granting (inviting, or editing another Membership's scope) -- never the target. */
  granterMembershipId: string;
  granterAllBranches: boolean;
  allBranches: boolean;
  branchIds: string[];
}

export type ValidateBranchGrantResult =
  | { outcome: 'valid'; branches: BranchGrantBranch[] }
  | { outcome: 'branchNotFound' }
  | { outcome: 'scopeExceedsAuthority' };

/**
 * Shared Branch-grant authority check (AUTH_TENANCY_SPEC.md #65L "Inviter
 * Branch grant authority", SECURITY CRITICAL), extracted from
 * `StaffInvitationsService.attemptCreateInvitation`'s original inline logic
 * so Staff Invitation creation and Staff Membership scope-editing (FT-12)
 * enforce the IDENTICAL rule instead of two hand-written copies of a
 * security-critical check: a granter with `allBranches = true` may grant
 * `allBranches = true` or any valid same-Restaurant Branch subset; a granter
 * with `allBranches = false` may only grant `allBranches = false` with a
 * Branch set that is an exact subset of their OWN CURRENT valid
 * same-Restaurant Branch assignments (re-read live from `tx`, never trusted
 * from stale/client state) -- granting `allBranches = true`, or any Branch
 * outside that scope, is rejected regardless of Role or Permission.
 *
 * Branch identity (`branchNotFound`) is always checked before authority
 * (`scopeExceedsAuthority`) is ever disclosed -- an unknown or
 * foreign-Restaurant Branch id never leaks whether the granter would also
 * have lacked authority over it.
 */
export async function validateBranchGrant(
  tx: Prisma.TransactionClient,
  input: ValidateBranchGrantInput,
): Promise<ValidateBranchGrantResult> {
  if (!input.allBranches) {
    const branches = await tx.branch.findMany({
      where: { id: { in: input.branchIds }, restaurantId: input.restaurantId },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, status: true },
    });

    if (branches.length !== input.branchIds.length) {
      return { outcome: 'branchNotFound' };
    }

    if (!input.granterAllBranches) {
      const granterAssignments = await tx.restaurantMembershipBranch.findMany({
        where: {
          restaurantMembershipId: input.granterMembershipId,
          branch: { restaurantId: input.restaurantId },
        },
        select: { branchId: true },
      });
      const granterBranchIds = new Set(granterAssignments.map((assignment) => assignment.branchId));
      const exceedsAuthority = branches.some((branch) => !granterBranchIds.has(branch.id));
      if (exceedsAuthority) {
        return { outcome: 'scopeExceedsAuthority' };
      }
    }

    return { outcome: 'valid', branches };
  }

  if (!input.granterAllBranches) {
    return { outcome: 'scopeExceedsAuthority' };
  }

  const branches = await tx.branch.findMany({
    where: { restaurantId: input.restaurantId },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, status: true },
  });
  return { outcome: 'valid', branches };
}
