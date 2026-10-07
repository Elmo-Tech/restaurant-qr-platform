import { ALL_PERMISSIONS } from '../permission/permission';
import { RestaurantAccessService } from './restaurant-access.service';

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildPrismaMock() {
  return {
    restaurantMembership: { findUnique: jest.fn() },
  };
}

function buildMembership(
  overrides: Partial<{
    id: string;
    restaurantId: string;
    role: string;
    permissions: string[];
    allBranches: boolean;
    restaurantStatus: string;
  }> = {},
) {
  return {
    id: 'membership-1',
    restaurantId: RESTAURANT_ID,
    roleId: 'role-1',
    allBranches: overrides.allBranches ?? true,
    restaurantRole: {
      kind: overrides.role ?? 'OWNER',
      permissions: overrides.permissions ?? [],
    },
    restaurant: { status: overrides.restaurantStatus ?? 'ACTIVE' },
  };
}

describe('RestaurantAccessService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: RestaurantAccessService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new RestaurantAccessService(prisma as never);
  });

  it('rejects a malformed (non-UUID) requested Restaurant identifier without querying Prisma', async () => {
    const result = await service.resolveRestaurantAccess(USER_ID, 'not-a-uuid');

    expect(result).toEqual({ outcome: 'notFound' });
    expect(prisma.restaurantMembership.findUnique).not.toHaveBeenCalled();
  });

  it('queries the compound-unique Membership scoped to ACTIVE status', async () => {
    prisma.restaurantMembership.findUnique.mockResolvedValue(buildMembership());

    await service.resolveRestaurantAccess(USER_ID, RESTAURANT_ID);

    expect(prisma.restaurantMembership.findUnique).toHaveBeenCalledWith({
      where: {
        restaurantId_userId: { restaurantId: RESTAURANT_ID, userId: USER_ID },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        restaurantId: true,
        roleId: true,
        allBranches: true,
        restaurantRole: { select: { kind: true, permissions: true } },
        restaurant: { select: { status: true } },
      },
    });
  });

  describe('authorized', () => {
    it('ACTIVE Membership + ACTIVE Restaurant succeeds with the safe context', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ role: 'MANAGER', permissions: ['orders.view'], allBranches: false }),
      );

      const result = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(result).toEqual({
        outcome: 'authorized',
        context: {
          membershipId: 'membership-1',
          restaurantId: RESTAURANT_ID,
          role: 'MANAGER',
          roleId: 'role-1',
          permissions: ['orders.view'],
          allBranches: false,
        },
      });
    });

    it('carries allBranches exactly as stored in the database', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ allBranches: true }),
      );

      const result = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(result.outcome).toBe('authorized');
      expect(
        result.outcome === 'authorized' && result.context.allBranches,
      ).toBe(true);
    });

    it('carries the Role kind as a label', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ role: 'KITCHEN' }),
      );

      const result = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(result.outcome === 'authorized' && result.context.role).toBe(
        'KITCHEN',
      );
    });

    it('never returns a Prisma record -- only the documented fields', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership(),
      );

      const result = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(result.outcome === 'authorized' && result.context).toEqual({
        membershipId: expect.any(String) as string,
        restaurantId: expect.any(String) as string,
        role: expect.any(String) as string,
        roleId: expect.any(String) as string,
        permissions: expect.any(Array) as string[],
        allBranches: expect.any(Boolean) as boolean,
      });
    });

    it('resolves permissions from the Membership Role row (a custom Role), ignoring the kind label', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ role: 'CUSTOM', permissions: ['orders.view', 'menu.view', 'bogus.key'] }),
      );

      const result = await service.resolveRestaurantAccess(USER_ID, RESTAURANT_ID);

      expect(result.outcome === 'authorized' && result.context.permissions).toEqual(['menu.view', 'orders.view']);
    });

    it('the protected Owner Role always holds every Permission, whatever is stored', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ role: 'OWNER', permissions: [] }),
      );

      const result = await service.resolveRestaurantAccess(USER_ID, RESTAURANT_ID);

      expect(result.outcome === 'authorized' && result.context.permissions).toEqual([...ALL_PERMISSIONS]);
    });

    it('a Role with no permissions grants nothing', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ role: 'CUSTOM', permissions: [] }),
      );

      const result = await service.resolveRestaurantAccess(USER_ID, RESTAURANT_ID);

      expect(result.outcome === 'authorized' && result.context.permissions).toEqual([]);
    });
  });

  describe('notFound (existence-hiding)', () => {
    it('no Membership row at all', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(null);

      const result = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
    });

    it('the exact-same outcome is produced regardless of which underlying case occurred', async () => {
      // Prisma's status:'ACTIVE' filter already means an INVITED/DISABLED
      // Membership, or a Membership belonging to another Restaurant, simply
      // does not match -- findUnique resolves null in every one of those
      // cases, proving they are byte-identical outcomes at this boundary.
      prisma.restaurantMembership.findUnique.mockResolvedValue(null);
      const unknownRestaurant = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      prisma.restaurantMembership.findUnique.mockResolvedValue(null);
      const noMembership = await service.resolveRestaurantAccess(
        USER_ID,
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
      );

      expect(unknownRestaurant).toEqual(noMembership);
      expect(unknownRestaurant).toEqual({ outcome: 'notFound' });
    });
  });

  describe('notOperational', () => {
    it.each(['INACTIVE', 'SUSPENDED'])(
      'ACTIVE Membership + %s Restaurant -> notOperational, never notFound',
      async (restaurantStatus) => {
        prisma.restaurantMembership.findUnique.mockResolvedValue(
          buildMembership({ restaurantStatus }),
        );

        const result = await service.resolveRestaurantAccess(
          USER_ID,
          RESTAURANT_ID,
        );

        expect(result).toEqual({ outcome: 'notOperational' });
      },
    );

    it('INACTIVE and SUSPENDED both produce the identical outcome', async () => {
      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ restaurantStatus: 'INACTIVE' }),
      );
      const inactive = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      prisma.restaurantMembership.findUnique.mockResolvedValue(
        buildMembership({ restaurantStatus: 'SUSPENDED' }),
      );
      const suspended = await service.resolveRestaurantAccess(
        USER_ID,
        RESTAURANT_ID,
      );

      expect(inactive).toEqual(suspended);
    });
  });
});
