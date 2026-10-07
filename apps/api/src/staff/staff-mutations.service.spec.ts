import { ALL_PERMISSIONS } from '../auth/permission/permission';
import { starterRoleData } from '../auth/permission/starter-roles';
import { StaffService } from './staff.service';

const RESTAURANT_ID = 'restaurant-1';
const FOREIGN_RESTAURANT_ID = 'restaurant-2';
const GRANTER_MEMBERSHIP_ID = 'membership-granter';
const TARGET_MEMBERSHIP_ID = 'membership-target';
const BRANCH_ID = 'branch-1';
const ROLE_ID = 'role-manager';

function roleRow(overrides: Partial<Record<string, unknown>> = {}) {
  const manager = starterRoleData('MANAGER');
  return { id: ROLE_ID, name: manager.name, kind: 'MANAGER', permissions: manager.permissions, ...overrides };
}

function targetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TARGET_MEMBERSHIP_ID,
    role: 'MANAGER',
    status: 'ACTIVE',
    allBranches: true,
    restaurantRole: { id: 'role-target', name: 'Manager' },
    user: { id: 'user-target', email: 'target@example.test' },
    ...overrides,
  };
}

function buildMocks() {
  const membershipFindFirst = jest.fn().mockResolvedValue(targetRow());
  const membershipCount = jest.fn().mockResolvedValue(1); // "at least one other active OWNER" by default
  const membershipUpdate = jest.fn().mockResolvedValue({});
  const membershipBranchDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const membershipBranchCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const membershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const branchFindMany = jest.fn().mockResolvedValue([{ id: BRANCH_ID, name: 'Main', status: 'ACTIVE' }]);
  const roleFindFirst = jest.fn().mockResolvedValue(roleRow());

  const prisma: Record<string, unknown> = {
    restaurantMembership: {
      findFirst: membershipFindFirst,
      count: membershipCount,
      update: membershipUpdate,
    },
    restaurantMembershipBranch: {
      deleteMany: membershipBranchDeleteMany,
      createMany: membershipBranchCreateMany,
      findMany: membershipBranchFindMany,
    },
    branch: { findMany: branchFindMany },
    restaurantRole: { findFirst: roleFindFirst },
  };
  prisma.$transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(prisma));

  return {
    prisma,
    membershipFindFirst,
    membershipCount,
    membershipUpdate,
    membershipBranchDeleteMany,
    membershipBranchCreateMany,
    membershipBranchFindMany,
    branchFindMany,
    roleFindFirst,
  };
}

function buildService(mocks: ReturnType<typeof buildMocks>): StaffService {
  return new StaffService(mocks.prisma as never);
}

const GRANTER_SCOPE = {
  restaurantId: RESTAURANT_ID,
  granterMembershipId: GRANTER_MEMBERSHIP_ID,
  granterAllBranches: true,
  granterPermissions: ALL_PERMISSIONS,
};

describe('StaffService.updateMembership', () => {
  it('scopes the target lookup by the exact authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: { id: TARGET_MEMBERSHIP_ID, restaurantId: RESTAURANT_ID },
      select: expect.any(Object),
    });
  });

  it('returns notFound for a target in a different Restaurant (never trusts membershipId alone)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(null); // query already scoped by restaurantId, so a foreign-Restaurant id yields null
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      restaurantId: FOREIGN_RESTAURANT_ID,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result).toEqual({ outcome: 'notFound' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('returns notFound for an unknown target', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(null);
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: 'unknown',
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('rejects self-management regardless of Role (STAFF_DASHBOARD_UX_SPEC.md #167)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ id: GRANTER_MEMBERSHIP_ID, role: 'OWNER' }));
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: GRANTER_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result).toEqual({ outcome: 'selfManagementForbidden' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('rejects moving the sole active OWNER off OWNER (last-OWNER protection)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'ACTIVE' }));
    mocks.membershipCount.mockResolvedValue(0); // no OTHER active OWNER exists
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result).toEqual({ outcome: 'lastOwnerProtected' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('allows demoting an OWNER when another active OWNER exists', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'ACTIVE' }));
    mocks.membershipCount.mockResolvedValue(1); // one other active OWNER exists
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result.outcome).toBe('updated');
    expect(mocks.membershipUpdate).toHaveBeenCalledWith({
      where: { id: TARGET_MEMBERSHIP_ID },
      data: { role: 'MANAGER', roleId: ROLE_ID, allBranches: true },
    });
  });

  it('never counts a DISABLED or already-non-OWNER target against last-OWNER protection', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'DISABLED' }));
    const service = buildService(mocks);

    await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(mocks.membershipCount).not.toHaveBeenCalled();
  });

  it('rejects a Branch-scoped granter attempting to grant allBranches=true (scopeExceedsAuthority)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    const result = await service.updateMembership({
      restaurantId: RESTAURANT_ID,
      granterMembershipId: GRANTER_MEMBERSHIP_ID,
      granterAllBranches: false,
      granterPermissions: ALL_PERMISSIONS,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: true,
      branchIds: [],
    });

    expect(result).toEqual({ outcome: 'scopeExceedsAuthority' });
  });

  it('rejects an unknown/foreign Branch id (branchNotFound)', async () => {
    const mocks = buildMocks();
    mocks.branchFindMany.mockResolvedValue([]); // requested branch does not resolve
    const service = buildService(mocks);

    const result = await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: false,
      branchIds: [BRANCH_ID],
    });

    expect(result).toEqual({ outcome: 'branchNotFound' });
  });

  it('fully replaces the target Branch assignments (delete-then-create, never a diff)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.updateMembership({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      roleId: ROLE_ID,
      allBranches: false,
      branchIds: [BRANCH_ID],
    });

    expect(mocks.membershipBranchDeleteMany).toHaveBeenCalledWith({
      where: { restaurantMembershipId: TARGET_MEMBERSHIP_ID },
    });
    expect(mocks.membershipBranchCreateMany).toHaveBeenCalledWith({
      data: [{ restaurantMembershipId: TARGET_MEMBERSHIP_ID, branchId: BRANCH_ID }],
    });
  });
});

