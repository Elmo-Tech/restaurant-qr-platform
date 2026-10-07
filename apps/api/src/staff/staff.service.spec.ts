import {
  StaffService,
  type AuthorizedStaffListScope,
  type StaffMembershipListItem,
} from './staff.service';

interface MembershipRow {
  id: string;
  role: string;
  restaurantRole: { id: string; name: string };
  status: string;
  allBranches: boolean;
  user: { id: string; email: string };
}

interface BranchRow {
  id: string;
  name: string;
  status: string;
}

interface MembershipBranchRow {
  restaurantMembershipId: string;
  branch: BranchRow;
}

interface FindManyMembershipArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, unknown>;
}

interface FindManyBranchArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, unknown>;
}

interface FindManyMembershipBranchArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, unknown>;
}

const RESTAURANT_ID = 'restaurant-1';

function membership(params: {
  id: string;
  userId: string;
  email: string;
  role?: string;
  status?: string;
  allBranches: boolean;
}): MembershipRow {
  return {
    id: params.id,
    role: params.role ?? 'MANAGER',
    restaurantRole: { id: `role-${params.role ?? 'MANAGER'}`, name: params.role ?? 'MANAGER' },
    status: params.status ?? 'ACTIVE',
    allBranches: params.allBranches,
    user: { id: params.userId, email: params.email },
  };
}

function branchRow(id: string, name = 'Maadi', status = 'ACTIVE'): BranchRow {
  return { id, name, status };
}

