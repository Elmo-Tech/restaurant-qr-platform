import { Prisma } from '../generated/prisma/client';
import {
  StaffInvitationsService,
  type CreateStaffInvitationInput,
} from './staff-invitations.service';

const RESTAURANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALLER_MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVITER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRANCH_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BRANCH_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const BRANCH_C_OUT_OF_SCOPE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const INVITATION_ID = '11111111-1111-4111-8111-111111111111';

const RAW_TOKEN = 'fixed-raw-token';
const TOKEN_HASH = 'fixed-token-hash';

const SCOPED_INPUT: CreateStaffInvitationInput = {
  restaurantId: RESTAURANT_ID,
  inviterMembershipId: CALLER_MEMBERSHIP_ID,
  inviterAllBranches: false,
  invitedByUserId: INVITER_USER_ID,
  email: 'manager@example.test',
  role: 'MANAGER',
  allBranches: false,
  branchIds: [BRANCH_A],
};

function fakeSerializationConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    { code: 'P2034', clientVersion: '7.10.0' },
  );
}

interface BranchRow {
  id: string;
  name: string;
  status: string;
}

interface BranchFindManyArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface MembershipBranchFindManyArgs {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface MembershipFindFirstArgs {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface InvitationFindFirstArgs {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface InvitationCreateArgs {
  data: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface InvitationCreateRow {
  id: string;
  emailNormalized: string;
  role: string;
  allBranches: boolean;
  expiresAt: Date;
}

interface InvitationBranchCreateManyArgs {
  data: { restaurantInvitationId: string; branchId: string }[];
}

function buildPrismaMock() {
  const branchFindMany = jest
    .fn<Promise<BranchRow[]>, [BranchFindManyArgs]>()
    .mockResolvedValue([]);
  const membershipBranchFindMany = jest
    .fn<Promise<{ branchId: string }[]>, [MembershipBranchFindManyArgs]>()
    .mockResolvedValue([]);
  const membershipFindFirst = jest
    .fn<Promise<{ id: string } | null>, [MembershipFindFirstArgs]>()
    .mockResolvedValue(null);
  const invitationFindFirst = jest
    .fn<Promise<{ id: string } | null>, [InvitationFindFirstArgs]>()
    .mockResolvedValue(null);
  const invitationCreate = jest
    .fn<Promise<InvitationCreateRow>, [InvitationCreateArgs]>()
    .mockResolvedValue({
      id: INVITATION_ID,
      emailNormalized: SCOPED_INPUT.email,
      role: SCOPED_INPUT.role,
      allBranches: SCOPED_INPUT.allBranches,
      expiresAt: new Date('2026-09-11T00:00:00.000Z'),
    });
  const invitationBranchCreateMany = jest
    .fn<Promise<{ count: number }>, [InvitationBranchCreateManyArgs]>()
    .mockResolvedValue({ count: 1 });

  // Deliberately no `user` delegate, and no `create`/`update` on
  // `restaurantMembership`/`restaurantMembershipBranch`: if the service ever
  // touched a User row or wrote a Membership/MembershipBranch row (violating
  // the INVITATION-ONLY lifecycle), that call would throw here rather than
  // silently succeeding.
  const txClient = {
    branch: { findMany: branchFindMany },
    restaurantMembershipBranch: { findMany: membershipBranchFindMany },
    restaurantMembership: { findFirst: membershipFindFirst },
    restaurantInvitation: {
      findFirst: invitationFindFirst,
      create: invitationCreate,
    },
    restaurantInvitationBranch: { createMany: invitationBranchCreateMany },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: { $transaction },
    $transaction,
    branchFindMany,
    membershipBranchFindMany,
    membershipFindFirst,
    invitationFindFirst,
    invitationCreate,
    invitationBranchCreateMany,
    txClient,
  };
}

function buildConfigService(ttlDays = 7) {
  return { get: jest.fn().mockReturnValue(ttlDays) };
}

function buildSessionTokenService() {
  return {
    generateRawToken: jest.fn().mockReturnValue(RAW_TOKEN),
    hashToken: jest.fn().mockReturnValue(TOKEN_HASH),
  };
}

describe('StaffInvitationsService', () => {
  describe('Restaurant-scoped authority', () => {
    it('2. restaurantId comes only from the authorized scope passed in', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      const identityArgs = mock.branchFindMany.mock.calls[0][0];
      expect(identityArgs.where.restaurantId).toBe(RESTAURANT_ID);
      const createArgs = mock.invitationCreate.mock.calls[0][0];
      expect(createArgs.data.restaurantId).toBe(RESTAURANT_ID);
    });

    it('3. invitedByUserId comes only from the authenticated caller passed in', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      const createArgs = mock.invitationCreate.mock.calls[0][0];
      expect(createArgs.data.invitedByUserId).toBe(INVITER_USER_ID);
    });

    it('1. normalized email is persisted, and echoed back unchanged (already-normalized input)', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      const createArgs = mock.invitationCreate.mock.calls[0][0];
      expect(createArgs.data.emailNormalized).toBe('manager@example.test');
      expect(result.outcome).toBe('created');
      if (result.outcome === 'created') {
        expect(result.data.email).toBe('manager@example.test');
      }
    });
  });

