import {
  BranchesService,
  type ActivatedBranch,
  type ActivateBranchInput,
  type AuthorizedBranchScope,
  type BranchListItem,
  type CreateBranchInput,
  type CreatedBranch,
  type UpdateBranchInput,
  type UpdatedBranch,
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

interface CreateBranchArgs {
  data: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface UpdateBranchArgs {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  select: Record<string, boolean>;
}

type BranchUpdateResult = ActivatedBranch | UpdatedBranch;

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
  } & {
    branch: {
      findMany: jest.Mock<Promise<BranchListItem[]>, [FindManyBranchArgs]>;
      create: jest.Mock<Promise<CreatedBranch>, [CreateBranchArgs]>;
      update: jest.Mock<Promise<BranchUpdateResult>, [UpdateBranchArgs]>;
    };
  };
  let service: BranchesService;

  const CREATE_INPUT: CreateBranchInput = {
    restaurantId: 'restaurant-1',
    name: 'Maadi',
    timezone: 'Africa/Cairo',
    phone: null,
    address: null,
  };

  const ACTIVATE_INPUT: ActivateBranchInput = { branchId: 'branch-1' };

  const UPDATED_BRANCH: UpdatedBranch = {
    id: 'branch-1',
    name: 'Maadi',
    status: 'ACTIVE',
    timezone: 'Africa/Cairo',
    phone: null,
    address: null,
  };

  beforeEach(() => {
    prisma = {
      branch: {
        findMany: jest
          .fn<Promise<BranchListItem[]>, [FindManyBranchArgs]>()
          .mockResolvedValue([]),
        create: jest
          .fn<Promise<CreatedBranch>, [CreateBranchArgs]>()
          .mockResolvedValue({
            id: 'new-branch-id',
            name: 'Maadi',
            status: 'INACTIVE',
            timezone: 'Africa/Cairo',
            phone: null,
            address: null,
          }),
        update: jest
          .fn<Promise<BranchUpdateResult>, [UpdateBranchArgs]>()
          .mockResolvedValue({ id: 'branch-1', status: 'ACTIVE' }),
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

  describe('createBranch', () => {
    it('persists restaurantId from the input, not any other source', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.data.restaurantId).toBe('restaurant-1');
    });

    it('always persists status INACTIVE regardless of input', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.data.status).toBe('INACTIVE');
    });

    it('generates a publicId with the branch-<UUID> shape', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.data.publicId).toMatch(/^branch-[0-9a-f-]{36}$/i);
    });

    it('publicId is independent from Branch.id -- never derived from it', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      // Nothing in the created data ties publicId's value to any id field --
      // it is generated standalone before the row exists.
      expect(args.data.publicId).not.toContain('new-branch-id');
    });

    it('persists name, timezone, phone, and address exactly as given', async () => {
      await service.createBranch({
        restaurantId: 'restaurant-1',
        name: 'Nasr City',
        timezone: 'Africa/Cairo',
        phone: '+20 100 000 0000',
        address: '1 Nile Street',
      });

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.data.name).toBe('Nasr City');
      expect(args.data.timezone).toBe('Africa/Cairo');
      expect(args.data.phone).toBe('+20 100 000 0000');
      expect(args.data.address).toBe('1 Nile Street');
    });

    it('persists null phone/address as null, not undefined or empty string', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.data.phone).toBeNull();
      expect(args.data.address).toBeNull();
    });

    it('builds the Prisma data object with exactly the expected keys -- never a spread of the input', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(Object.keys(args.data).sort()).toEqual(
        [
          'address',
          'name',
          'phone',
          'publicId',
          'restaurantId',
          'status',
          'timezone',
        ].sort(),
      );
    });

    it('selects only the safe response fields -- never restaurantId, publicId, createdAt, or updatedAt', async () => {
      await service.createBranch(CREATE_INPUT);

      const args = prisma.branch.create.mock.calls[0][0];
      expect(args.select).toEqual({
        id: true,
        name: true,
        status: true,
        timezone: true,
        phone: true,
        address: true,
      });
    });

    it('returns whatever Prisma resolves, unmodified', async () => {
      const created: CreatedBranch = {
        id: 'b1',
        name: 'Maadi',
        status: 'INACTIVE',
        timezone: 'Africa/Cairo',
        phone: null,
        address: null,
      };
      prisma.branch.create.mockResolvedValue(created);

      const result = await service.createBranch(CREATE_INPUT);

      expect(result).toEqual(created);
    });
  });

  describe('activateBranch', () => {
    it('A. sets the exact target Branch status to ACTIVE', async () => {
      await service.activateBranch(ACTIVATE_INPUT);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'branch-1' });
      expect(args.data).toEqual({ status: 'ACTIVE' });
    });

    it('B. selects/returns exactly id and status', async () => {
      await service.activateBranch(ACTIVATE_INPUT);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.select).toEqual({ id: true, status: true });
    });

    it('B. returns whatever Prisma resolves, unmodified', async () => {
      const activated: ActivatedBranch = { id: 'branch-1', status: 'ACTIVE' };
      prisma.branch.update.mockResolvedValue(activated);

      const result = await service.activateBranch(ACTIVATE_INPUT);

      expect(result).toEqual(activated);
    });

    it('C. an already-ACTIVE target may be activated again successfully', async () => {
      prisma.branch.update.mockResolvedValue({
        id: 'branch-1',
        status: 'ACTIVE',
      });

      await expect(service.activateBranch(ACTIVATE_INPUT)).resolves.toEqual({
        id: 'branch-1',
        status: 'ACTIVE',
      });
    });

    it('D. never touches Table or QrCode', async () => {
      const prismaWithTableQr = prisma as unknown as {
        table?: unknown;
        qrCode?: unknown;
      };

      await service.activateBranch(ACTIVATE_INPUT);

      expect(prismaWithTableQr.table).toBeUndefined();
      expect(prismaWithTableQr.qrCode).toBeUndefined();
    });

    it('E. the persisted status is always the literal ACTIVE, never taken from input', async () => {
      // ActivateBranchInput has no status field at all -- there is nothing
      // for the service to read even if it wanted to. Asserting the data
      // object's only key is `status: 'ACTIVE'` proves it is server-derived.
      await service.activateBranch(ACTIVATE_INPUT);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(Object.keys(args.data)).toEqual(['status']);
      expect(args.data.status).toBe('ACTIVE');
    });

    it('F. performs no Membership/authorization query', async () => {
      await service.activateBranch(ACTIVATE_INPUT);

      expect(prisma.restaurantMembershipBranch.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updateBranch', () => {
    beforeEach(() => {
      prisma.branch.update.mockResolvedValue(UPDATED_BRANCH);
    });

    it('A. persists a supplied name', async () => {
      const input: UpdateBranchInput = {
        branchId: 'branch-1',
        name: 'Nasr City',
      };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'branch-1' });
      expect(args.data.name).toBe('Nasr City');
    });

    it('B. persists a supplied timezone', async () => {
      const input: UpdateBranchInput = {
        branchId: 'branch-1',
        timezone: 'Africa/Cairo',
      };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.data.timezone).toBe('Africa/Cairo');
    });

    it('C. phone: null clears phone', async () => {
      const input: UpdateBranchInput = { branchId: 'branch-1', phone: null };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.data).toHaveProperty('phone', null);
    });

    it('D. address: null clears address', async () => {
      const input: UpdateBranchInput = { branchId: 'branch-1', address: null };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.data).toHaveProperty('address', null);
    });

    it('E. omitted fields are not present in the Prisma update data', async () => {
      const input: UpdateBranchInput = {
        branchId: 'branch-1',
        name: 'Nasr City',
      };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(Object.keys(args.data)).toEqual(['name']);
    });

    it('F. status is never present in the Prisma update data', async () => {
      const input: UpdateBranchInput = {
        branchId: 'branch-1',
        name: 'Nasr City',
        timezone: 'Africa/Cairo',
        phone: null,
        address: null,
      };

      await service.updateBranch(input);

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.data).not.toHaveProperty('status');
    });

    it('G. selects exactly id, name, status, timezone, phone, address', async () => {
      await service.updateBranch({ branchId: 'branch-1' });

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.select).toEqual({
        id: true,
        name: true,
        status: true,
        timezone: true,
        phone: true,
        address: true,
      });
    });

    it('H. an empty update (all fields omitted) still succeeds with an empty data object', async () => {
      const result = await service.updateBranch({ branchId: 'branch-1' });

      const args = prisma.branch.update.mock.calls[0][0];
      expect(args.data).toEqual({});
      expect(result).toEqual(UPDATED_BRANCH);
    });

    it('I. performs no Membership/authorization query', async () => {
      await service.updateBranch({ branchId: 'branch-1', name: 'Nasr City' });

      expect(prisma.restaurantMembershipBranch.findMany).not.toHaveBeenCalled();
    });

    it('J. never touches Table or QrCode', async () => {
      const prismaWithTableQr = prisma as unknown as {
        table?: unknown;
        qrCode?: unknown;
      };

      await service.updateBranch({ branchId: 'branch-1', name: 'Nasr City' });

      expect(prismaWithTableQr.table).toBeUndefined();
      expect(prismaWithTableQr.qrCode).toBeUndefined();
    });

    it('returns whatever Prisma resolves, unmodified', async () => {
      prisma.branch.update.mockResolvedValue(UPDATED_BRANCH);

      const result = await service.updateBranch({
        branchId: 'branch-1',
        name: 'Maadi',
      });

      expect(result).toEqual(UPDATED_BRANCH);
    });
  });
});
