import { ALL_PERMISSIONS } from '../auth/permission/permission';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { starterRoleData } from '../auth/permission/starter-roles';
import { Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { StaffProvisioningService } from './staff-provisioning.service';

const RESTAURANT_ID = 'restaurant-1';
const GRANTER_MEMBERSHIP_ID = 'membership-granter';
const BRANCH_A = { id: 'branch-a', name: 'Maadi', status: 'ACTIVE' as const };
const BRANCH_B = { id: 'branch-b', name: 'Zamalek', status: 'ACTIVE' as const };
const ROLE_ID = 'role-cashier';

function roleRow(overrides: Partial<Record<string, unknown>> = {}) {
  const cashier = starterRoleData('CASHIER');
  return { id: ROLE_ID, name: cashier.name, kind: 'CASHIER', permissions: cashier.permissions, ...overrides };
}

const BASE_INPUT = {
  restaurantId: RESTAURANT_ID,
  granterMembershipId: GRANTER_MEMBERSHIP_ID,
  granterAllBranches: true,
  granterPermissions: ALL_PERMISSIONS,
  email: 'new.cashier@example.test',
  roleId: ROLE_ID,
  allBranches: true,
  branchIds: [] as string[],
  active: true,
  password: 'admin-entered-pass-1' as string | null,
};

interface MockOptions {
  /** Result of the pre-transaction user lookup (null = no account yet). */
  preUser?: { id: string } | null;
  /** Result of the in-transaction user lookup. */
  txUser?: { id: string; status: string } | null;
  existingMembership?: { id: string } | null;
  branches?: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' }[];
  role?: ReturnType<typeof roleRow> | null;
}

function buildMocks(options: MockOptions = {}) {
  const preUser = options.preUser === undefined ? null : options.preUser;
  const txUser = options.txUser === undefined ? null : options.txUser;

  const userFindUnique = jest.fn();
  // 1st call = pre-transaction lookup, every later call = inside the transaction.
  userFindUnique.mockResolvedValueOnce(preUser).mockResolvedValue(txUser);
  const userCreate = jest.fn().mockResolvedValue({ id: 'user-new' });
  const userUpdate = jest.fn();
  const membershipFindFirst = jest.fn().mockResolvedValue(options.existingMembership ?? null);
  const membershipCreate = jest.fn().mockResolvedValue({ id: 'membership-new' });
  const membershipBranchCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const membershipBranchFindMany = jest.fn().mockResolvedValue([]);
  const branchFindMany = jest.fn().mockResolvedValue(options.branches ?? [BRANCH_A, BRANCH_B]);
  const roleFindFirst = jest.fn().mockResolvedValue(options.role === undefined ? roleRow() : options.role);

  const prisma: Record<string, unknown> = {
    user: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
    restaurantMembership: { findFirst: membershipFindFirst, create: membershipCreate },
    restaurantMembershipBranch: {
      createMany: membershipBranchCreateMany,
      findMany: membershipBranchFindMany,
    },
    branch: { findMany: branchFindMany },
    restaurantRole: { findFirst: roleFindFirst },
  };
  const transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(prisma));
  prisma.$transaction = transaction;

  const hasher = {
    hashPassword: jest.fn((password: string) => Promise.resolve(`hash-of:${password}`)),
  };

  return {
    prisma,
    hasher,
    transaction,
    userFindUnique,
    userCreate,
    userUpdate,
    membershipFindFirst,
    membershipCreate,
    membershipBranchCreateMany,
    membershipBranchFindMany,
    branchFindMany,
    roleFindFirst,
  };
}

function buildService(mocks: ReturnType<typeof buildMocks>): StaffProvisioningService {
  return new StaffProvisioningService(mocks.prisma as never, mocks.hasher as never);
}

