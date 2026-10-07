import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, type Permission } from '../auth/permission/permission';
import {
  STARTER_ROLE_KINDS,
  effectiveRolePermissions,
} from '../auth/permission/role-permissions';
import { PrismaService } from '../database/prisma.service';
import { Prisma, type RestaurantMembershipRole } from '../generated/prisma/client';

export interface StaffRoleItem {
  id: string;
  name: string;
  /** Immutable kind label: OWNER (protected), a starter kind, or CUSTOM. */
  kind: RestaurantMembershipRole;
  /** OWNER is protected: it always holds every Permission and can never be renamed, edited or deleted. */
  isProtected: boolean;
  /** The Permissions the Role effectively grants, in registry order. */
  permissions: Permission[];
  /** Memberships of THIS Restaurant (any status) that hold the Role -- a Role with any cannot be deleted. */
  memberCount: number;
}

export interface RoleGranterScope {
  restaurantId: string;
  /** The editor's own effective Permissions -- no Role may grant more than they hold. */
  granterPermissions: readonly string[];
}

export type RoleMutationResult =
  | { outcome: 'ok'; data: StaffRoleItem }
  | { outcome: 'notFound' }
  | { outcome: 'protected' }
  | { outcome: 'nameTaken' }
  | { outcome: 'exceedsAuthority' };

export type DeleteRoleResult =
  | { outcome: 'deleted' }
  | { outcome: 'notFound' }
  | { outcome: 'protected' }
  | { outcome: 'inUse'; memberCount: number };

interface RoleRow {
  id: string;
  name: string;
  kind: RestaurantMembershipRole;
  permissions: string[];
}

const ROLE_SELECT = { id: true, name: true, kind: true, permissions: true } as const;

function toItem(row: RoleRow, memberCount: number): StaffRoleItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isProtected: row.kind === 'OWNER',
    permissions: effectiveRolePermissions(row),
    memberCount,
  };
}

