import type { RestaurantMembershipRole } from '../../generated/prisma/client';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from './permission';

/** The five Roles every Restaurant starts with (`CUSTOM` Roles are Restaurant-defined and have no template). */
export type StarterRoleKind = Exclude<RestaurantMembershipRole, 'CUSTOM'>;

/**
 * Starter Role -> Permission TEMPLATES (AUTH_TENANCY_SPEC.md §49-53). Since
 * FT-12C these are no longer what is enforced: every Restaurant owns its Roles
 * as `RestaurantRole` rows, seeded from these templates at provisioning (and
 * by the FT-12C backfill migration for existing Restaurants), and enforcement
 * reads the Membership's Role row. The templates themselves are immutable:
 * never mutated at runtime, never read from client input. Special domain invariants (last-OWNER protection, ownership
 * transfer, OWNER-assignment restriction) are deliberately NOT represented
 * here -- they are separate authorization rules for a later mutation slice,
 * not ordinary Permission grants.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<StarterRoleKind, readonly Permission[]>
> = {
  // §49: OWNER has all Restaurant-level V1 Permissions.
  OWNER: ALL_PERMISSIONS,

  // §50
  MANAGER: [
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.BRANCHES_MANAGE,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.TABLES_MANAGE,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.MENU_MANAGE,
    PERMISSIONS.PROMOTIONS_VIEW,
    PERMISSIONS.PROMOTIONS_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_MARK_SERVED,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
    PERMISSIONS.SESSIONS_VIEW,
    PERMISSIONS.SESSIONS_OPEN,
    PERMISSIONS.SESSIONS_RESUME,
    PERMISSIONS.SESSIONS_SETTLE,
    PERMISSIONS.SESSIONS_CLOSE,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.INTEGRATIONS_VIEW,
  ],

  // §51
  CASHIER: [
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.PROMOTIONS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_MARK_SERVED,
    PERMISSIONS.SESSIONS_VIEW,
    PERMISSIONS.SESSIONS_OPEN,
    PERMISSIONS.SESSIONS_RESUME,
    PERMISSIONS.SESSIONS_SETTLE,
    PERMISSIONS.SESSIONS_CLOSE,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
  ],

  // §52
  KITCHEN: [
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
  ],

  // §53
  WAITER: [
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MARK_SERVED,
    PERMISSIONS.SESSIONS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
  ],
};

/** Default display names of the starter Roles (a Restaurant may rename them). */
export const STARTER_ROLE_NAMES: Readonly<Record<StarterRoleKind, string>> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  KITCHEN: 'Kitchen',
  WAITER: 'Waiter',
};

/** Display/seed order of the starter Roles. */
export const STARTER_ROLE_KINDS: readonly StarterRoleKind[] = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'KITCHEN',
  'WAITER',
];

/**
 * The Permissions a Role effectively holds. The protected OWNER-kind Role
 * always holds every Permission (it cannot be edited or lose any, and gains
 * newly added ones automatically); any other Role holds exactly its stored
 * keys that exist in the canonical registry -- an unknown/legacy key can
 * never grant anything. Returned in registry order, as a fresh array.
 */
export function effectiveRolePermissions(role: {
  kind: RestaurantMembershipRole;
  permissions: readonly string[];
}): Permission[] {
  if (role.kind === 'OWNER') {
    return [...ALL_PERMISSIONS];
  }
  const stored = new Set(role.permissions);
  return ALL_PERMISSIONS.filter((permission) => stored.has(permission));
}
