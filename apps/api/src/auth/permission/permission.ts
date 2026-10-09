/**
 * Canonical V1 Restaurant-level Permission registry (AUTH_TENANCY_SPEC.md
 * §48). This is the ONLY source of Permission-string literals -- guards,
 * controllers, and tests must reference `PERMISSIONS.*`, never a raw
 * string, so a typo can never silently create an unenforceable route.
 *
 * 28 canonical keys as documented in AUTH_TENANCY_SPEC.md §48, plus
 * `roles.manage` (FT-12C) -- the one key needed to create, edit and delete
 * Restaurant Roles, plus `sessions.open` (Table Sessions design v3, D3) -- the
 * key for manually opening a Table Session.
 */
export const PERMISSIONS = {
  RESTAURANT_VIEW: 'restaurant.view',
  RESTAURANT_MANAGE: 'restaurant.manage',
  BRANCHES_VIEW: 'branches.view',
  BRANCHES_MANAGE: 'branches.manage',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  TABLES_VIEW: 'tables.view',
  TABLES_MANAGE: 'tables.manage',
  MENU_VIEW: 'menu.view',
  MENU_MANAGE: 'menu.manage',
  PROMOTIONS_VIEW: 'promotions.view',
  PROMOTIONS_MANAGE: 'promotions.manage',
  ORDERS_VIEW: 'orders.view',
  ORDERS_ACCEPT: 'orders.accept',
  ORDERS_REJECT: 'orders.reject',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_MARK_SERVED: 'orders.markServed',
  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_UPDATE: 'kitchen.update',
  SESSIONS_VIEW: 'sessions.view',
  SESSIONS_OPEN: 'sessions.open',
  SESSIONS_RESUME: 'sessions.resume',
  SESSIONS_SETTLE: 'sessions.settle',
  SESSIONS_CLOSE: 'sessions.close',
  SERVICE_REQUESTS_VIEW: 'serviceRequests.view',
  SERVICE_REQUESTS_HANDLE: 'serviceRequests.handle',
  ANALYTICS_VIEW: 'analytics.view',
  INTEGRATIONS_VIEW: 'integrations.view',
  INTEGRATIONS_MANAGE: 'integrations.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every canonical Permission value, derived from PERMISSIONS (never duplicated by hand). */
export const ALL_PERMISSIONS: readonly Permission[] =
  Object.values(PERMISSIONS);
