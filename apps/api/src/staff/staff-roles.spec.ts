import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { ALL_PERMISSIONS, PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { starterRoleData } from '../auth/permission/starter-roles';
import { Prisma } from '../generated/prisma/client';
import { StaffRolesController } from './staff-roles.controller';
import { StaffRolesService } from './staff-roles.service';

const RESTAURANT_ID = 'restaurant-1';
const OWNER_SCOPE = { restaurantId: RESTAURANT_ID, granterPermissions: ALL_PERMISSIONS };

function roleRow(kind: 'OWNER' | 'MANAGER' | 'CASHIER' | 'CUSTOM', overrides: Record<string, unknown> = {}) {
  if (kind === 'CUSTOM') {
    return { id: 'role-custom', name: 'Barista', kind, permissions: ['orders.view'], ...overrides };
  }
  const starter = starterRoleData(kind);
  return { id: `role-${kind.toLowerCase()}`, name: starter.name, kind, permissions: starter.permissions, ...overrides };
}

function buildMocks() {
  const roleFindMany = jest.fn().mockResolvedValue([]);
  const roleFindFirst = jest.fn().mockResolvedValue(null);
  const roleCreate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'role-new', ...data }),
  );
  const roleUpdate = jest.fn().mockImplementation(({ data, where }: { data: Record<string, unknown>; where: { id: string } }) =>
    Promise.resolve({ ...roleRow('CUSTOM'), id: where.id, ...data }),
  );
  const roleDelete = jest.fn().mockResolvedValue({});
  const membershipGroupBy = jest.fn().mockResolvedValue([]);
  const membershipCount = jest.fn().mockResolvedValue(0);
  const prisma = {
    restaurantRole: {
      findMany: roleFindMany,
      findFirst: roleFindFirst,
      create: roleCreate,
      update: roleUpdate,
      delete: roleDelete,
    },
    restaurantMembership: { groupBy: membershipGroupBy, count: membershipCount },
  };
  return {
    service: new StaffRolesService(prisma as never),
    roleFindMany,
    roleFindFirst,
    roleCreate,
    roleUpdate,
    roleDelete,
    membershipGroupBy,
    membershipCount,
  };
}

describe('StaffRolesService.listRoles', () => {
  it('lists the Restaurant\'s Roles scoped by restaurantId, Owner first, starters in order, then custom by name', async () => {
    const mocks = buildMocks();
    mocks.roleFindMany.mockResolvedValue([
      roleRow('CUSTOM', { id: 'r-z', name: 'Zed' }),
      roleRow('CASHIER'),
      roleRow('CUSTOM', { id: 'r-a', name: 'Alpha' }),
      roleRow('OWNER'),
      roleRow('MANAGER'),
    ]);

    const roles = await mocks.service.listRoles(RESTAURANT_ID);

    expect(mocks.roleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId: RESTAURANT_ID } }));
    expect(roles.map((role) => role.name)).toEqual(['Owner', 'Manager', 'Cashier', 'Alpha', 'Zed']);
  });

  it('counts Memberships of THIS Restaurant (any status) per Role, and marks only Owner protected', async () => {
    const mocks = buildMocks();
    mocks.roleFindMany.mockResolvedValue([roleRow('OWNER'), roleRow('MANAGER')]);
    mocks.membershipGroupBy.mockResolvedValue([{ roleId: 'role-manager', _count: { _all: 3 } }]);

    const roles = await mocks.service.listRoles(RESTAURANT_ID);

    expect(mocks.membershipGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: RESTAURANT_ID } }),
    );
    expect(roles.find((role) => role.kind === 'MANAGER')?.memberCount).toBe(3);
    expect(roles.find((role) => role.kind === 'OWNER')?.memberCount).toBe(0);
    expect(roles.filter((role) => role.isProtected).map((role) => role.kind)).toEqual(['OWNER']);
  });

  it('reports Owner as holding every Permission whatever is stored, and others exactly what they store', async () => {
    const mocks = buildMocks();
    mocks.roleFindMany.mockResolvedValue([roleRow('OWNER', { permissions: [] }), roleRow('CUSTOM')]);

    const roles = await mocks.service.listRoles(RESTAURANT_ID);

    expect(roles[0].permissions).toEqual([...ALL_PERMISSIONS]);
    expect(roles[1].permissions).toEqual(['orders.view']);
  });
});