  describe('Inviter Branch grant authority', () => {
    function scopedService(mock: ReturnType<typeof buildPrismaMock>) {
      return new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );
    }

    it('4. allBranches=true caller may grant target allBranches=true', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
        { id: BRANCH_B, name: 'Branch B', status: 'INACTIVE' },
      ]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: true,
        allBranches: true,
        branchIds: [],
      });

      expect(result.outcome).toBe('created');
      expect(mock.membershipBranchFindMany).not.toHaveBeenCalled();
    });

    it('5. allBranches=true caller may grant a selected same-Restaurant Branch subset', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: true,
        allBranches: false,
        branchIds: [BRANCH_A],
      });

      expect(result.outcome).toBe('created');
      // A Restaurant-wide caller's own scope is never checked.
      expect(mock.membershipBranchFindMany).not.toHaveBeenCalled();
    });

    it('6. Branch-scoped caller may grant an equal Branch set', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
        { id: BRANCH_B, name: 'Branch B', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: false,
        allBranches: false,
        branchIds: [BRANCH_A, BRANCH_B],
      });

      expect(result.outcome).toBe('created');
    });

    it('7. Branch-scoped caller may grant a proper subset', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: false,
        allBranches: false,
        branchIds: [BRANCH_A],
      });

      expect(result.outcome).toBe('created');
    });

    it('8. Branch-scoped caller cannot grant a Branch outside their scope', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
        { id: BRANCH_C_OUT_OF_SCOPE, name: 'Branch C', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: false,
        allBranches: false,
        branchIds: [BRANCH_A, BRANCH_C_OUT_OF_SCOPE],
      });

      expect(result).toEqual({ outcome: 'scopeExceedsAuthority' });
      expect(mock.invitationCreate).not.toHaveBeenCalled();
    });

    it('9. Branch-scoped caller cannot grant allBranches=true', async () => {
      const mock = buildPrismaMock();
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: false,
        allBranches: true,
        branchIds: [],
      });

      expect(result).toEqual({ outcome: 'scopeExceedsAuthority' });
      expect(mock.branchFindMany).not.toHaveBeenCalled();
      expect(mock.invitationCreate).not.toHaveBeenCalled();
    });

    it('10. caller Branch-scope resolution uses the same-Restaurant defense-in-depth query shape', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = scopedService(mock);

      await service.createInvitation(SCOPED_INPUT);

      const args = mock.membershipBranchFindMany.mock.calls[0][0];
      expect(args.where).toEqual({
        restaurantMembershipId: CALLER_MEMBERSHIP_ID,
        branch: { restaurantId: RESTAURANT_ID },
      });
    });

    it('10b. authority comparison uses the canonical DB-returned Branch id, not the raw request casing -- a differently-cased request for an assigned Branch is authorized', async () => {
      const mock = buildPrismaMock();
      const requestedUpperCase = BRANCH_A.toUpperCase();
      // The identity query resolves the requested (uppercase) id to the
      // canonical (lowercase) Branch row, exactly as PostgreSQL/Prisma
      // would for a case-insensitively-supplied UUID.
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = scopedService(mock);

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: false,
        allBranches: false,
        branchIds: [requestedUpperCase],
      });

      expect(result.outcome).toBe('created');
    });
  });

  describe('Branch identity', () => {
    function scopedService(mock: ReturnType<typeof buildPrismaMock>) {
      return new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );
    }

    it('11. requested unknown Branch -> branchNotFound', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([]); // matches zero of the requested ids
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'branchNotFound' });
      expect(mock.invitationCreate).not.toHaveBeenCalled();
    });

    it('12. requested foreign-Restaurant Branch produces the identical branchNotFound outcome', async () => {
      const mock = buildPrismaMock();
      // The query itself is Restaurant-scoped, so a foreign-Restaurant
      // Branch id simply never appears in the result -- same as unknown.
      mock.branchFindMany.mockResolvedValue([]);
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'branchNotFound' });
    });

    it('12b. identity check happens before authority disclosure -- caller Branch scope is never queried on branchNotFound', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([]);
      const service = scopedService(mock);

      await service.createInvitation(SCOPED_INPUT);

      expect(mock.membershipBranchFindMany).not.toHaveBeenCalled();
    });

    it('13. ACTIVE and INACTIVE same-Restaurant Branches are both valid grants', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'INACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
    });
  });

  describe('Existing Membership / Invitation conflicts', () => {
    function scopedService(mock: ReturnType<typeof buildPrismaMock>) {
      return new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );
    }

    function readyMock() {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      return mock;
    }

    it('14. existing ACTIVE Membership -> conflict', async () => {
      const mock = readyMock();
      mock.membershipFindFirst.mockResolvedValue({ id: 'existing' });
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'conflict' });
      expect(mock.invitationCreate).not.toHaveBeenCalled();
    });

    it('15. existing INVITED Membership -> same conflict (status is never distinguished)', async () => {
      const mock = readyMock();
      mock.membershipFindFirst.mockResolvedValue({ id: 'existing' });
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'conflict' });
    });

    it('16. existing DISABLED Membership -> same conflict', async () => {
      const mock = readyMock();
      mock.membershipFindFirst.mockResolvedValue({ id: 'existing' });
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'conflict' });
    });

    it('17. the Membership check is Tenant-scoped by the query itself, never a global User fetch', async () => {
      const mock = readyMock();
      const service = scopedService(mock);

      await service.createInvitation(SCOPED_INPUT);

      const args = mock.membershipFindFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        restaurantId: RESTAURANT_ID,
        user: { emailNormalized: 'manager@example.test' },
      });
    });

    it('18. no existing Membership and no existing User does not cause any User row to be created (no `user` delegate exists on the mock)', async () => {
      const mock = readyMock();
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
    });

    it('19. an existing pending Invitation -> conflict', async () => {
      const mock = readyMock();
      mock.invitationFindFirst.mockResolvedValue({ id: 'pending' });
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'conflict' });
      expect(mock.invitationCreate).not.toHaveBeenCalled();
    });

    it('pending-Invitation query uses acceptedAt/revokedAt/expiresAt filters', async () => {
      const mock = readyMock();
      const service = scopedService(mock);

      await service.createInvitation(SCOPED_INPUT);

      const args = mock.invitationFindFirst.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({
          restaurantId: RESTAURANT_ID,
          emailNormalized: 'manager@example.test',
          acceptedAt: null,
          revokedAt: null,
        }),
      );
      const expiresAtFilter = args.where.expiresAt as { gt: Date };
      expect(expiresAtFilter.gt).toBeInstanceOf(Date);
    });

    it('20/21/22. an expired/revoked/accepted prior Invitation does not block (findFirst simply returns null for those)', async () => {
      const mock = readyMock();
      mock.invitationFindFirst.mockResolvedValue(null);
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
    });

    it('23. self-invitation is not special-cased -- it resolves through the same existing-Membership conflict path', async () => {
      const mock = readyMock();
      mock.membershipFindFirst.mockResolvedValue({ id: 'self-membership' });
      const service = scopedService(mock);

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result).toEqual({ outcome: 'conflict' });
    });
  });

  describe('Token', () => {
    function readyMock() {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      return mock;
    }

    it('24/25. tokenHash is persisted, raw token is not; the returned raw token hashes to the persisted tokenHash', async () => {
      const mock = readyMock();
      const sessionTokenService = buildSessionTokenService();
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        sessionTokenService as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      const createArgs = mock.invitationCreate.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(TOKEN_HASH);
      expect(createArgs.data).not.toHaveProperty('invitationToken');
      expect(createArgs.data).not.toHaveProperty('token');
      expect(sessionTokenService.hashToken).toHaveBeenCalledWith(RAW_TOKEN);
      expect(result.outcome).toBe('created');
      if (result.outcome === 'created') {
        expect(result.data.invitationToken).toBe(RAW_TOKEN);
      }
    });

    it('26. expiry uses the configured RESTAURANT_INVITATION_TTL_DAYS', async () => {
      const mock = readyMock();
      const configService = buildConfigService(14);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        configService as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      expect(configService.get).toHaveBeenCalledWith(
        'RESTAURANT_INVITATION_TTL_DAYS',
        { infer: true },
      );
      const createArgs = mock.invitationCreate.mock.calls[0][0];
      const expiresAt = createArgs.data.expiresAt as Date;
      const daysFromNow =
        (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysFromNow).toBeGreaterThan(13.9);
      expect(daysFromNow).toBeLessThan(14.1);
    });
  });

  describe('Persistence shape', () => {
    it('27. Invitation + InvitationBranch creation both happen inside the same transaction client', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      expect(mock.invitationCreate).toHaveBeenCalledTimes(1);
      expect(mock.invitationBranchCreateMany).toHaveBeenCalledTimes(1);
      const branchArgs = mock.invitationBranchCreateMany.mock.calls[0][0];
      expect(branchArgs.data).toEqual([
        { restaurantInvitationId: INVITATION_ID, branchId: BRANCH_A },
      ]);
    });

    it('28. allBranches=true creates zero RestaurantInvitationBranch rows', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
        { id: BRANCH_B, name: 'Branch B', status: 'ACTIVE' },
      ]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation({
        ...SCOPED_INPUT,
        inviterAllBranches: true,
        allBranches: true,
        branchIds: [],
      });

      expect(mock.invitationBranchCreateMany).not.toHaveBeenCalled();
      expect(result.outcome).toBe('created');
      if (result.outcome === 'created') {
        expect(result.data.branches).toEqual([
          { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
          { id: BRANCH_B, name: 'Branch B', status: 'ACTIVE' },
        ]);
      }
    });

    it('29. allBranches=false creates exactly the requested validated rows', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
        { id: BRANCH_B, name: 'Branch B', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation({
        ...SCOPED_INPUT,
        branchIds: [BRANCH_A, BRANCH_B],
      });

      const branchArgs = mock.invitationBranchCreateMany.mock.calls[0][0];
      expect(branchArgs.data.map((row) => row.branchId).sort()).toEqual(
        [BRANCH_A, BRANCH_B].sort(),
      );
    });

    it('30. output Branch ordering is requested id ASC from the database', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      const args = mock.branchFindMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ id: 'asc' });
    });

    it('31. exact safe response fields only', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
      if (result.outcome === 'created') {
        expect(Object.keys(result.data).sort()).toEqual(
          [
            'id',
            'email',
            'role',
            'allBranches',
            'branches',
            'expiresAt',
            'invitationToken',
          ].sort(),
        );
      }
    });

    it('32/33/34. no User, RestaurantMembership, or RestaurantMembershipBranch write is ever attempted', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      // The mock tx client has no `create`/`update` on `restaurantMembership`
      // or `restaurantMembershipBranch`, and no `user` delegate at all -- if
      // the service had attempted any such write, this call would have
      // thrown a TypeError instead of resolving `created`.
      expect(result.outcome).toBe('created');
    });
  });

  describe('SERIALIZABLE transaction + retry', () => {
    it('35. uses a SERIALIZABLE isolation level transaction', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await service.createInvitation(SCOPED_INPUT);

      expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('36. a P2034 serialization conflict is retried, succeeding on a later attempt (max 3 total attempts)', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      mock.$transaction
        .mockImplementationOnce(() =>
          Promise.reject(fakeSerializationConflict()),
        )
        .mockImplementationOnce(() =>
          Promise.reject(fakeSerializationConflict()),
        )
        .mockImplementationOnce(
          (callback: (tx: typeof mock.txClient) => unknown) =>
            Promise.resolve(callback(mock.txClient)),
        );
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
      expect(mock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('36b. exceeding the maximum attempts (all 3 fail with P2034) propagates the last error', async () => {
      const mock = buildPrismaMock();
      mock.$transaction.mockImplementation(() =>
        Promise.reject(fakeSerializationConflict()),
      );
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await expect(
        service.createInvitation(SCOPED_INPUT),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(mock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('37. a non-P2034 error is not retried', async () => {
      const mock = buildPrismaMock();
      const unexpected = new Error('connection reset');
      mock.$transaction.mockImplementation(() => Promise.reject(unexpected));
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      await expect(service.createInvitation(SCOPED_INPUT)).rejects.toBe(
        unexpected,
      );
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('38. no raw SQL is used ($queryRaw/$executeRaw are never present on the mock)', async () => {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        { id: BRANCH_A, name: 'Branch A', status: 'ACTIVE' },
      ]);
      mock.membershipBranchFindMany.mockResolvedValue([{ branchId: BRANCH_A }]);
      const service = new StaffInvitationsService(
        mock.prisma as never,
        buildConfigService() as never,
        buildSessionTokenService() as never,
      );

      const result = await service.createInvitation(SCOPED_INPUT);

      expect(result.outcome).toBe('created');
      expect(mock.prisma).not.toHaveProperty('$queryRaw');
      expect(mock.prisma).not.toHaveProperty('$executeRaw');
    });
  });
});
