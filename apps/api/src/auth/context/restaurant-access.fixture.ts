import { ALL_PERMISSIONS } from '../permission/permission';
import { ROLE_PERMISSIONS, type StarterRoleKind } from '../permission/role-permissions';
import type { RestaurantAccessContext } from './restaurant-access.service';

/**
 * Test support: a complete, valid `RestaurantAccessContext` for a starter Role,
 * with the Permissions that starter Role has by default. Specs override only
 * what they are about (`membershipId`, `restaurantId`, `allBranches`,
 * `permissions`, ...).
 */
export function restaurantAccessFor(
  kind: StarterRoleKind,
  overrides: Partial<RestaurantAccessContext> = {},
): RestaurantAccessContext {
  return {
    membershipId: 'membership-1',
    restaurantId: 'restaurant-1',
    role: kind,
    roleId: `role-${kind.toLowerCase()}`,
    permissions: kind === 'OWNER' ? [...ALL_PERMISSIONS] : [...ROLE_PERMISSIONS[kind]],
    allBranches: true,
    ...overrides,
  };
}
