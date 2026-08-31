import { BranchAccessService } from './branch-access.service';
import type { RestaurantAccessContext } from './restaurant-access.service';

const RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FOREIGN_RESTAURANT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const BRANCH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildPrismaMock() {
  return {
    branch: { findUnique: jest.fn() },
    restaurantMembershipBranch: { findFirst: jest.fn() },
  };
}

function buildRestaurantAccess(
  overrides: Partial<RestaurantAccessContext> = {},
): RestaurantAccessContext {
  return {
    membershipId: 'membership-1',
    restaurantId: RESTAURANT_ID,
    role: 'OWNER',
    allBranches: true,
    ...overrides,
  };
}

describe('BranchAccessService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: BranchAccessService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new BranchAccessService(prisma as never);
  });

  it('rejects a malformed (non-UUID) requested Branch identifier without querying Prisma', async () => {
    const result = await service.resolveBranchAccess(
      buildRestaurantAccess(),
      'not-a-uuid',
    );

    expect(result).toEqual({ outcome: 'notFound' });
    expect(prisma.branch.findUnique).not.toHaveBeenCalled();
  });

  describe('Branch identity / foreign Restaurant', () => {
    it('unknown Branch -> notFound', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess(),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
    });

    it('Branch exists but belongs to a foreign Restaurant -> notFound, never accessDenied', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: FOREIGN_RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
      expect(
        prisma.restaurantMembershipBranch.findFirst,
      ).not.toHaveBeenCalled();
    });

    it('foreign + INACTIVE Branch -> notFound (404), not notOperational (409)', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: FOREIGN_RESTAURANT_ID,
        status: 'INACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
    });

    it('unknown Branch and foreign-Restaurant Branch produce the identical outcome', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);
      const unknown = await service.resolveBranchAccess(
        buildRestaurantAccess(),
        BRANCH_ID,
      );

      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: FOREIGN_RESTAURANT_ID,
        status: 'ACTIVE',
      });
      const foreign = await service.resolveBranchAccess(
        buildRestaurantAccess(),
        BRANCH_ID,
      );

      expect(unknown).toEqual(foreign);
    });
  });

  describe('allBranches=true', () => {
    it('authorizes a same-Restaurant ACTIVE Branch without checking assignments', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result).toEqual({
        outcome: 'authorized',
        context: { branchId: BRANCH_ID },
      });
      expect(
        prisma.restaurantMembershipBranch.findFirst,
      ).not.toHaveBeenCalled();
    });

    it('does NOT authorize a foreign-Restaurant Branch merely because allBranches=true', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: FOREIGN_RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
    });
  });

  describe('allBranches=false', () => {
    it('same-Restaurant assigned Branch succeeds', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue({
        branchId: BRANCH_ID,
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({
        outcome: 'authorized',
        context: { branchId: BRANCH_ID },
      });
    });

    it('queries the assignment scoped by membershipId AND the Restaurant identity (defense-in-depth)', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue({
        branchId: BRANCH_ID,
      });

      await service.resolveBranchAccess(
        buildRestaurantAccess({
          membershipId: 'membership-x',
          allBranches: false,
        }),
        BRANCH_ID,
      );

      expect(prisma.restaurantMembershipBranch.findFirst).toHaveBeenCalledWith({
        where: {
          restaurantMembershipId: 'membership-x',
          branchId: BRANCH_ID,
          branch: { restaurantId: RESTAURANT_ID },
        },
        select: { branchId: true },
      });
    });

    it('unassigned Branch -> accessDenied (403)', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue(null);

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'accessDenied' });
    });

    it('zero assignments overall -> accessDenied (403), same as an unassigned Branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue(null);

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'accessDenied' });
    });

    it('same-Restaurant + unassigned + INACTIVE Branch -> accessDenied (403), not notOperational (409)', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'INACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue(null);

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'accessDenied' });
    });
  });

  describe('malformed cross-Restaurant RestaurantMembershipBranch assignment', () => {
    it('never authorizes -- Branch identity check (notFound) fires before any assignment lookup', async () => {
      // Membership belongs to RESTAURANT_ID, but the requested Branch
      // actually belongs to FOREIGN_RESTAURANT_ID -- exactly the malformed
      // assignment scenario. Branch identity fails first, so the
      // assignment table is never even consulted.
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: FOREIGN_RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notFound' });
      expect(
        prisma.restaurantMembershipBranch.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('operational status', () => {
    it('same-Restaurant + assigned + INACTIVE Branch -> notOperational (409)', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'INACTIVE',
      });
      prisma.restaurantMembershipBranch.findFirst.mockResolvedValue({
        branchId: BRANCH_ID,
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: false }),
        BRANCH_ID,
      );

      expect(result).toEqual({ outcome: 'notOperational' });
    });

    it('ACTIVE Branch succeeds', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result).toEqual({
        outcome: 'authorized',
        context: { branchId: BRANCH_ID },
      });
    });

    it('never returns a Prisma record -- only branchId', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: BRANCH_ID,
        restaurantId: RESTAURANT_ID,
        status: 'ACTIVE',
      });

      const result = await service.resolveBranchAccess(
        buildRestaurantAccess({ allBranches: true }),
        BRANCH_ID,
      );

      expect(result.outcome === 'authorized' && result.context).toEqual({
        branchId: BRANCH_ID,
      });
    });
  });
});
