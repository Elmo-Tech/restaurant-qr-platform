import { Prisma } from '../../generated/prisma/client';
import {
  InvitationAcceptanceService,
  type AcceptInvitationInput,
} from './invitation-acceptance.service';

const RAW_TOKEN = 'raw-token-value';
const TOKEN_HASH = 'hashed-token-value';
const HASHED_PASSWORD = 'argon2id-hash-of-submitted-password';
const PASSWORD = 'correct horse battery staple';

const INVITATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESTAURANT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVITER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INVITER_MEMBERSHIP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EMAIL_NORMALIZED = 'invitee@example.test';
const NEW_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EXISTING_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const MEMBERSHIP_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_A = '22222222-2222-4222-8222-222222222222';
const BRANCH_B = '33333333-3333-4333-8333-333333333333';

const INPUT: AcceptInvitationInput = { token: RAW_TOKEN, password: PASSWORD };

interface InvitationRow {
  id: string;
  restaurantId: string;
  emailNormalized: string;
  role: string;
  allBranches: boolean;
  invitedByUserId: string;
}

function defaultInvitation(
  overrides: Partial<InvitationRow> = {},
): InvitationRow {
  return {
    id: INVITATION_ID,
    restaurantId: RESTAURANT_ID,
    emailNormalized: EMAIL_NORMALIZED,
    role: 'WAITER',
    allBranches: true,
    invitedByUserId: INVITER_USER_ID,
    ...overrides,
  };
}

/**
 * Isolates the one unavoidable `any`-erasure point (a bare `jest.fn()`'s
 * `.mock.calls` is untyped) behind a single typed helper, rather than
 * repeating an inline cast at every call site.
 */
function firstCallArgs(mockFn: jest.Mock): Record<string, unknown> {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0][0] as Record<string, unknown>;
}

function fakeSerializationConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    { code: 'P2034', clientVersion: '7.10.0' },
  );
}

function fakeUniqueViolation(constraintIndex: string) {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the constraint: \`${constraintIndex}\``,
    {
      code: 'P2002',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23505',
            originalMessage: `duplicate key value violates unique constraint "${constraintIndex}"`,
            constraint: { index: constraintIndex },
          },
        },
      },
    },
  );
}