describe('StaffRolesService.createRole', () => {
  it('creates a CUSTOM Role in the authorized Restaurant with canonical, ordered permissions', async () => {
    const mocks = buildMocks();

    const result = await mocks.service.createRole(OWNER_SCOPE, {
      name: '  Barista  ',
      permissions: ['orders.view', 'menu.view', 'orders.view'],
    });

    expect(mocks.roleCreate).toHaveBeenCalledWith({
      data: {
        restaurantId: RESTAURANT_ID,
        name: 'Barista',
        nameNormalized: 'barista',
        kind: 'CUSTOM',
        permissions: ['menu.view', 'orders.view'],
      },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({ outcome: 'ok', data: { name: 'Barista', kind: 'CUSTOM', memberCount: 0 } });
  });

  it('refuses a Role granting a Permission its creator does not hold (no privilege escalation)', async () => {
    const mocks = buildMocks();

    const result = await mocks.service.createRole(
      { restaurantId: RESTAURANT_ID, granterPermissions: ['roles.manage', 'orders.view'] },
      { name: 'Sneaky', permissions: ['orders.view', 'integrations.manage'] },
    );

    expect(result).toEqual({ outcome: 'exceedsAuthority' });
    expect(mocks.roleCreate).not.toHaveBeenCalled();
  });

  it('a duplicate name (unique constraint) is nameTaken', async () => {
    const mocks = buildMocks();
    mocks.roleCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    const result = await mocks.service.createRole(OWNER_SCOPE, { name: 'Manager', permissions: [] });

    expect(result).toEqual({ outcome: 'nameTaken' });
  });

  it('an unexpected database error is not swallowed', async () => {
    const mocks = buildMocks();
    mocks.roleCreate.mockRejectedValue(new Error('db down'));

    await expect(mocks.service.createRole(OWNER_SCOPE, { name: 'X', permissions: [] })).rejects.toThrow('db down');
  });
});

describe('StaffRolesService.updateRole', () => {
  it('looks the Role up by id AND restaurantId (Tenant isolation); unknown/foreign -> notFound', async () => {
    const mocks = buildMocks();

    const result = await mocks.service.updateRole(OWNER_SCOPE, 'role-x', { name: 'New' });

    expect(mocks.roleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'role-x', restaurantId: RESTAURANT_ID } }),
    );
    expect(result).toEqual({ outcome: 'notFound' });
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });

  it('the Owner Role is protected: never renamed or edited', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('OWNER'));

    const result = await mocks.service.updateRole(OWNER_SCOPE, 'role-owner', { permissions: [] });

    expect(result).toEqual({ outcome: 'protected' });
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });

  it('renames a Role (name and normalized name together)', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('CUSTOM'));

    const result = await mocks.service.updateRole(OWNER_SCOPE, 'role-custom', { name: ' Head Barista ' });

    expect(mocks.roleUpdate).toHaveBeenCalledWith({
      where: { id: 'role-custom' },
      data: { name: 'Head Barista', nameNormalized: 'head barista' },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({ outcome: 'ok', data: { name: 'Head Barista' } });
  });

  it('updates permissions without touching the name', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('CUSTOM'));

    await mocks.service.updateRole(OWNER_SCOPE, 'role-custom', { permissions: ['orders.view', 'orders.accept'] });

    expect(mocks.roleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { permissions: ['orders.view', 'orders.accept'] } }),
    );
  });

  it('may always REMOVE permissions, but only ADD ones the editor holds', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('CUSTOM', { permissions: ['orders.view', 'integrations.manage'] }));
    const editor = { restaurantId: RESTAURANT_ID, granterPermissions: ['roles.manage', 'orders.view', 'menu.view'] };

    const removing = await mocks.service.updateRole(editor, 'role-custom', { permissions: ['orders.view'] });
    expect(removing.outcome).toBe('ok');

    const addingHeld = await mocks.service.updateRole(editor, 'role-custom', {
      permissions: ['orders.view', 'integrations.manage', 'menu.view'],
    });
    expect(addingHeld.outcome).toBe('ok');

    mocks.roleUpdate.mockClear();
    const addingNotHeld = await mocks.service.updateRole(editor, 'role-custom', {
      permissions: ['orders.view', 'users.manage'],
    });
    expect(addingNotHeld).toEqual({ outcome: 'exceedsAuthority' });
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });

  it('renaming onto an existing name is nameTaken', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('CUSTOM'));
    mocks.roleUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    const result = await mocks.service.updateRole(OWNER_SCOPE, 'role-custom', { name: 'Manager' });

    expect(result).toEqual({ outcome: 'nameTaken' });
  });

  it('a starter Role other than Owner (Manager) can be edited', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow('MANAGER'));

    const result = await mocks.service.updateRole(OWNER_SCOPE, 'role-manager', { permissions: ['orders.view'] });

    expect(result.outcome).toBe('ok');
  });
});

