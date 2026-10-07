import type { Permission } from '../auth/permission/permission';
import { effectiveRolePermissions } from '../auth/permission/role-permissions';
import type { Prisma, RestaurantMembershipRole } from '../generated/prisma/client';

export interface AssignableRole {
  id: string;
  name: string;
  kind: RestaurantMembershipRole;
}

export type ResolveAssignableRoleResult =
  | { outcome: 'valid'; role: AssignableRole }
  | { outcome: 'roleNotFound' }
  | { outcome: 'roleNotAssignable' }
  | { outcome: 'roleExceedsAuthority' };

/**
 * FT-12C: the shared check behind "put this Role on a Membership" (direct
 * user creation and Membership edit), so the rules cannot drift between them.
 *
 * - The Role must belong to THIS Restaurant (looked up by `id` AND
 *   `restaurantId` -- a foreign or unknown id is just `roleNotFound`).
 * - The protected Owner Role is never assignable here (ownership assignment
 *   stays a separate future workflow, as with invitations).
 * - No privilege escalation: every Permission the Role effectively grants
 *   must already be held by the granter, so a user who may manage Staff can
 *   never hand out access they do not have themselves.
 */
export async function resolveAssignableRole(
  tx: Prisma.TransactionClient,
  input: {
    restaurantId: string;
    roleId: string;
    granterPermissions: readonly string[];
  },
): Promise<ResolveAssignableRoleResult> {
  const role = await tx.restaurantRole.findFirst({
    where: { id: input.roleId, restaurantId: input.restaurantId },
    select: { id: true, name: true, kind: true, permissions: true },
  });
  if (!role) {
    return { outcome: 'roleNotFound' };
  }
  if (role.kind === 'OWNER') {
    return { outcome: 'roleNotAssignable' };
  }

  const granterHolds = new Set<string>(input.granterPermissions);
  const exceeds = effectiveRolePermissions(role).some(
    (permission) => !granterHolds.has(permission),
  );
  if (exceeds) {
    return { outcome: 'roleExceedsAuthority' };
  }

  return { outcome: 'valid', role: { id: role.id, name: role.name, kind: role.kind } };
}
