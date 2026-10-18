import { AuthContextService } from './auth-context.service';
import { ALL_PERMISSIONS } from '../permission/permission';
import { ROLE_PERMISSIONS, type StarterRoleKind } from '../permission/role-permissions';
import { starterRoleData } from '../permission/starter-roles';
import { ALL_FEATURES } from '../../entitlements/features';

/** The Restaurant Role row a Membership of this starter kind holds (FT-12C). */
function roleOf(kind: string) {
  const starter = starterRoleData(kind as StarterRoleKind);
  return { id: `role-${kind.toLowerCase()}`, name: starter.name, kind, permissions: starter.permissions };
}

const sorted = (values: readonly string[]) => [...values].sort();

/**
 * Isolates the one unavoidable `any`-erasure point (a bare `jest.fn()`'s
 * `.mock.calls` is untyped) behind a single typed helper, rather than
 * repeating an inline cast at every call site.
 */
function firstCallArgs(mockFn: jest.Mock): Record<string, unknown> {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0][0] as Record<string, unknown>;
}

function buildPrismaMock() {
  return {
    user: { findUnique: jest.fn() },
    restaurantMembership: { findMany: jest.fn() },
    branch: { findMany: jest.fn() },
    restaurantMembershipBranch: { findMany: jest.fn() },
  };
}

const USER = {
  id: 'user-1',
  email: 'owner@example.com',
  preferredLocale: 'ar',
};

/** Every feature allowed (DEC-043): the default for a Restaurant without overrides. */
const ENTITLEMENTS = {
  forRestaurants: (ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, ALL_FEATURES]))),
};