describe('StaffService.setMembershipStatus', () => {
  it('scopes the target lookup by the exact authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: { id: TARGET_MEMBERSHIP_ID, restaurantId: RESTAURANT_ID },
      select: expect.any(Object),
    });
  });

  it('returns notFound for a target in a different Restaurant', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(null);
    const service = buildService(mocks);

    const result = await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(result).toEqual({ outcome: 'notFound' });
  });

  it('rejects disabling your own Membership (self-lockout protection)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ id: GRANTER_MEMBERSHIP_ID, role: 'OWNER' }));
    const service = buildService(mocks);

    const result = await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: GRANTER_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(result).toEqual({ outcome: 'selfManagementForbidden' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('rejects disabling the sole active OWNER (last-OWNER protection)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'ACTIVE' }));
    mocks.membershipCount.mockResolvedValue(0);
    const service = buildService(mocks);

    const result = await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(result).toEqual({ outcome: 'lastOwnerProtected' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('allows disabling an OWNER when another active OWNER exists', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'ACTIVE' }));
    mocks.membershipCount.mockResolvedValue(1);
    const service = buildService(mocks);

    const result = await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(result.outcome).toBe('updated');
    expect(mocks.membershipUpdate).toHaveBeenCalledWith({
      where: { id: TARGET_MEMBERSHIP_ID },
      data: { status: 'DISABLED' },
    });
  });

  it('never applies last-OWNER protection when enabling (status: ACTIVE)', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'OWNER', status: 'DISABLED' }));
    const service = buildService(mocks);

    const result = await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'ACTIVE',
    });

    expect(mocks.membershipCount).not.toHaveBeenCalled();
    expect(result.outcome).toBe('updated');
  });

  it('disabling a MANAGER never triggers the last-OWNER count query', async () => {
    const mocks = buildMocks();
    mocks.membershipFindFirst.mockResolvedValue(targetRow({ role: 'MANAGER', status: 'ACTIVE' }));
    const service = buildService(mocks);

    await service.setMembershipStatus({
      ...GRANTER_SCOPE,
      targetMembershipId: TARGET_MEMBERSHIP_ID,
      status: 'DISABLED',
    });

    expect(mocks.membershipCount).not.toHaveBeenCalled();
  });
});

describe('StaffService.updateMembership -- Role assignment (FT-12C)', () => {
  const INPUT = {
    ...GRANTER_SCOPE,
    targetMembershipId: TARGET_MEMBERSHIP_ID,
    roleId: ROLE_ID,
    allBranches: true,
    branchIds: [] as string[],
  };

  it('looks the Role up by id AND the authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();

    await buildService(mocks).updateMembership(INPUT);

    expect(mocks.roleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ROLE_ID, restaurantId: RESTAURANT_ID } }),
    );
  });

  it('a Role of another Restaurant (or unknown) is roleNotFound and nothing is written', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(null);

    const result = await buildService(mocks).updateMembership(INPUT);

    expect(result).toEqual({ outcome: 'roleNotFound' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('never assigns the protected Owner Role', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow({ kind: 'OWNER', permissions: [...ALL_PERMISSIONS] }));

    const result = await buildService(mocks).updateMembership(INPUT);

    expect(result).toEqual({ outcome: 'roleNotAssignable' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('refuses a Role that grants more than the granter holds (no privilege escalation)', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(roleRow({ kind: 'CUSTOM', permissions: ['orders.view', 'integrations.manage'] }));

    const result = await buildService(mocks).updateMembership({
      ...INPUT,
      granterPermissions: ['orders.view', 'users.manage'],
    });

    expect(result).toEqual({ outcome: 'roleExceedsAuthority' });
    expect(mocks.membershipUpdate).not.toHaveBeenCalled();
  });

  it('assigns a custom Role: writes roleId and the CUSTOM kind label, and returns the role name', async () => {
    const mocks = buildMocks();
    mocks.roleFindFirst.mockResolvedValue(
      roleRow({ id: 'role-barista', name: 'Barista', kind: 'CUSTOM', permissions: ['orders.view'] }),
    );

    const result = await buildService(mocks).updateMembership({
      ...INPUT,
      roleId: 'role-barista',
      granterPermissions: ['orders.view', 'users.manage'],
    });

    expect(mocks.membershipUpdate).toHaveBeenCalledWith({
      where: { id: TARGET_MEMBERSHIP_ID },
      data: { role: 'CUSTOM', roleId: 'role-barista', allBranches: true },
    });
    expect(result).toMatchObject({
      outcome: 'updated',
      data: { role: 'CUSTOM', roleId: 'role-barista', roleName: 'Barista' },
    });
  });
});