function buildPrismaMock() {
  const invitationFindFirst = jest.fn();
  const invitationUpdateMany = jest.fn();
  const restaurantFindUnique = jest.fn();
  const invitationBranchCount = jest.fn();
  const invitationBranchFindMany = jest.fn();
  const membershipFindFirst = jest.fn();
  const membershipCreate = jest.fn();
  const membershipBranchFindMany = jest.fn();
  const membershipBranchCreateMany = jest.fn();
  const userCreate = jest.fn();

  const state = {
    invitation: defaultInvitation() as InvitationRow | null,
    restaurant: { status: 'ACTIVE' } as { status: string } | null,
    invitationBranchTotalCount: 0,
    invitationBranchValidRows: [] as { branchId: string }[],
    inviterUser: { status: 'ACTIVE' } as { status: string } | null,
    inviterMembership: {
      id: INVITER_MEMBERSHIP_ID,
      role: 'MANAGER',
      allBranches: true,
    } as { id: string; role: string; allBranches: boolean } | null,
    inviterBranchAssignments: [] as { branchId: string }[],
    targetUser: null as {
      id: string;
      status: string;
      passwordHash: string;
    } | null,
    targetMembership: null as { id: string } | null,
    updateManyCount: 1,
  };

  invitationFindFirst.mockImplementation(() =>
    Promise.resolve(state.invitation),
  );
  invitationUpdateMany.mockImplementation(() =>
    Promise.resolve({ count: state.updateManyCount }),
  );
  restaurantFindUnique.mockImplementation(() =>
    Promise.resolve(state.restaurant),
  );
  invitationBranchCount.mockImplementation(() =>
    Promise.resolve(state.invitationBranchTotalCount),
  );
  invitationBranchFindMany.mockImplementation(() =>
    Promise.resolve(state.invitationBranchValidRows),
  );
  membershipBranchCreateMany.mockResolvedValue({ count: 0 });

  const userFindUnique = jest.fn((args: { where: Record<string, unknown> }) => {
    if (args.where.id !== undefined) {
      return Promise.resolve(state.inviterUser);
    }
    return Promise.resolve(state.targetUser);
  });

  membershipFindFirst.mockImplementation(
    (args: { where: Record<string, unknown> }) => {
      if (args.where.status === 'ACTIVE') {
        return Promise.resolve(state.inviterMembership);
      }
      return Promise.resolve(state.targetMembership);
    },
  );
  membershipBranchFindMany.mockImplementation(() =>
    Promise.resolve(state.inviterBranchAssignments),
  );
  userCreate.mockResolvedValue({ id: NEW_USER_ID });
  membershipCreate.mockResolvedValue({ id: MEMBERSHIP_ID });

  const txClient = {
    restaurantInvitation: {
      findFirst: invitationFindFirst,
      updateMany: invitationUpdateMany,
    },
    restaurant: { findUnique: restaurantFindUnique },
    restaurantInvitationBranch: {
      count: invitationBranchCount,
      findMany: invitationBranchFindMany,
    },
    user: { findUnique: userFindUnique, create: userCreate },
    restaurantMembership: {
      findFirst: membershipFindFirst,
      create: membershipCreate,
    },
    restaurantMembershipBranch: {
      findMany: membershipBranchFindMany,
      createMany: membershipBranchCreateMany,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: { $transaction },
    $transaction,
    state,
    invitationFindFirst,
    invitationUpdateMany,
    restaurantFindUnique,
    invitationBranchCount,
    invitationBranchFindMany,
    userFindUnique,
    userCreate,
    membershipFindFirst,
    membershipCreate,
    membershipBranchFindMany,
    membershipBranchCreateMany,
    txClient,
  };
}

function buildSessionTokenService(wellFormed = true) {
  return {
    isWellFormedRawToken: jest.fn().mockReturnValue(wellFormed),
    hashToken: jest.fn().mockReturnValue(TOKEN_HASH),
  };
}

function buildPasswordHasherService(
  overrides: {
    verifyResult?: boolean;
    hashPasswordResult?: string;
  } = {},
) {
  return {
    verifyPassword: jest.fn().mockResolvedValue(overrides.verifyResult ?? true),
    hashPassword: jest
      .fn()
      .mockResolvedValue(overrides.hashPasswordResult ?? HASHED_PASSWORD),
  };
}

function buildService(
  mock: ReturnType<typeof buildPrismaMock>,
  sessionTokenService = buildSessionTokenService(),
  passwordHasherService = buildPasswordHasherService(),
) {
  return new InvitationAcceptanceService(
    mock.prisma as never,
    sessionTokenService as never,
    passwordHasherService,
  );
}

describe('InvitationAcceptanceService', () => {
  describe('TOKEN', () => {
    it('malformed token -> invitationNotFound, no transaction opened', async () => {
      const mock = buildPrismaMock();
      const sessionTokenService = buildSessionTokenService(false);
      const service = buildService(mock, sessionTokenService);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('unknown/expired/revoked/accepted token (findFirst resolves null via the pending-state where clause) -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = null;
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('lookup is by tokenHash only, never the raw token', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = null;
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.invitationFindFirst) as {
        where: Record<string, unknown>;
      };
      expect(args.where).toEqual(
        expect.objectContaining({
          tokenHash: TOKEN_HASH,
          acceptedAt: null,
          revokedAt: null,
        }),
      );
      expect(args.where).not.toHaveProperty('token');
    });

    it('corrupt/unsupported stored Role (e.g. historical OWNER) -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ role: 'OWNER' });
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });
  });

  describe('RESTAURANT', () => {
    it('ACTIVE Restaurant proceeds', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
    });

    it.each(['INACTIVE', 'SUSPENDED'])(
      '%s Restaurant -> restaurantNotOperational, Invitation left unconsumed',
      async (status) => {
        const mock = buildPrismaMock();
        mock.state.restaurant = { status };
        const service = buildService(mock);

        const result = await service.acceptInvitation(INPUT);

        expect(result).toEqual({ outcome: 'restaurantNotOperational' });
        expect(mock.invitationUpdateMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('NEW USER', () => {
    it('creates exactly one User with normalized email, hashed password, ACTIVE, null preferredLocale', async () => {
      const mock = buildPrismaMock();
      const passwordHasherService = buildPasswordHasherService({
        hashPasswordResult: HASHED_PASSWORD,
      });
      const service = buildService(mock, undefined, passwordHasherService);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.userCreate).toHaveBeenCalledTimes(1);
      expect(passwordHasherService.hashPassword).toHaveBeenCalledWith(PASSWORD);
      const createArgs = firstCallArgs(mock.userCreate) as {
        data: Record<string, unknown>;
      };
      expect(createArgs.data).toEqual({
        email: EMAIL_NORMALIZED,
        emailNormalized: EMAIL_NORMALIZED,
        passwordHash: HASHED_PASSWORD,
        status: 'ACTIVE',
        preferredLocale: null,
      });
    });

    it('resulting Membership uses the new User id, Role/allBranches copied from Invitation, status ACTIVE', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({
        role: 'MANAGER',
        allBranches: true,
      });
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.membershipCreate) as {
        data: Record<string, unknown>;
      };
      expect(args.data).toEqual({
        restaurantId: RESTAURANT_ID,
        userId: NEW_USER_ID,
        role: 'MANAGER',
        allBranches: true,
        status: 'ACTIVE',
      });
    });
  });

  describe('EXISTING ACTIVE USER', () => {
    function scopedMockWithExistingUser() {
      const mock = buildPrismaMock();
      mock.state.targetUser = {
        id: EXISTING_USER_ID,
        status: 'ACTIVE',
        passwordHash: 'stored-hash',
      };
      return mock;
    }

    it('correct password succeeds, no duplicate User created', async () => {
      const mock = scopedMockWithExistingUser();
      const passwordHasherService = buildPasswordHasherService({
        verifyResult: true,
      });
      const service = buildService(mock, undefined, passwordHasherService);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.userCreate).not.toHaveBeenCalled();
      expect(passwordHasherService.verifyPassword).toHaveBeenCalledWith(
        PASSWORD,
        'stored-hash',
      );
    });

    it('wrong password -> invalidCredentials, no mutation performed', async () => {
      const mock = scopedMockWithExistingUser();
      const passwordHasherService = buildPasswordHasherService({
        verifyResult: false,
      });
      const service = buildService(mock, undefined, passwordHasherService);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invalidCredentials' });
      expect(mock.invitationUpdateMany).not.toHaveBeenCalled();
      expect(mock.membershipCreate).not.toHaveBeenCalled();
    });

    it('Membership uses the EXISTING User id, never creates a second User', async () => {
      const mock = scopedMockWithExistingUser();
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.membershipCreate) as {
        data: { userId: string };
      };
      expect(args.data.userId).toBe(EXISTING_USER_ID);
      expect(mock.userCreate).not.toHaveBeenCalled();
    });
  });

  describe('EXISTING GLOBAL USER STATUS', () => {
    it.each(['INVITED', 'DISABLED'])(
      'existing global User %s -> invitationNotFound, no password check performed',
      async (status) => {
        const mock = buildPrismaMock();
        mock.state.targetUser = {
          id: EXISTING_USER_ID,
          status,
          passwordHash: 'stored-hash',
        };
        const passwordHasherService = buildPasswordHasherService();
        const service = buildService(mock, undefined, passwordHasherService);

        const result = await service.acceptInvitation(INPUT);

        expect(result).toEqual({ outcome: 'invitationNotFound' });
        expect(passwordHasherService.verifyPassword).not.toHaveBeenCalled();
      },
    );
  });

  describe('TARGET MEMBERSHIP already exists', () => {
    it.each(['ACTIVE', 'INVITED', 'DISABLED'])(
      'existing target-Restaurant Membership status=%s -> invitationNotFound, no mutation',
      async () => {
        const mock = buildPrismaMock();
        mock.state.targetUser = {
          id: EXISTING_USER_ID,
          status: 'ACTIVE',
          passwordHash: 'stored-hash',
        };
        mock.state.targetMembership = { id: 'existing-membership' };
        const service = buildService(mock);

        const result = await service.acceptInvitation(INPUT);

        expect(result).toEqual({ outcome: 'invitationNotFound' });
        expect(mock.invitationUpdateMany).not.toHaveBeenCalled();
        expect(mock.membershipCreate).not.toHaveBeenCalled();
      },
    );
  });

  describe('INVITER current authority revalidation', () => {
    it('current ACTIVE inviter with users.manage and allBranches=true authorizes any grant', async () => {
      const mock = buildPrismaMock();
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'MANAGER',
        allBranches: true,
      };
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
    });

    it('Branch-scoped inviter with exact/equal Branch scope authorizes a matching scoped Invitation', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({
        allBranches: false,
      });
      mock.state.invitationBranchTotalCount = 1;
      mock.state.invitationBranchValidRows = [{ branchId: BRANCH_A }];
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'MANAGER',
        allBranches: false,
      };
      mock.state.inviterBranchAssignments = [{ branchId: BRANCH_A }];
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
    });

    it('Branch-scoped inviter authorizes a proper-subset scoped Invitation', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 1;
      mock.state.invitationBranchValidRows = [{ branchId: BRANCH_A }];
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'MANAGER',
        allBranches: false,
      };
      mock.state.inviterBranchAssignments = [
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ];
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
    });

    it('inviter who has since lost the granted Branch -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 1;
      mock.state.invitationBranchValidRows = [{ branchId: BRANCH_A }];
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'MANAGER',
        allBranches: false,
      };
      mock.state.inviterBranchAssignments = [{ branchId: BRANCH_B }];
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('Branch-scoped inviter cannot authorize an allBranches=true Invitation', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: true });
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'MANAGER',
        allBranches: false,
      };
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('inviter Membership no longer ACTIVE (disabled) -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.inviterMembership = null;
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('inviter global User no longer ACTIVE -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.inviterUser = { status: 'DISABLED' };
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('inviter current Role no longer holds users.manage -> invitationNotFound', async () => {
      const mock = buildPrismaMock();
      mock.state.inviterMembership = {
        id: INVITER_MEMBERSHIP_ID,
        role: 'WAITER',
        allBranches: true,
      };
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });
  });

  describe('BRANCH materialization', () => {
    it('allBranches=true with zero InvitationBranch rows -> zero MembershipBranch rows created, Membership.allBranches=true', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: true });
      mock.state.invitationBranchTotalCount = 0;
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.membershipBranchCreateMany).not.toHaveBeenCalled();
    });

    it('allBranches=true with contradictory InvitationBranch rows -> fails closed', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: true });
      mock.state.invitationBranchTotalCount = 1;
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });

    it('allBranches=false materializes exactly the validated Branch rows', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 2;
      mock.state.invitationBranchValidRows = [
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ];
      mock.state.inviterBranchAssignments = [
        { branchId: BRANCH_A },
        { branchId: BRANCH_B },
      ];
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.membershipBranchCreateMany) as {
        data: { restaurantMembershipId: string; branchId: string }[];
      };
      expect(args.data.map((row) => row.branchId).sort()).toEqual(
        [BRANCH_A, BRANCH_B].sort(),
      );
      expect(
        args.data.every((row) => row.restaurantMembershipId === MEMBERSHIP_ID),
      ).toBe(true);
    });

    it('allBranches=false same-Restaurant defense-in-depth query shape', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 1;
      mock.state.invitationBranchValidRows = [{ branchId: BRANCH_A }];
      mock.state.inviterBranchAssignments = [{ branchId: BRANCH_A }];
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.invitationBranchFindMany) as {
        where: Record<string, unknown>;
      };
      expect(args.where).toEqual({
        restaurantInvitationId: INVITATION_ID,
        branch: { restaurantId: RESTAURANT_ID },
      });
    });

    it('allBranches=false with zero valid same-Restaurant rows -> fails closed, never widens to allBranches=true', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 0;
      mock.state.invitationBranchValidRows = [];
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
      expect(mock.membershipCreate).not.toHaveBeenCalled();
    });

    it('allBranches=false with a malformed cross-Restaurant row (total != valid) -> fails closed', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = defaultInvitation({ allBranches: false });
      mock.state.invitationBranchTotalCount = 2; // one row points at a foreign Restaurant
      mock.state.invitationBranchValidRows = [{ branchId: BRANCH_A }];
      mock.state.inviterBranchAssignments = [{ branchId: BRANCH_A }];
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
    });
  });

  describe('CONSUMPTION', () => {
    it('conditional acceptedAt update uses the exact pending predicate', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      const args = firstCallArgs(mock.invitationUpdateMany) as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(args.where).toEqual(
        expect.objectContaining({
          id: INVITATION_ID,
          acceptedAt: null,
          revokedAt: null,
        }),
      );
      expect(args.data).toHaveProperty('acceptedAt');
    });

    it('a losing concurrent consumption (updateMany matches zero rows) -> invitationNotFound, no further mutation', async () => {
      const mock = buildPrismaMock();
      mock.state.updateManyCount = 0;
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result).toEqual({ outcome: 'invitationNotFound' });
      expect(mock.userCreate).not.toHaveBeenCalled();
      expect(mock.membershipCreate).not.toHaveBeenCalled();
    });
  });

  describe('TRANSACTION / retry', () => {
    it('uses a SERIALIZABLE isolation level transaction', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.acceptInvitation(INPUT);

      expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('a P2034 serialization conflict is retried, succeeding on a later attempt (max 3 total attempts)', async () => {
      const mock = buildPrismaMock();
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
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('a retryable users_email_normalized_key P2002 race is retried', async () => {
      const mock = buildPrismaMock();
      mock.$transaction
        .mockImplementationOnce(() =>
          Promise.reject(fakeUniqueViolation('users_email_normalized_key')),
        )
        .mockImplementationOnce(
          (callback: (tx: typeof mock.txClient) => unknown) =>
            Promise.resolve(callback(mock.txClient)),
        );
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.$transaction).toHaveBeenCalledTimes(2);
    });

    it('a retryable restaurant_memberships_restaurant_id_user_id_key P2002 race is retried', async () => {
      const mock = buildPrismaMock();
      mock.$transaction
        .mockImplementationOnce(() =>
          Promise.reject(
            fakeUniqueViolation(
              'restaurant_memberships_restaurant_id_user_id_key',
            ),
          ),
        )
        .mockImplementationOnce(
          (callback: (tx: typeof mock.txClient) => unknown) =>
            Promise.resolve(callback(mock.txClient)),
        );
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.$transaction).toHaveBeenCalledTimes(2);
    });

    it('an unrelated P2002 (different constraint) is never treated as retryable', async () => {
      const mock = buildPrismaMock();
      const unrelated = fakeUniqueViolation('qr_codes_public_code_key');
      mock.$transaction.mockImplementation(() => Promise.reject(unrelated));
      const service = buildService(mock);

      await expect(service.acceptInvitation(INPUT)).rejects.toBe(unrelated);
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('exceeding the maximum attempts (all 3 fail with P2034) propagates the last error', async () => {
      const mock = buildPrismaMock();
      mock.$transaction.mockImplementation(() =>
        Promise.reject(fakeSerializationConflict()),
      );
      const service = buildService(mock);

      await expect(service.acceptInvitation(INPUT)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(mock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('a non-retryable error is not retried', async () => {
      const mock = buildPrismaMock();
      const unexpected = new Error('connection reset');
      mock.$transaction.mockImplementation(() => Promise.reject(unexpected));
      const service = buildService(mock);

      await expect(service.acceptInvitation(INPUT)).rejects.toBe(unexpected);
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('no raw SQL is used ($queryRaw/$executeRaw are never present on the mock)', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.acceptInvitation(INPUT);

      expect(result.outcome).toBe('accepted');
      expect(mock.prisma).not.toHaveProperty('$queryRaw');
      expect(mock.prisma).not.toHaveProperty('$executeRaw');
    });
  });

  describe('SECURITY / password work order', () => {
    it('password is never hashed/verified before the Invitation, Restaurant, Branch, and inviter checks pass', async () => {
      const mock = buildPrismaMock();
      mock.state.invitation = null; // unusable token
      const passwordHasherService = buildPasswordHasherService();
      const service = buildService(mock, undefined, passwordHasherService);

      await service.acceptInvitation(INPUT);

      expect(passwordHasherService.hashPassword).not.toHaveBeenCalled();
      expect(passwordHasherService.verifyPassword).not.toHaveBeenCalled();
    });
  });
});