describe('AuthContextService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AuthContextService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    prisma.user.findUnique.mockResolvedValue(USER);
    prisma.restaurantMembership.findMany.mockResolvedValue([]);
    prisma.branch.findMany.mockResolvedValue([]);
    prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

    service = new AuthContextService(prisma as never, ENTITLEMENTS as never);
  });

  describe('User identity', () => {
    it('sources the User row by the exact given userId', async () => {
      await service.getAuthContext('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, email: true, preferredLocale: true },
      });
    });

    it('returns only safe User fields', async () => {
      const context = await service.getAuthContext('user-1');

      expect(context.user).toEqual({
        id: 'user-1',
        email: 'owner@example.com',
        preferredLocale: 'ar',
      });
    });

    it('throws (does not silently 401) when the User row is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getAuthContext('ghost-user')).rejects.toThrow();
    });
  });

  describe('Membership filtering', () => {
    it('queries only ACTIVE memberships for the given userId, ordered by id', async () => {
      await service.getAuthContext('user-1');

      expect(prisma.restaurantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        }),
      );
    });

    it('returns an empty memberships array for a User with zero ACTIVE memberships', async () => {
      const context = await service.getAuthContext('user-1');

      expect(context.memberships).toEqual([]);
    });
  });

  describe('Restaurant status is separate from Membership authorization', () => {
    it.each(['ACTIVE', 'INACTIVE', 'SUSPENDED'])(
      'keeps the Membership and reports restaurant.status == %s',
      async (status) => {
        prisma.restaurantMembership.findMany.mockResolvedValue([
          {
            id: 'membership-1',
            role: 'OWNER',
            restaurantRole: roleOf('OWNER'),
            allBranches: true,
            restaurant: { id: 'restaurant-1', name: 'Cairo Bites', status },
          },
        ]);

        const context = await service.getAuthContext('user-1');

        expect(context.memberships).toHaveLength(1);
        expect(context.memberships[0].restaurant.status).toBe(status);
      },
    );
  });

  describe('allBranches semantics', () => {
    it('allBranches=true returns every Restaurant Branch, ACTIVE and INACTIVE, ordered by id', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        {
          id: 'branch-1',
          name: 'Maadi',
          status: 'ACTIVE',
          restaurantId: 'restaurant-1',
        },
        {
          id: 'branch-2',
          name: 'New Cairo',
          status: 'INACTIVE',
          restaurantId: 'restaurant-1',
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: { in: ['restaurant-1'] } },
          orderBy: { id: 'asc' },
        }),
      );
      expect(prisma.restaurantMembershipBranch.findMany).not.toHaveBeenCalled();
      expect(context.memberships[0].branches).toEqual([
        { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
        { id: 'branch-2', name: 'New Cairo', status: 'INACTIVE' },
      ]);
    });

    it('allBranches=false returns exactly the assigned Branches, ordered by branch id', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'KITCHEN',
          restaurantRole: roleOf('KITCHEN'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([
        {
          restaurantMembershipId: 'membership-1',
          branch: { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(prisma.restaurantMembershipBranch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              {
                restaurantMembershipId: 'membership-1',
                branch: { restaurantId: 'restaurant-1' },
              },
            ],
          },
          orderBy: { branch: { id: 'asc' } },
        }),
      );
      expect(prisma.branch.findMany).not.toHaveBeenCalled();
      expect(context.memberships[0].branches).toEqual([
        { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
      ]);
    });

    it('allBranches=false with zero assignment rows returns branches: []', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'WAITER',
          restaurantRole: roleOf('WAITER'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].branches).toEqual([]);
    });

    it('does not interpret empty assignment as all Branches (zero-fetch call still made)', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'WAITER',
          restaurantRole: roleOf('WAITER'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

      await service.getAuthContext('user-1');

      expect(prisma.branch.findMany).not.toHaveBeenCalled();
    });

    it('scopes the restricted-Branch query by BOTH restaurantMembershipId AND the Membership Restaurant identity, excluding a malformed cross-Restaurant assignment', async () => {
      // Membership A belongs to Restaurant A. A malformed
      // RestaurantMembershipBranch row conceptually points Membership A at
      // Branch B, which belongs to a *different* Restaurant (B). A
      // correctly Tenant-scoped query can never return that row from real
      // PostgreSQL, so the mock reflects the only result a real database
      // would produce: none.
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-a',
          role: 'WAITER',
          restaurantRole: roleOf('WAITER'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-a',
            name: 'Restaurant A',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

      const context = await service.getAuthContext('user-1');

      // The invariant is enforced in the query itself: the where clause
      // pairs membership-a with restaurant-a's id, never restaurant-b's --
      // restaurantMembershipId alone is never trusted as sufficient scope.
      expect(prisma.restaurantMembershipBranch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              {
                restaurantMembershipId: 'membership-a',
                branch: { restaurantId: 'restaurant-a' },
              },
            ],
          },
        }),
      );
      // The malformed cross-Restaurant assignment never becomes authorized
      // context: Membership A remains present, but Branch B is not, and no
      // allBranches-style fallback occurs.
      expect(context.memberships).toHaveLength(1);
      expect(context.memberships[0].branches).toEqual([]);
    });

    it('all authorized Branches INACTIVE: Membership and Branches both remain present', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        {
          id: 'branch-1',
          name: 'Maadi',
          status: 'INACTIVE',
          restaurantId: 'restaurant-1',
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships).toHaveLength(1);
      expect(context.memberships[0].branches).toEqual([
        { id: 'branch-1', name: 'Maadi', status: 'INACTIVE' },
      ]);
    });
  });

  describe('multiple Restaurant memberships', () => {
    it('returns every membership, each with its own correctly-scoped branches', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
        {
          id: 'membership-2',
          role: 'WAITER',
          restaurantRole: roleOf('WAITER'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-2',
            name: 'Alex Grill',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        {
          id: 'branch-1',
          name: 'Maadi',
          status: 'ACTIVE',
          restaurantId: 'restaurant-1',
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([
        {
          restaurantMembershipId: 'membership-2',
          branch: { id: 'branch-2', name: 'Corniche', status: 'ACTIVE' },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships).toHaveLength(2);
      expect(context.memberships[0]).toMatchObject({
        id: 'membership-1',
        restaurant: { id: 'restaurant-1' },
        branches: [{ id: 'branch-1', name: 'Maadi', status: 'ACTIVE' }],
      });
      expect(context.memberships[1]).toMatchObject({
        id: 'membership-2',
        restaurant: { id: 'restaurant-2' },
        branches: [{ id: 'branch-2', name: 'Corniche', status: 'ACTIVE' }],
      });
    });

    it('never mixes Branches from one Restaurant into another Restaurant membership', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
        {
          id: 'membership-2',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-2',
            name: 'Alex Grill',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        {
          id: 'branch-1',
          name: 'Maadi',
          status: 'ACTIVE',
          restaurantId: 'restaurant-1',
        },
        {
          id: 'branch-2',
          name: 'Corniche',
          status: 'ACTIVE',
          restaurantId: 'restaurant-2',
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].branches).toEqual([
        { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
      ]);
      expect(context.memberships[1].branches).toEqual([
        { id: 'branch-2', name: 'Corniche', status: 'ACTIVE' },
      ]);
    });
  });

  describe('safety', () => {
    it('never selects passwordHash from User', async () => {
      await service.getAuthContext('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, email: true, preferredLocale: true },
      });
    });

    it('the resulting context never contains passwordHash or tokenHash', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.branch.findMany.mockResolvedValue([
        {
          id: 'branch-1',
          name: 'Maadi',
          status: 'ACTIVE',
          restaurantId: 'restaurant-1',
        },
      ]);

      const context = await service.getAuthContext('user-1');

      const serialized = JSON.stringify(context);
      expect(serialized).not.toMatch(/passwordHash/i);
      expect(serialized).not.toMatch(/tokenHash/i);
    });
  });

  describe('Restaurant safe fields (Batch G0)', () => {
    it('restaurant includes currencyCode and defaultLocale', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
            currencyCode: 'EGP',
            defaultLocale: 'ar',
          },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].restaurant).toMatchObject({
        currencyCode: 'EGP',
        defaultLocale: 'ar',
      });
    });

    it('currencyCode/defaultLocale remain present regardless of Restaurant operational status', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'SUSPENDED',
            currencyCode: 'EGP',
            defaultLocale: 'ar',
          },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].restaurant).toMatchObject({
        status: 'SUSPENDED',
        currencyCode: 'EGP',
        defaultLocale: 'ar',
      });
    });

    it('selects currencyCode/defaultLocale from the Restaurant relation (no second query)', async () => {
      await service.getAuthContext('user-1');

      const callArgs = firstCallArgs(prisma.restaurantMembership.findMany) as {
        select: { restaurant: { select: Record<string, unknown> } };
      };

      expect(callArgs.select.restaurant.select).toMatchObject({
        currencyCode: true,
        defaultLocale: true,
      });
    });

    it('FT-12: exposes logoAssetPath (null when no logo has been uploaded)', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
            currencyCode: 'EGP',
            defaultLocale: 'ar',
            logoAssetPath: null,
          },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].restaurant.logoAssetPath).toBeNull();
    });

    it('FT-12: passes through a real logoAssetPath unchanged', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'OWNER',
          restaurantRole: roleOf('OWNER'),
          allBranches: true,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
            currencyCode: 'EGP',
            defaultLocale: 'ar',
            logoAssetPath: '/media/abc123.png',
          },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(context.memberships[0].restaurant.logoAssetPath).toBe('/media/abc123.png');
    });
  });

  describe('Effective permissions (Batch G0)', () => {
    function membershipWith(role: string) {
      return {
        id: 'membership-1',
        role,
        restaurantRole: roleOf(role),
        allBranches: true,
        restaurant: {
          id: 'restaurant-1',
          name: 'Cairo Bites',
          status: 'ACTIVE',
          currencyCode: 'EGP',
          defaultLocale: 'ar',
        },
      };
    }

    it('OWNER receives exactly the canonical OWNER effective permission set', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        membershipWith('OWNER'),
      ]);

      const context = await service.getAuthContext('user-1');

      expect(sorted(context.memberships[0].permissions)).toEqual(sorted(ALL_PERMISSIONS));
    });

    it('MANAGER receives exactly the canonical MANAGER effective permission set', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        membershipWith('MANAGER'),
      ]);

      const context = await service.getAuthContext('user-1');

      expect(sorted(context.memberships[0].permissions)).toEqual(sorted(ROLE_PERMISSIONS.MANAGER));
    });

    it('a lower role (CASHIER) never receives a MANAGER/OWNER-only permission', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        membershipWith('CASHIER'),
      ]);

      const context = await service.getAuthContext('user-1');

      expect(sorted(context.memberships[0].permissions)).toEqual(sorted(ROLE_PERMISSIONS.CASHIER));
      // Proves no accidental elevation: a Permission that MANAGER/OWNER have
      // but CASHIER canonically does not must not leak in.
      expect(context.memberships[0].permissions).not.toContain(
        'branches.manage',
      );
      expect(context.memberships[0].permissions).not.toContain('users.manage');
    });

    it('a lower role (WAITER) never receives a MANAGER/OWNER-only permission', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        membershipWith('WAITER'),
      ]);

      const context = await service.getAuthContext('user-1');

      expect(sorted(context.memberships[0].permissions)).toEqual(sorted(ROLE_PERMISSIONS.WAITER));
      expect(context.memberships[0].permissions).not.toContain('menu.manage');
      expect(context.memberships[0].permissions).not.toContain('orders.accept');
    });

    it('permissions and Branch scope both remain correct together (no regression from enrichment)', async () => {
      prisma.restaurantMembership.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          role: 'WAITER',
          restaurantRole: roleOf('WAITER'),
          allBranches: false,
          restaurant: {
            id: 'restaurant-1',
            name: 'Cairo Bites',
            status: 'ACTIVE',
            currencyCode: 'EGP',
            defaultLocale: 'ar',
          },
        },
      ]);
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([
        {
          restaurantMembershipId: 'membership-1',
          branch: { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
        },
      ]);

      const context = await service.getAuthContext('user-1');

      expect(sorted(context.memberships[0].permissions)).toEqual(sorted(ROLE_PERMISSIONS.WAITER));
      expect(context.memberships[0].branches).toEqual([
        { id: 'branch-1', name: 'Maadi', status: 'ACTIVE' },
      ]);
    });
  });
});
