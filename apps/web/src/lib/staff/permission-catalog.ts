import type { MessageKey } from '../i18n/messages';

/**
 * Staff-facing grouping and wording for the Backend's canonical Permission
 * keys (`apps/api/src/auth/permission/permission.ts`). This is PRESENTATION
 * only: which Permissions a Role actually holds always comes from the Backend
 * (`GET /restaurants/:id/roles`). A key the Backend returns that is missing
 * here is still shown (raw key, "Other") rather than silently hidden, so
 * catalog drift can never make a Role look more restricted than it is.
 */
export interface PermissionDef {
  key: string;
  label: MessageKey;
}

export interface PermissionGroupDef {
  id: string;
  label: MessageKey;
  permissions: readonly PermissionDef[];
}

export const PERMISSION_GROUPS: readonly PermissionGroupDef[] = [
  {
    id: 'dashboard',
    label: 'roles.group.dashboard',
    permissions: [{ key: 'analytics.view', label: 'roles.perm.analytics.view' }],
  },
  {
    id: 'menu',
    label: 'roles.group.menu',
    permissions: [
      { key: 'menu.view', label: 'roles.perm.menu.view' },
      { key: 'menu.manage', label: 'roles.perm.menu.manage' },
    ],
  },
  {
    id: 'promotions',
    label: 'roles.group.promotions',
    permissions: [
      { key: 'promotions.view', label: 'roles.perm.promotions.view' },
      { key: 'promotions.manage', label: 'roles.perm.promotions.manage' },
    ],
  },
  {
    id: 'tables',
    label: 'roles.group.tables',
    permissions: [
      { key: 'tables.view', label: 'roles.perm.tables.view' },
      { key: 'tables.manage', label: 'roles.perm.tables.manage' },
    ],
  },
  {
    id: 'orders',
    label: 'roles.group.orders',
    permissions: [
      { key: 'orders.view', label: 'roles.perm.orders.view' },
      { key: 'orders.accept', label: 'roles.perm.orders.accept' },
      { key: 'orders.reject', label: 'roles.perm.orders.reject' },
      { key: 'orders.cancel', label: 'roles.perm.orders.cancel' },
      { key: 'orders.markServed', label: 'roles.perm.orders.markServed' },
    ],
  },
  {
    id: 'kitchen',
    label: 'roles.group.kitchen',
    permissions: [
      { key: 'kitchen.view', label: 'roles.perm.kitchen.view' },
      { key: 'kitchen.update', label: 'roles.perm.kitchen.update' },
    ],
  },
  {
    id: 'service',
    label: 'roles.group.service',
    permissions: [
      { key: 'sessions.view', label: 'roles.perm.sessions.view' },
      { key: 'sessions.resume', label: 'roles.perm.sessions.resume' },
      { key: 'sessions.settle', label: 'roles.perm.sessions.settle' },
      { key: 'sessions.close', label: 'roles.perm.sessions.close' },
      { key: 'serviceRequests.view', label: 'roles.perm.serviceRequests.view' },
      { key: 'serviceRequests.handle', label: 'roles.perm.serviceRequests.handle' },
    ],
  },
  {
    id: 'staff',
    label: 'roles.group.staff',
    permissions: [
      { key: 'users.view', label: 'roles.perm.users.view' },
      { key: 'users.manage', label: 'roles.perm.users.manage' },
      { key: 'roles.manage', label: 'roles.perm.roles.manage' },
    ],
  },
  {
    id: 'settings',
    label: 'roles.group.settings',
    permissions: [
      { key: 'restaurant.view', label: 'roles.perm.restaurant.view' },
      { key: 'restaurant.manage', label: 'roles.perm.restaurant.manage' },
      { key: 'branches.view', label: 'roles.perm.branches.view' },
      { key: 'branches.manage', label: 'roles.perm.branches.manage' },
    ],
  },
  {
    id: 'integrations',
    label: 'roles.group.integrations',
    permissions: [
      { key: 'integrations.view', label: 'roles.perm.integrations.view' },
      { key: 'integrations.manage', label: 'roles.perm.integrations.manage' },
    ],
  },
];

export interface ResolvedPermission {
  key: string;
  label: MessageKey | null;
  granted: boolean;
}

export interface ResolvedPermissionGroup {
  id: string;
  label: MessageKey | null;
  permissions: ResolvedPermission[];
}

/** Applies a Role's granted Permission keys to the catalog; any granted key not in the catalog lands in a trailing group with a null label. */
export function resolvePermissionGroups(grantedKeys: readonly string[]): ResolvedPermissionGroup[] {
  const granted = new Set(grantedKeys);
  const known = new Set<string>();

  const groups: ResolvedPermissionGroup[] = PERMISSION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    permissions: group.permissions.map((permission) => {
      known.add(permission.key);
      return { key: permission.key, label: permission.label, granted: granted.has(permission.key) };
    }),
  }));

  const unknown = grantedKeys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    groups.push({
      id: 'other',
      label: null,
      permissions: unknown.map((key) => ({ key, label: null, granted: true })),
    });
  }

  return groups;
}
