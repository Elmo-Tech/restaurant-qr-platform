import { AuthContextService } from './auth-context.service';

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

describe('AuthContextService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AuthContextService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    prisma.user.findUnique.mockResolvedValue(USER);
    prisma.restaurantMembership.findMany.mockResolvedValue([]);
    prisma.branch.findMany.mockResolvedValue([]);
    prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

    service = new AuthContextService(prisma as never);
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
});