describe('StaffProvisioningService.createUser -- brand-new account', () => {
  it('creates the User with the admin-entered password (hashed) and the Membership -- no first-login flag', async () => {
    const mocks = buildMocks();

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result).toMatchObject({ outcome: 'created', accountCreated: true });
    expect(mocks.hasher.hashPassword).toHaveBeenCalledWith('admin-entered-pass-1');
    const createArgs = mocks.userCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data).toEqual({
      email: 'new.cashier@example.test',
      emailNormalized: 'new.cashier@example.test',
      passwordHash: 'hash-of:admin-entered-pass-1',
      status: 'ACTIVE',
      preferredLocale: null,
    });
    expect(mocks.membershipCreate).toHaveBeenCalledWith({
      data: {
        restaurantId: RESTAURANT_ID,
        userId: 'user-new',
        role: 'CASHIER',
        roleId: ROLE_ID,
        allBranches: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('stores only an Argon2id hash that verifies with the entered password (so the user can log in with it)', async () => {
    const mocks = buildMocks();
    const realHasher = new PasswordHasherService();
    const service = new StaffProvisioningService(mocks.prisma as never, realHasher);

    await service.createUser({ ...BASE_INPUT, password: 'my-real-password-42' });

    const stored = (mocks.userCreate.mock.calls[0][0] as { data: { passwordHash: string } }).data.passwordHash;
    expect(stored).not.toContain('my-real-password-42');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    await expect(realHasher.verifyPassword('my-real-password-42', stored)).resolves.toBe(true);
    await expect(realHasher.verifyPassword('another-password-42', stored)).resolves.toBe(false);
  });

  it('never persists or returns the raw password anywhere', async () => {
    const mocks = buildMocks();

    const result = await buildService(mocks).createUser(BASE_INPUT);

    const persisted = JSON.stringify([
      mocks.userCreate.mock.calls,
      mocks.membershipCreate.mock.calls,
      mocks.membershipBranchCreateMany.mock.calls,
    ]);
    expect(persisted).not.toContain('"admin-entered-pass-1"');
    expect(persisted).toContain('hash-of:');
    expect(JSON.stringify(result)).not.toContain('admin-entered-pass-1');
  });

  it('a brand-new account needs a password: without one nothing is created and Argon2id never runs', async () => {
    const mocks = buildMocks();

    const result = await buildService(mocks).createUser({ ...BASE_INPUT, password: null });

    expect(result).toEqual({ outcome: 'passwordRequired' });
    expect(mocks.hasher.hashPassword).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('hashes outside the transaction', async () => {
    const mocks = buildMocks();

    await buildService(mocks).createUser(BASE_INPUT);

    expect(mocks.hasher.hashPassword.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transaction.mock.invocationCallOrder[0],
    );
  });

  it('can create the Membership inactive', async () => {
    const mocks = buildMocks();

    const result = await buildService(mocks).createUser({ ...BASE_INPUT, active: false });

    if (result.outcome !== 'created') throw new Error('expected created');
    expect(result.data.status).toBe('DISABLED');
    expect(mocks.membershipCreate.mock.calls[0][0].data.status).toBe('DISABLED');
  });

  it('assigns the exact selected Branches for a Branch-scoped user and none for all-branches', async () => {
    const scoped = buildMocks({ branches: [BRANCH_A] });
    await buildService(scoped).createUser({
      ...BASE_INPUT,
      allBranches: false,
      branchIds: [BRANCH_A.id],
    });
    expect(scoped.membershipBranchCreateMany).toHaveBeenCalledWith({
      data: [{ restaurantMembershipId: 'membership-new', branchId: BRANCH_A.id }],
    });

    const all = buildMocks();
    await buildService(all).createUser(BASE_INPUT);
    expect(all.membershipBranchCreateMany).not.toHaveBeenCalled();
  });

  it('looks Branches up scoped to the authorized Restaurant (Tenant isolation)', async () => {
    const mocks = buildMocks({ branches: [BRANCH_A] });

    await buildService(mocks).createUser({
      ...BASE_INPUT,
      allBranches: false,
      branchIds: [BRANCH_A.id],
    });

    expect(mocks.branchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [BRANCH_A.id] }, restaurantId: RESTAURANT_ID },
      }),
    );
  });

  it('returns branchNotFound for a Branch outside this Restaurant and creates nothing', async () => {
    const mocks = buildMocks({ branches: [] });

    const result = await buildService(mocks).createUser({
      ...BASE_INPUT,
      allBranches: false,
      branchIds: ['foreign-branch'],
    });

    expect(result).toEqual({ outcome: 'branchNotFound' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('refuses a Branch-scoped granter creating an all-branches user (scope exceeds authority)', async () => {
    const mocks = buildMocks();

    const result = await buildService(mocks).createUser({ ...BASE_INPUT, granterAllBranches: false });

    expect(result).toEqual({ outcome: 'scopeExceedsAuthority' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('retries once on a serialization conflict and then succeeds', async () => {
    const mocks = buildMocks();
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    (mocks.transaction as jest.Mock).mockRejectedValueOnce(conflict);

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result.outcome).toBe('created');
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('StaffProvisioningService.createUser -- email already has an account', () => {
  const EXISTING = { preUser: { id: 'user-existing' }, txUser: { id: 'user-existing', status: 'ACTIVE' } };

  it('attaches only the Membership: never hashes, creates or updates any User, and ignores a submitted password', async () => {
    const mocks = buildMocks(EXISTING);

    const result = await buildService(mocks).createUser({
      ...BASE_INPUT,
      password: 'attacker-chosen-pass-1',
    });

    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') return;
    expect(result.accountCreated).toBe(false);
    expect(JSON.stringify(result)).not.toContain('attacker-chosen-pass-1');
    expect(mocks.hasher.hashPassword).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.membershipCreate.mock.calls[0][0].data).toMatchObject({
      restaurantId: RESTAURANT_ID,
      userId: 'user-existing',
      role: 'CASHIER',
      roleId: ROLE_ID,
    });
  });

  it('never exposes anything about the existing account beyond its email in the Membership', async () => {
    const result = await buildService(buildMocks(EXISTING)).createUser(BASE_INPUT);

    if (result.outcome !== 'created') throw new Error('expected created');
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|password"|status":"ACTIVE","preferred/);
    expect(Object.keys(result.data.user).sort()).toEqual(['email', 'id']);
  });

  it('is a conflict when this Restaurant already has a Membership for it (any status)', async () => {
    const mocks = buildMocks({ ...EXISTING, existingMembership: { id: 'membership-old' } });

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result).toEqual({ outcome: 'conflict' });
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('looks the existing Membership up scoped to this Restaurant (Tenant isolation)', async () => {
    const mocks = buildMocks(EXISTING);

    await buildService(mocks).createUser(BASE_INPUT);

    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID, userId: 'user-existing' },
      select: { id: true },
    });
  });

  it('is the same generic conflict for an account that is not ACTIVE', async () => {
    const mocks = buildMocks({ preUser: { id: 'user-existing' }, txUser: { id: 'user-existing', status: 'DISABLED' } });

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result).toEqual({ outcome: 'conflict' });
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('after losing a creation race it re-reads the account and attaches without touching its password', async () => {
    // Pre-read: no account. In the transaction the account now exists.
    const mocks = buildMocks({ preUser: null, txUser: { id: 'user-raced', status: 'ACTIVE' } });

    const result = await buildService(mocks).createUser(BASE_INPUT);

    if (result.outcome !== 'created') throw new Error('expected created');
    expect(result.accountCreated).toBe(false);
    expect(JSON.stringify(result)).not.toContain('attacker-chosen-pass-1');
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });
});

describe('StaffProvisioningService.createUser -- Role assignment (FT-12C)', () => {
  it('looks the Role up by id AND the authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();

    await buildService(mocks).createUser(BASE_INPUT);

    expect(mocks.roleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ROLE_ID, restaurantId: RESTAURANT_ID } }),
    );
  });

  it('a Role of another Restaurant (or unknown) is roleNotFound and creates no account or Membership', async () => {
    const mocks = buildMocks({ role: null });

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result).toEqual({ outcome: 'roleNotFound' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('never creates a user with the protected Owner Role', async () => {
    const mocks = buildMocks({ role: roleRow({ kind: 'OWNER', permissions: [...ALL_PERMISSIONS] }) });

    const result = await buildService(mocks).createUser(BASE_INPUT);

    expect(result).toEqual({ outcome: 'roleNotAssignable' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('refuses a Role granting more than the creator holds (no privilege escalation)', async () => {
    const mocks = buildMocks({ role: roleRow({ kind: 'CUSTOM', permissions: ['orders.view', 'restaurant.manage'] }) });

    const result = await buildService(mocks).createUser({
      ...BASE_INPUT,
      granterPermissions: ['orders.view', 'users.manage'],
    });

    expect(result).toEqual({ outcome: 'roleExceedsAuthority' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it('assigns a custom Role: Membership gets roleId and the CUSTOM kind, and the role name is returned', async () => {
    const mocks = buildMocks({
      role: roleRow({ id: 'role-barista', name: 'Barista', kind: 'CUSTOM', permissions: ['orders.view'] }),
    });

    const result = await buildService(mocks).createUser({ ...BASE_INPUT, roleId: 'role-barista' });

    expect(mocks.membershipCreate.mock.calls[0][0].data).toMatchObject({ role: 'CUSTOM', roleId: 'role-barista' });
    expect(result).toMatchObject({
      outcome: 'created',
      data: { role: 'CUSTOM', roleId: 'role-barista', roleName: 'Barista' },
    });
  });
});

describe('StaffProvisioningService.createUser -- the raw password is never logged', () => {
  it('writes nothing containing the password to console or the Nest Logger', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    const loggerSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((method) =>
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
    );

    const result = await buildService(buildMocks()).createUser(BASE_INPUT);
    if (result.outcome !== 'created') throw new Error('expected created');

    const written = [...spies, ...loggerSpies].flatMap((spy) => spy.mock.calls).map((call) => JSON.stringify(call));
    expect(written.filter((line) => line.includes(String(BASE_INPUT.password)))).toEqual([]);

    [...spies, ...loggerSpies].forEach((spy) => spy.mockRestore());
  });
});
