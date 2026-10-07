import type { Permission } from './permission';

/**
 * Pure capability check against a Membership's EFFECTIVE Permission set
 * (the Permissions of its Restaurant Role, resolved by
 * `RestaurantAccessService` from the current database state -- see
 * `effectiveRolePermissions`). No database access, no request access,
 * deterministic. Accepts only a canonical `Permission` value -- never a raw
 * string from client input.
 */
export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}
