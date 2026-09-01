import {
  BranchesService,
  type AuthorizedBranchScope,
  type BranchListItem,
} from './branches.service';

interface FindManyBranchArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface FindManyAssignmentArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, unknown>;
}

const ALL_BRANCHES_SCOPE: AuthorizedBranchScope = {
  restaurantId: 'restaurant-1',
  membershipId: 'membership-1',
  allBranches: true,
};

const SCOPED_MEMBERSHIP_SCOPE: AuthorizedBranchScope = {
  restaurantId: 'restaurant-1',
  membershipId: 'membership-1',
  allBranches: false,
};

describe('BranchesService', () => {
  let prisma: {
    branch: {
      findMany: jest.Mock<Promise<BranchListItem[]>, [FindManyBranchArgs]>;
    };
    restaurantMembershipBranch: {
      findMany: jest.Mock<
        Promise<{ branch: BranchListItem }[]>,
        [FindManyAssignmentArgs]
      >;
    };
  };
  let service: BranchesService;

  beforeEach(() => {
    prisma = {
      branch: {
        findMany: jest
          .fn<Promise<BranchListItem[]>, [FindManyBranchArgs]>()
          .mockResolvedValue([]),
      },
      restaurantMembershipBranch: {
        findMany: jest
          .fn<Promise<{ branch: BranchListItem }[]>, [FindManyAssignmentArgs]>()
          .mockResolvedValue([]),
      },
    };
    service = new BranchesService(prisma as never);
  });

  describe('allBranches = true', () => {
    it('queries branch.findMany scoped to restaurantId', async () => {
      await service.listBranches(ALL_BRANCHES_SCOPE);

      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'restaurant-1' } }),
      );
      expect(prisma.restaurantMembershipBranch.findMany).not.toHaveBeenCalled();
    });

    it('selects only id, name, and status, ordered by id ascending', async () => {
      await service.listBranches(ALL_BRANCHES_SCOPE);

      const args = prisma.branch.findMany.mock.calls[0][0];
      expect(args.select).toEqual({ id: true, name: true, status: true });
      expect(args.orderBy).toEqual({ id: 'asc' });
    });

    it('does not filter by status -- INACTIVE Branches are included', async () => {
      await service.listBranches(ALL_BRANCHES_SCOPE);

      const args = prisma.branch.findMany.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('status');
    });

    it('returns whatever Prisma resolves, unmodified', async () => {
      const rows: BranchListItem[] = [
        { id: 'b1', name: 'Maadi', status: 'ACTIVE' },
        { id: 'b2', name: 'Nasr City', status: 'INACTIVE' },
      ];
      prisma.branch.findMany.mockResolvedValue(rows);

      const result = await service.listBranches(ALL_BRANCHES_SCOPE);

      expect(result).toEqual(rows);
    });
  });

  describe('allBranches = false', () => {
    it('queries restaurantMembershipBranch.findMany, not branch.findMany', async () => {
      await service.listBranches(SCOPED_MEMBERSHIP_SCOPE);

      expect(prisma.restaurantMembershipBranch.findMany).toHaveBeenCalled();
      expect(prisma.branch.findMany).not.toHaveBeenCalled();
    });

    it('scopes by BOTH restaurantMembershipId AND branch.restaurantId (AUTH_TENANCY_SPEC.md #61A)', async () => {
      await service.listBranches(SCOPED_MEMBERSHIP_SCOPE);

      const args = prisma.restaurantMembershipBranch.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        restaurantMembershipId: 'membership-1',
        branch: { restaurantId: 'restaurant-1' },
      });
    });

    it('selects only the nested branch id/name/status', async () => {
      await service.listBranches(SCOPED_MEMBERSHIP_SCOPE);

      const args = prisma.restaurantMembershipBranch.findMany.mock.calls[0][0];
      expect(args.select).toEqual({
        branch: { select: { id: true, name: true, status: true } },
      });
    });

    it('maps assignment rows to their branch objects', async () => {
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([
        { branch: { id: 'b1', name: 'Maadi', status: 'ACTIVE' } },
        { branch: { id: 'b2', name: 'Nasr City', status: 'INACTIVE' } },
      ]);

      const result = await service.listBranches(SCOPED_MEMBERSHIP_SCOPE);

      expect(result).toEqual([
        { id: 'b1', name: 'Maadi', status: 'ACTIVE' },
        { id: 'b2', name: 'Nasr City', status: 'INACTIVE' },
      ]);
    });

    it('zero assignments -> empty array, never falls back to all Restaurant Branches', async () => {
      prisma.restaurantMembershipBranch.findMany.mockResolvedValue([]);

      const result = await service.listBranches(SCOPED_MEMBERSHIP_SCOPE);

      expect(result).toEqual([]);
      expect(prisma.branch.findMany).not.toHaveBeenCalled();
    });
  });
});
