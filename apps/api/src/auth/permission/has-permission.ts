import type { RestaurantMembershipRole } from '../../generated/prisma/client';
import type { Permission } from './permission';
import { ROLE_PERMISSIONS } from './role-permissions';

/**
 * Pure Role -> Permission capability check (AUTH_TENANCY_SPEC.md §49-53).
 * No database access, no request access, deterministic. Accepts only the
 * generated Prisma `RestaurantMembershipRole` and a canonical `Permission`
 * value -- never a raw string from client input.
 */
export function hasPermission(
  role: RestaurantMembershipRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