describe('StaffRolesService.deleteRole', () => {
  it('unknown or other-Restaurant Role -> notFound (looked up by id AND restaurantId)', async () => {
    const mocks = buildMocks();

    const result = await mocks.service.deleteRole(RESTAURANT_ID, 'role-x');

    expect(mocks.roleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'role-x', restaurantId: RESTAURANT_ID } }),
    );
    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('the Owner Role can never be deleted', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue({ id: 'role-owner', kind: 'OWNER' });

    const result = await mocks.service.deleteRole(RESTAURANT_ID, 'role-owner');

    expect(result).toEqual({ outcome: 'protected' });
    expect(mocks.roleDelete).not.toHaveBeenCalled();
  });

  it('a Role still held by Memberships is ROLE_IN_USE: nothing is deleted and no membership is touched', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue({ id: 'role-custom', kind: 'CUSTOM' });
    mocks.membershipCount.mockResolvedValue(2);

    const result = await mocks.service.deleteRole(RESTAURANT_ID, 'role-custom');

    expect(result).toEqual({ outcome: 'inUse', memberCount: 2 });
    expect(mocks.membershipCount).toHaveBeenCalledWith({ where: { restaurantId: RESTAURANT_ID, roleId: 'role-custom' } });
    expect(mocks.roleDelete).not.toHaveBeenCalled();
  });

  it('an unused Role is deleted', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue({ id: 'role-custom', kind: 'CUSTOM' });

    const result = await mocks.service.deleteRole(RESTAURANT_ID, 'role-custom');

    expect(result).toEqual({ outcome: 'deleted' });
    expect(mocks.roleDelete).toHaveBeenCalledWith({ where: { id: 'role-custom' } });
  });

  it('a starter Role other than Owner (e.g. Waiter) can be deleted when unused', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue({ id: 'role-waiter', kind: 'WAITER' });

    expect(await mocks.service.deleteRole(RESTAURANT_ID, 'role-waiter')).toEqual({ outcome: 'deleted' });
  });

  it('if a Membership is assigned between the count and the delete, the FK Restrict turns it into inUse (never data loss)', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue({ id: 'role-custom', kind: 'CUSTOM' });
    mocks.roleDelete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );

    const result = await mocks.service.deleteRole(RESTAURANT_ID, 'role-custom');

    expect(result.outcome).toBe('inUse');
  });
});

describe('StaffRolesController', () => {
  function request(overrides: Partial<RestaurantAuthorizedRequest['restaurantAccess']> = {}) {
    return {
      params: { restaurantId: 'attacker-value' },
      restaurantAccess: {
        restaurantId: 'authorized-restaurant',
        permissions: ['roles.manage', 'orders.view'],
        ...overrides,
      },
    } as unknown as RestaurantAuthorizedRequest;
  }

  /* eslint-disable @typescript-eslint/unbound-method */
  const proto = StaffRolesController.prototype;
  /* eslint-enable @typescript-eslint/unbound-method */

  it('GET is read-only (no CSRF) and needs users.view', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.listRoles)).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, proto.listRoles)).toBe(PERMISSIONS.USERS_VIEW);
  });

  it.each([['createRole'], ['updateRole'], ['deleteRole']] as const)(
    '%s is CSRF-protected and needs roles.manage',
    (method) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
      ]);
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, proto[method])).toBe(PERMISSIONS.ROLES_MANAGE);
    },
  );

  it('uses the authorized restaurantId and the caller permissions, never the route param', async () => {
    const service = {
      listRoles: jest.fn().mockResolvedValue([]),
      createRole: jest.fn().mockResolvedValue({ outcome: 'ok', data: { id: 'r' } }),
    };
    const controller = new StaffRolesController(service as never);

    await controller.listRoles(request());
    await controller.createRole({ name: 'Barista', permissions: ['orders.view'] }, request());

    expect(service.listRoles).toHaveBeenCalledWith('authorized-restaurant');
    expect(service.createRole).toHaveBeenCalledWith(
      { restaurantId: 'authorized-restaurant', granterPermissions: ['roles.manage', 'orders.view'] },
      { name: 'Barista', permissions: ['orders.view'] },
    );
  });

  it.each([
    ['notFound', NotFoundException, 'ROLE_NOT_FOUND'],
    ['protected', ForbiddenException, 'ROLE_PROTECTED'],
    ['nameTaken', ConflictException, 'ROLE_NAME_TAKEN'],
    ['exceedsAuthority', ForbiddenException, 'ROLE_EXCEEDS_AUTHORITY'],
  ] as const)('maps %s -> %s (%s)', async (outcome, ExceptionClass, code) => {
    const controller = new StaffRolesController({ updateRole: jest.fn().mockResolvedValue({ outcome }) } as never);

    await expect(controller.updateRole('role-1', {}, request())).rejects.toBeInstanceOf(ExceptionClass);
    await expect(controller.updateRole('role-1', {}, request())).rejects.toMatchObject({
      response: { error: { code } },
    });
  });

  it('delete: notFound / protected / inUse (with the member count) / success', async () => {
    const service = { deleteRole: jest.fn() };
    const controller = new StaffRolesController(service as never);

    service.deleteRole.mockResolvedValueOnce({ outcome: 'notFound' });
    await expect(controller.deleteRole('r', request())).rejects.toBeInstanceOf(NotFoundException);

    service.deleteRole.mockResolvedValueOnce({ outcome: 'protected' });
    await expect(controller.deleteRole('r', request())).rejects.toMatchObject({
      response: { error: { code: 'ROLE_PROTECTED' } },
    });

    service.deleteRole.mockResolvedValueOnce({ outcome: 'inUse', memberCount: 4 });
    await expect(controller.deleteRole('r', request())).rejects.toMatchObject({
      response: { error: { code: 'ROLE_IN_USE', details: { memberCount: 4 } } },
    });

    service.deleteRole.mockResolvedValueOnce({ outcome: 'deleted' });
    await expect(controller.deleteRole('r', request())).resolves.toBeUndefined();
    expect(service.deleteRole).toHaveBeenLastCalledWith('authorized-restaurant', 'r');
  });
});
