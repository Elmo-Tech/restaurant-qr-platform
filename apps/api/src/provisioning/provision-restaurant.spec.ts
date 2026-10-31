import { Prisma } from '../generated/prisma/client';
import {
  provisionRestaurant,
  validateProvisionInput,
  type ProvisionRestaurantInput,
} from './provision-restaurant';

const INPUT: ProvisionRestaurantInput = {
  restaurantName: '  Elmo Bistro ',
  ownerEmail: '  Owner@Example.COM ',
  ownerPassword: 'a-strong-password-1',
  branchName: 'Main Branch',
  defaultLocale: 'ar',
  currencyCode: 'egp',
  timezone: 'Africa/Cairo',
};

function build(options: { existingUser?: { id: string } | null; owned?: unknown } = {}) {
  const calls: string[] = [];
  const tx = {
    user: {
      findUnique: jest.fn().mockResolvedValue(options.existingUser ?? null),
      create: jest.fn().mockImplementation(() => {
        calls.push('user');
        return Promise.resolve({ id: 'user-1' });
      }),
    },
    restaurantRole: {
      create: jest.fn().mockImplementation((args: { data: { kind: string } }) => {
        calls.push('role');
        return Promise.resolve({ id: `role-${args.data.kind.toLowerCase()}` });
      }),
    },
    restaurantMembership: {
      findFirst: jest.fn().mockResolvedValue(options.owned ?? null),
      create: jest.fn().mockImplementation(() => {
        calls.push('membership');
        return Promise.resolve({});
      }),
    },
    restaurant: {
      create: jest.fn().mockImplementation(() => {
        calls.push('restaurant');
        return Promise.resolve({ id: 'restaurant-1', publicId: 'restaurant-public-1' });
      }),
    },
    restaurantSetup: {
      create: jest.fn().mockImplementation(() => {
        calls.push('setup');
        return Promise.resolve({});
      }),
    },
    restaurantLocale: {
      createMany: jest.fn().mockImplementation(() => {
        calls.push('locales');
        return Promise.resolve({});
      }),
    },
    branch: {
      create: jest.fn().mockImplementation(() => {
        calls.push('branch');
        return Promise.resolve({ id: 'branch-1', name: 'Main Branch' });
      }),
    },
    qrCode: {
      create: jest.fn().mockImplementation(() => {
        calls.push('qr');
        return Promise.resolve({ publicCode: 'GENERIC-CODE' });
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const hasher = { hashPassword: jest.fn().mockResolvedValue('HASHED') };
  return { prisma, tx, hasher, calls };
}

describe('validateProvisionInput', () => {
  it('normalizes names, e-mail, currency and locale', () => {
    const result = validateProvisionInput(INPUT);

    expect(result).toMatchObject({
      ok: true,
      value: {
        restaurantName: 'Elmo Bistro',
        ownerEmail: 'owner@example.com',
        currencyCode: 'EGP',
        defaultLocale: 'ar',
      },
    });
  });

  it.each([
    ['bad e-mail', { ownerEmail: 'not-an-email' }],
    ['unsupported locale', { defaultLocale: 'fr' }],
    ['bad currency', { currencyCode: 'EG' }],
    ['bad timezone', { timezone: 'Mars/Base' }],
    ['empty restaurant name', { restaurantName: ' ' }],
    ['empty branch name', { branchName: '' }],
    ['missing password', { ownerPassword: '' }],
  ])('rejects %s', (_label, override) => {
    const result = validateProvisionInput({ ...INPUT, ...override });

    expect(result.ok).toBe(false);
  });

  it('never echoes the password in problems', () => {
    const result = validateProvisionInput({ ...INPUT, ownerEmail: 'bad', ownerPassword: 'TOPSECRET-pw' });

    expect(JSON.stringify(result)).not.toContain('TOPSECRET');
  });
});

describe('provisionRestaurant', () => {
  it('creates Restaurant, locales, OWNER user + membership, ACTIVE Branch and Generic QR in one transaction', async () => {
    const m = build();

    const result = await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(result).toEqual({
      outcome: 'provisioned',
      restaurantPublicId: 'restaurant-public-1',
      branchName: 'Main Branch',
      ownerEmail: 'owner@example.com',
      genericQrPublicCode: 'GENERIC-CODE',
    });
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.calls).toEqual([
      'restaurant',
      'setup',
      'locales',
      'user',
      'role',
      'role',
      'role',
      'role',
      'role',
      'membership',
      'branch',
      'qr',
    ]);
    expect(m.tx.restaurant.create.mock.calls[0][0].data).toMatchObject({
      name: 'Elmo Bistro',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currencyCode: 'EGP',
    });
    expect(m.tx.restaurantLocale.createMany.mock.calls[0][0].data).toEqual([
      { restaurantId: 'restaurant-1', locale: 'en', isActive: true },
      { restaurantId: 'restaurant-1', locale: 'ar', isActive: true },
    ]);
    expect(m.tx.restaurantMembership.create.mock.calls[0][0].data).toEqual({
      restaurantId: 'restaurant-1',
      userId: 'user-1',
      role: 'OWNER',
      roleId: 'role-owner',
      status: 'ACTIVE',
      allBranches: true,
    });
    expect(m.tx.branch.create.mock.calls[0][0].data).toMatchObject({
      restaurantId: 'restaurant-1',
      status: 'ACTIVE',
      timezone: 'Africa/Cairo',
    });
    expect(m.tx.qrCode.create.mock.calls[0][0].data).toMatchObject({
      restaurantId: 'restaurant-1',
      branchId: null,
      tableId: null,
      type: 'GENERIC',
      status: 'ACTIVE',
    });
  });

  it('seeds the five starter Roles for the new Restaurant (Owner first), and the Owner holds the Owner Role', async () => {
    const m = build();

    await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    const created = m.tx.restaurantRole.create.mock.calls.map(
      (call: [{ data: { restaurantId: string; kind: string; name: string; permissions: string[] } }]) => call[0].data,
    );
    expect(created.map((role: { kind: string }) => role.kind)).toEqual([
      'OWNER',
      'MANAGER',
      'CASHIER',
      'KITCHEN',
      'WAITER',
    ]);
    expect(created.every((role: { restaurantId: string }) => role.restaurantId === 'restaurant-1')).toBe(true);
    expect(created[0]).toMatchObject({ name: 'Owner', permissions: expect.arrayContaining(['roles.manage', 'users.manage']) });
    expect(created[1].permissions).not.toContain('roles.manage');
  });

  it('stores only the Argon2 hash of the password, never the plaintext', async () => {
    const m = build();

    await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(m.hasher.hashPassword).toHaveBeenCalledWith('a-strong-password-1');
    const userData = m.tx.user.create.mock.calls[0][0].data;
    expect(userData.passwordHash).toBe('HASHED');
    expect(JSON.stringify(m.tx.user.create.mock.calls)).not.toContain('a-strong-password-1');
  });

  it('creates no Menu, Product or other demo data', async () => {
    const m = build();

    await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(Object.keys(m.tx).sort()).toEqual(
      [
        'branch',
        'qrCode',
        'restaurant',
        'restaurantLocale',
        'restaurantMembership',
        'restaurantRole',
        'user',
      ].sort(),
    );
  });

  it('CONFLICT: an existing user that does not own this Restaurant is never touched', async () => {
    const m = build({ existingUser: { id: 'someone-else' }, owned: null });

    const result = await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(result).toEqual({ outcome: 'conflict', reason: 'ownerEmailInUse' });
    expect(m.calls).toEqual([]);
  });

  it('IDEMPOTENT: re-running for the same owner + Restaurant name changes nothing', async () => {
    const m = build({
      existingUser: { id: 'user-1' },
      owned: { restaurant: { publicId: 'restaurant-public-1' } },
    });

    const result = await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(result).toEqual({
      outcome: 'alreadyProvisioned',
      restaurantPublicId: 'restaurant-public-1',
    });
    expect(m.calls).toEqual([]);
  });

  it('a concurrent duplicate that loses the unique race is reported as a conflict', async () => {
    const m = build();
    const race = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & { code: string };
    race.code = 'P2002';
    m.prisma.$transaction.mockRejectedValue(race);

    const result = await provisionRestaurant(m.prisma as never, m.hasher, INPUT);

    expect(result).toEqual({ outcome: 'conflict', reason: 'ownerEmailInUse' });
  });

  it('invalid input writes nothing and never opens a transaction', async () => {
    const m = build();

    const result = await provisionRestaurant(m.prisma as never, m.hasher, { ...INPUT, ownerEmail: 'nope' });

    expect(result.outcome).toBe('invalidInput');
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.hasher.hashPassword).not.toHaveBeenCalled();
  });

  it('a too-short password is rejected by the hasher policy without echoing it', async () => {
    const m = build();
    m.hasher.hashPassword.mockRejectedValue(new Error('Password must be between 8 and 128 characters'));

    const result = await provisionRestaurant(m.prisma as never, m.hasher, { ...INPUT, ownerPassword: 'short' });

    expect(result.outcome).toBe('invalidInput');
    expect(JSON.stringify(result)).not.toContain('short');
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('any other failure propagates (the transaction rolls everything back)', async () => {
    const m = build();
    const boom = new Error('db down');
    m.prisma.$transaction.mockRejectedValue(boom);

    await expect(provisionRestaurant(m.prisma as never, m.hasher, INPUT)).rejects.toBe(boom);
  });
});