/** OWNER first, then the starter Roles in their usual order, then custom Roles by name. */
function roleSortKey(kind: RestaurantMembershipRole): number {
  const index = STARTER_ROLE_KINDS.indexOf(kind as (typeof STARTER_ROLE_KINDS)[number]);
  return index === -1 ? STARTER_ROLE_KINDS.length : index;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isUniqueNameConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Canonical, registry-ordered, de-duplicated permission keys; anything unknown is dropped (the DTO already rejects it). */
function canonicalPermissions(keys: readonly string[]): Permission[] {
  const requested = new Set(keys);
  return ALL_PERMISSIONS.filter((permission) => requested.has(permission));
}

/**
 * FT-12C: Restaurant Roles. A Role is WHAT a Membership may do; WHERE it may do
 * it stays on the Membership (Branch scope). Enforcement itself is unchanged:
 * `RestaurantAccessService` reads the Membership's Role row and
 * `PermissionGuard` checks the same canonical Permission keys as before -- this
 * service only manages the rows, so it is not a second authorization system.
 *
 * Safety rules, all Restaurant-scoped at the query itself:
 * - the OWNER Role is protected (never renamed, edited or deleted);
 * - no privilege escalation: a Role can only be given Permissions its editor
 *   holds (editing may always remove Permissions);
 * - a Role held by any Membership is never deleted (`inUse`), and its
 *   Memberships are never touched or cascaded;
 * - names are unique per Restaurant, case-insensitively.
 */
@Injectable()
export class StaffRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(restaurantId: string): Promise<StaffRoleItem[]> {
    const [roles, counts] = await Promise.all([
      this.prisma.restaurantRole.findMany({
        where: { restaurantId },
        select: ROLE_SELECT,
      }),
      this.prisma.restaurantMembership.groupBy({
        by: ['roleId'],
        where: { restaurantId },
        _count: { _all: true },
      }),
    ]);
    const countByRoleId = new Map(counts.map((row) => [row.roleId, row._count._all]));

    return roles
      .map((role) => toItem(role, countByRoleId.get(role.id) ?? 0))
      .sort(
        (a, b) =>
          roleSortKey(a.kind) - roleSortKey(b.kind) || a.name.localeCompare(b.name),
      );
  }

  async createRole(
    scope: RoleGranterScope,
    input: { name: string; permissions: string[] },
  ): Promise<RoleMutationResult> {
    const permissions = canonicalPermissions(input.permissions);
    if (!this.holdsAll(scope, permissions)) {
      return { outcome: 'exceedsAuthority' };
    }

    try {
      const created = await this.prisma.restaurantRole.create({
        data: {
          restaurantId: scope.restaurantId,
          name: input.name.trim(),
          nameNormalized: normalizeName(input.name),
          kind: 'CUSTOM',
          permissions,
        },
        select: ROLE_SELECT,
      });
      return { outcome: 'ok', data: toItem(created, 0) };
    } catch (error) {
      if (isUniqueNameConflict(error)) {
        return { outcome: 'nameTaken' };
      }
      throw error;
    }
  }

  async updateRole(
    scope: RoleGranterScope,
    roleId: string,
    input: { name?: string; permissions?: string[] },
  ): Promise<RoleMutationResult> {
    const existing = await this.prisma.restaurantRole.findFirst({
      where: { id: roleId, restaurantId: scope.restaurantId },
      select: ROLE_SELECT,
    });
    if (!existing) {
      return { outcome: 'notFound' };
    }
    if (existing.kind === 'OWNER') {
      return { outcome: 'protected' };
    }

    const data: { name?: string; nameNormalized?: string; permissions?: string[] } = {};

    if (input.permissions !== undefined) {
      const next = canonicalPermissions(input.permissions);
      const current = new Set(existing.permissions);
      const added = next.filter((permission) => !current.has(permission));
      if (!this.holdsAll(scope, added)) {
        return { outcome: 'exceedsAuthority' };
      }
      data.permissions = next;
    }

    if (input.name !== undefined) {
      data.name = input.name.trim();
      data.nameNormalized = normalizeName(input.name);
    }

    try {
      const updated = await this.prisma.restaurantRole.update({
        where: { id: existing.id },
        data,
        select: ROLE_SELECT,
      });
      const memberCount = await this.prisma.restaurantMembership.count({
        where: { restaurantId: scope.restaurantId, roleId: existing.id },
      });
      return { outcome: 'ok', data: toItem(updated, memberCount) };
    } catch (error) {
      if (isUniqueNameConflict(error)) {
        return { outcome: 'nameTaken' };
      }
      throw error;
    }
  }

  async deleteRole(restaurantId: string, roleId: string): Promise<DeleteRoleResult> {
    const existing = await this.prisma.restaurantRole.findFirst({
      where: { id: roleId, restaurantId },
      select: { id: true, kind: true },
    });
    if (!existing) {
      return { outcome: 'notFound' };
    }
    if (existing.kind === 'OWNER') {
      return { outcome: 'protected' };
    }

    const memberCount = await this.prisma.restaurantMembership.count({
      where: { restaurantId, roleId: existing.id },
    });
    if (memberCount > 0) {
      return { outcome: 'inUse', memberCount };
    }

    try {
      await this.prisma.restaurantRole.delete({ where: { id: existing.id } });
    } catch (error) {
      // The Membership FK is `Restrict`: if someone was assigned this Role
      // between the count and the delete, the database refuses (P2003) and
      // nothing is lost.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return { outcome: 'inUse', memberCount: 1 };
      }
      throw error;
    }
    return { outcome: 'deleted' };
  }

  private holdsAll(scope: RoleGranterScope, permissions: readonly Permission[]): boolean {
    const held = new Set<string>(scope.granterPermissions);
    return permissions.every((permission) => held.has(permission));
  }
}