describe('StaffService', () => {
  let mock: {
    membershipFindMany: jest.Mock<
      Promise<MembershipRow[]>,
      [FindManyMembershipArgs]
    >;
    branchFindMany: jest.Mock<Promise<BranchRow[]>, [FindManyBranchArgs]>;
    membershipBranchFindMany: jest.Mock<
      Promise<MembershipBranchRow[]>,
      [FindManyMembershipBranchArgs]
    >;
  };
  let service: StaffService;

  beforeEach(() => {
    mock = {
      membershipFindMany: jest
        .fn<Promise<MembershipRow[]>, [FindManyMembershipArgs]>()
        .mockResolvedValue([]),
      branchFindMany: jest
        .fn<Promise<BranchRow[]>, [FindManyBranchArgs]>()
        .mockResolvedValue([]),
      membershipBranchFindMany: jest
        .fn<Promise<MembershipBranchRow[]>, [FindManyMembershipBranchArgs]>()
        .mockResolvedValue([]),
    };
    const prisma = {
      restaurantMembership: { findMany: mock.membershipFindMany },
      branch: { findMany: mock.branchFindMany },
      restaurantMembershipBranch: { findMany: mock.membershipBranchFindMany },
    };
    service = new StaffService(prisma as never);
  });

  describe('Restaurant-scoped query', () => {
    it('1. queries restaurantMembership.findMany scoped to restaurantId', async () => {
      const scope: AuthorizedStaffListScope = {
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller-membership',
        allBranches: true,
      };

      await service.listStaffMemberships(scope);

      expect(mock.membershipFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: RESTAURANT_ID } }),
      );
    });

    it('2. Restaurant B Memberships are never returned (query itself is Tenant-scoped)', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-a',
          userId: 'u-a',
          email: 'a@example.test',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-a',
        allBranches: true,
      });

      expect(result.every((item) => item.id !== 'restaurant-b-member')).toBe(
        true,
      );
      expect(mock.membershipFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: RESTAURANT_ID } }),
      );
    });

    it('3. a multi-Restaurant User only surfaces the Membership row already scoped by the query (Restaurant A)', async () => {
      // The Restaurant-scoped `where` clause is the only mechanism relied
      // on here -- Prisma itself would never return a Restaurant B row for
      // this restaurantId, so this simply proves the shape passed through
      // unchanged for the single Restaurant A row.
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-a',
          userId: 'multi-restaurant-user',
          email: 'multi@example.test',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-a',
        allBranches: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].user.id).toBe('multi-restaurant-user');
    });
  });

  describe('Membership status inclusion', () => {
    it('4. ACTIVE Membership appears', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-active',
          userId: 'u1',
          email: 'active@example.test',
          status: 'ACTIVE',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-active',
        allBranches: true,
      });

      expect(result.map((i) => i.status)).toEqual(['ACTIVE']);
    });

    it('5. INVITED Membership appears', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-invited',
          userId: 'u1',
          email: 'invited@example.test',
          status: 'INVITED',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-invited',
        allBranches: true,
      });

      expect(result.map((i) => i.status)).toEqual(['INVITED']);
    });

    it('6. DISABLED Membership appears', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-disabled',
          userId: 'u1',
          email: 'disabled@example.test',
          status: 'DISABLED',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-disabled',
        allBranches: true,
      });

      expect(result.map((i) => i.status)).toEqual(['DISABLED']);
    });
  });

  describe('safe field shape', () => {
    it('7. User response contains only id/email', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'owner@example.test',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(Object.keys(result[0].user).sort()).toEqual(['email', 'id']);
    });

    it('8. no passwordHash/emailNormalized/preferredLocale/User.status leak (select never requests them)', async () => {
      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      const args = mock.membershipFindMany.mock.calls[0][0];
      const userSelect = (
        args.select as { user: { select: Record<string, boolean> } }
      ).user.select;
      expect(Object.keys(userSelect).sort()).toEqual(['email', 'id']);
    });

    it('9. Membership response exact fields only', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'owner@example.test',
          allBranches: true,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(Object.keys(result[0]).sort()).toEqual(
        ['allBranches', 'branches', 'id', 'role', 'roleId', 'roleName', 'status', 'user'].sort(),
      );
    });
  });

  describe('Branch representation', () => {
    it('10. allBranches=true maps to all authorized-Restaurant Branches', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'owner@example.test',
          allBranches: true,
        }),
      ]);
      mock.branchFindMany.mockResolvedValue([
        branchRow('b1', 'Maadi', 'ACTIVE'),
        branchRow('b2', 'Nasr City', 'INACTIVE'),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(result[0].branches).toEqual([
        { id: 'b1', name: 'Maadi', status: 'ACTIVE' },
        { id: 'b2', name: 'Nasr City', status: 'INACTIVE' },
      ]);
      expect(mock.branchFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: RESTAURANT_ID } }),
      );
    });

    it('11. allBranches=false maps exact valid assigned Branches', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'manager@example.test',
          allBranches: false,
        }),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'm1', branch: branchRow('b1', 'Maadi') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: false,
      });

      expect(result[0].branches).toEqual([
        { id: 'b1', name: 'Maadi', status: 'ACTIVE' },
      ]);
    });

    it('12. malformed cross-Restaurant MembershipBranch is never surfaced (enforced by the query where clause)', async () => {
      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: false,
      });

      // No memberships in this call, so the assignment query is skipped
      // entirely; the defense-in-depth assertion below proves the query
      // shape used whenever it does run (see the next test).
      expect(mock.membershipBranchFindMany).not.toHaveBeenCalled();
    });

    it('12b. the assignment query enforces branch.restaurantId == authorized restaurantId', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'manager@example.test',
          allBranches: false,
        }),
      ]);

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: false,
      });

      const args = mock.membershipBranchFindMany.mock.calls[0][0];
      expect(args.where).toEqual({
        restaurantMembershipId: { in: ['m1'] },
        branch: { restaurantId: RESTAURANT_ID },
      });
    });
  });

  describe('Branch-scoped caller visibility (Item 7 of the settled contract)', () => {
    function scopedMembership(id: string, userId: string): MembershipRow {
      return membership({
        id,
        userId,
        email: `${userId}@example.test`,
        allBranches: false,
      });
    }

    it('13. Branch-scoped caller sees own Membership even with zero Branch assignments', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['caller']);
    });

    it('14. sees target whose non-empty valid Branch set is fully contained in caller Branch set', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
        scopedMembership('target', 'target-user'),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'caller', branch: branchRow('A') },
        { restaurantMembershipId: 'caller', branch: branchRow('B') },
        { restaurantMembershipId: 'target', branch: branchRow('A') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id).sort()).toEqual(['caller', 'target']);
    });

    it('15. does NOT see target with partial overlap (target also has an out-of-scope Branch)', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
        scopedMembership('target', 'target-user'),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'caller', branch: branchRow('A') },
        { restaurantMembershipId: 'target', branch: branchRow('A') },
        { restaurantMembershipId: 'target', branch: branchRow('B') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['caller']);
    });

    it('16. does NOT see target assigned only outside scope', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
        scopedMembership('target', 'target-user'),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'caller', branch: branchRow('A') },
        { restaurantMembershipId: 'target', branch: branchRow('B') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['caller']);
    });

    it('17. does NOT see another allBranches=true Membership', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
        membership({
          id: 'owner',
          userId: 'owner-user',
          email: 'owner@example.test',
          role: 'OWNER',
          allBranches: true,
        }),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'caller', branch: branchRow('A') },
      ]);
      mock.branchFindMany.mockResolvedValue([branchRow('A'), branchRow('B')]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['caller']);
    });

    it('18. does NOT see another allBranches=false Membership with zero valid Branch assignments', async () => {
      mock.membershipFindMany.mockResolvedValue([
        scopedMembership('caller', 'caller-user'),
        scopedMembership('empty-target', 'empty-target-user'),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'caller', branch: branchRow('A') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'caller',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['caller']);
    });
  });

  describe('ordering', () => {
    it('19. membership ordering id ASC is requested from the database', async () => {
      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(mock.membershipFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'asc' } }),
      );
    });

    it('19b. filtering for a Branch-scoped caller preserves the original id ASC order', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-a',
          userId: 'ua',
          email: 'a@example.test',
          allBranches: false,
        }),
        membership({
          id: 'm-b',
          userId: 'ub',
          email: 'b@example.test',
          allBranches: false,
        }),
        membership({
          id: 'm-c',
          userId: 'uc',
          email: 'c@example.test',
          allBranches: false,
        }),
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { restaurantMembershipId: 'm-a', branch: branchRow('X') },
        { restaurantMembershipId: 'm-b', branch: branchRow('X') },
        { restaurantMembershipId: 'm-c', branch: branchRow('X') },
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-a',
        allBranches: false,
      });

      expect(result.map((i) => i.id)).toEqual(['m-a', 'm-b', 'm-c']);
    });

    it('20. nested Branch ordering id ASC is requested from the database (both queries)', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'a@example.test',
          allBranches: true,
        }),
      ]);

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(mock.branchFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'asc' } }),
      );
    });

    it('20b. Branch assignment query orders by branch id asc', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'a@example.test',
          allBranches: false,
        }),
      ]);

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: false,
      });

      expect(mock.membershipBranchFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { branch: { id: 'asc' } } }),
      );
    });
  });

  describe('no unexpected side queries', () => {
    it('21. issues no RestaurantInvitation query (no such Prisma delegate is ever touched)', async () => {
      const prisma = {
        restaurantMembership: { findMany: mock.membershipFindMany },
        branch: { findMany: mock.branchFindMany },
        restaurantMembershipBranch: { findMany: mock.membershipBranchFindMany },
      };
      expect(Object.keys(prisma)).not.toContain('restaurantInvitation');

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });
    });

    it('22. skips the Branch assignment query entirely when no Membership is allBranches=false', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'a@example.test',
          allBranches: true,
        }),
      ]);

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: true,
      });

      expect(mock.membershipBranchFindMany).not.toHaveBeenCalled();
    });

    it('22b. skips the Restaurant Branch query entirely when no Membership is allBranches=true', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm1',
          userId: 'u1',
          email: 'a@example.test',
          allBranches: false,
        }),
      ]);

      await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm1',
        allBranches: false,
      });

      expect(mock.branchFindMany).not.toHaveBeenCalled();
    });
  });

  describe('empty result', () => {
    it('returns an empty array, not null/undefined, when zero Memberships are visible', async () => {
      mock.membershipFindMany.mockResolvedValue([]);

      const result: StaffMembershipListItem[] =
        await service.listStaffMemberships({
          restaurantId: RESTAURANT_ID,
          membershipId: 'nonexistent',
          allBranches: true,
        });

      expect(result).toEqual([]);
    });
  });

  describe('allBranches=true caller sees everything unfiltered', () => {
    it('returns OWNER, other allBranches=true, and allBranches=false Memberships alike', async () => {
      mock.membershipFindMany.mockResolvedValue([
        membership({
          id: 'm-owner',
          userId: 'u-owner',
          email: 'owner@example.test',
          role: 'OWNER',
          allBranches: true,
        }),
        membership({
          id: 'm-manager-wide',
          userId: 'u-manager',
          email: 'manager@example.test',
          role: 'MANAGER',
          allBranches: true,
        }),
        membership({
          id: 'm-scoped',
          userId: 'u-scoped',
          email: 'scoped@example.test',
          role: 'WAITER',
          allBranches: false,
        }),
      ]);

      const result = await service.listStaffMemberships({
        restaurantId: RESTAURANT_ID,
        membershipId: 'm-owner',
        allBranches: true,
      });

      expect(result.map((i) => i.id).sort()).toEqual(
        ['m-owner', 'm-manager-wide', 'm-scoped'].sort(),
      );
    });
  });
});
