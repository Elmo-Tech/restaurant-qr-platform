import { hasPermission } from './has-permission';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from './permission';
import { effectiveRolePermissions, type StarterRoleKind } from './role-permissions';
import { starterRoleData } from './starter-roles';

/** The effective Permissions of a starter Role as seeded for a new Restaurant. */
function grantsOf(kind: StarterRoleKind): Permission[] {
  return effectiveRolePermissions(starterRoleData(kind));
}

const ROLES: StarterRoleKind[] = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'KITCHEN',
  'WAITER',
];

/**
 * Independently transcribed from AUTH_TENANCY_SPEC.md §49-53 -- deliberately
 * NOT imported from role-permissions.ts, so this test catches a
 * transcription error in the actual matrix rather than trivially
 * re-asserting it against itself.
 */
const EXPECTED_GRANTS: Record<StarterRoleKind, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL_PERMISSIONS), // §49: all Restaurant-level V1 Permissions
  MANAGER: new Set([
    // §50
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
    PERMISSIONS.SESSIONS_RESUME,
    PERMISSIONS.SESSIONS_SETTLE,
    PERMISSIONS.SESSIONS_CLOSE,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.INTEGRATIONS_VIEW,
  ]),
  CASHIER: new Set([
    // §51
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
    PERMISSIONS.SESSIONS_RESUME,
    PERMISSIONS.SESSIONS_SETTLE,
    PERMISSIONS.SESSIONS_CLOSE,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
  ]),
  KITCHEN: new Set([
    // §52
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
  ]),
  WAITER: new Set([
    // §53
    PERMISSIONS.RESTAURANT_VIEW,
    PERMISSIONS.BRANCHES_VIEW,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MARK_SERVED,
    PERMISSIONS.SESSIONS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_VIEW,
    PERMISSIONS.SERVICE_REQUESTS_HANDLE,
  ]),
};

describe('ALL_PERMISSIONS', () => {
  it('has exactly 29 canonical Permission keys (the 28 documented V1 keys plus roles.manage)', () => {
    expect(ALL_PERMISSIONS).toHaveLength(29);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it('has no duplicate values', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

describe('hasPermission -- exhaustive Role x Permission matrix', () => {
  for (const role of ROLES) {
    describe(role, () => {
      it.each(ALL_PERMISSIONS)('%s', (permission) => {
        expect(hasPermission(grantsOf(role), permission)).toBe(
          EXPECTED_GRANTS[role].has(permission),
        );
      });
    });
  }

  it('OWNER has every canonical V1 Restaurant Permission', () => {
    expect(
      ALL_PERMISSIONS.every((permission) =>
        hasPermission(grantsOf('OWNER'), permission),
      ),
    ).toBe(true);
  });

  it('no Role grants a Permission outside its exact documented list', () => {
    for (const role of ROLES) {
      const undocumented = ALL_PERMISSIONS.filter(
        (permission) => !EXPECTED_GRANTS[role].has(permission),
      );
      for (const permission of undocumented) {
        expect(hasPermission(grantsOf(role), permission)).toBe(false);
      }
    }
  });

  it('MANAGER lacks integrations.manage (present only implicitly via OWNER)', () => {
    expect(hasPermission(grantsOf('MANAGER'), PERMISSIONS.INTEGRATIONS_MANAGE)).toBe(false);
    expect(hasPermission(grantsOf('OWNER'), PERMISSIONS.INTEGRATIONS_MANAGE)).toBe(true);
  });

  it('KITCHEN lacks sessions.close and users.manage', () => {
    expect(hasPermission(grantsOf('KITCHEN'), PERMISSIONS.SESSIONS_CLOSE)).toBe(false);
    expect(hasPermission(grantsOf('KITCHEN'), PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it('WAITER lacks orders.cancel and menu.manage', () => {
    expect(hasPermission(grantsOf('WAITER'), PERMISSIONS.ORDERS_CANCEL)).toBe(false);
    expect(hasPermission(grantsOf('WAITER'), PERMISSIONS.MENU_MANAGE)).toBe(false);
  });

  it('only the Owner holds roles.manage by default -- no starter Role can edit Roles', () => {
    expect(hasPermission(grantsOf('OWNER'), PERMISSIONS.ROLES_MANAGE)).toBe(true);
    for (const role of ['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const) {
      expect(hasPermission(grantsOf(role), PERMISSIONS.ROLES_MANAGE)).toBe(false);
    }
  });
});

describe('effectiveRolePermissions', () => {
  it('gives the OWNER-kind Role every Permission no matter what is stored', () => {
    expect(effectiveRolePermissions({ kind: 'OWNER', permissions: [] })).toEqual([...ALL_PERMISSIONS]);
  });

  it('gives any other Role exactly its stored, known keys in registry order', () => {
    expect(
      effectiveRolePermissions({
        kind: 'CUSTOM',
        permissions: ['orders.view', 'menu.view', 'not.a.permission'],
      }),
    ).toEqual(['menu.view', 'orders.view']);
  });

  it('gives a Role with no stored permissions nothing', () => {
    expect(effectiveRolePermissions({ kind: 'CUSTOM', permissions: [] })).toEqual([]);
  });
});
