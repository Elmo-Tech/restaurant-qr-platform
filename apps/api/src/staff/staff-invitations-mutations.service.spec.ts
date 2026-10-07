import { StaffInvitationsService } from './staff-invitations.service';

const RESTAURANT_ID = 'restaurant-1';
const INVITATION_ID = 'invitation-1';

function buildService(prisma: Record<string, unknown>): StaffInvitationsService {
  return new StaffInvitationsService(prisma as never, {} as never, {} as never);
}

describe('StaffInvitationsService.listInvitations', () => {
  it('scopes the query by the exact authorized restaurantId (Tenant isolation)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = buildService({ restaurantInvitation: { findMany } });

    await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: RESTAURANT_ID, acceptedAt: null, revokedAt: null },
      }),
    );
  });

  it('returns an empty array without querying Branches when there are no invitations', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const branchFindMany = jest.fn();
    const service = buildService({
      restaurantInvitation: { findMany },
      branch: { findMany: branchFindMany },
    });

    const result = await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(result).toEqual([]);
    expect(branchFindMany).not.toHaveBeenCalled();
  });

  it('marks an invitation PENDING when expiresAt is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: INVITATION_ID,
        emailNormalized: 'a@example.test',
        role: 'MANAGER',
        allBranches: true,
        createdAt: new Date(),
        expiresAt: future,
      },
    ]);
    const branchFindMany = jest.fn().mockResolvedValue([]);
    const service = buildService({
      restaurantInvitation: { findMany },
      branch: { findMany: branchFindMany },
    });

    const result = await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(result[0].status).toBe('PENDING');
  });

  it('marks an invitation EXPIRED when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 60_000);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: INVITATION_ID,
        emailNormalized: 'a@example.test',
        role: 'MANAGER',
        allBranches: true,
        createdAt: new Date(),
        expiresAt: past,
      },
    ]);
    const branchFindMany = jest.fn().mockResolvedValue([]);
    const service = buildService({
      restaurantInvitation: { findMany },
      branch: { findMany: branchFindMany },
    });

    const result = await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(result[0].status).toBe('EXPIRED');
  });

  it('resolves every Restaurant Branch for an allBranches=true invitation', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: INVITATION_ID,
        emailNormalized: 'a@example.test',
        role: 'MANAGER',
        allBranches: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const branchFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'branch-1', name: 'Main', status: 'ACTIVE' }]);
    const service = buildService({
      restaurantInvitation: { findMany },
      branch: { findMany: branchFindMany },
    });

    const result = await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(result[0].branches).toEqual([{ id: 'branch-1', name: 'Main', status: 'ACTIVE' }]);
  });

  it('resolves exactly the assigned Branches for a scoped invitation', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: INVITATION_ID,
        emailNormalized: 'a@example.test',
        role: 'MANAGER',
        allBranches: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const invitationBranchFindMany = jest.fn().mockResolvedValue([
      {
        restaurantInvitationId: INVITATION_ID,
        branch: { id: 'branch-2', name: 'Downtown', status: 'ACTIVE' },
      },
    ]);
    const service = buildService({
      restaurantInvitation: { findMany },
      restaurantInvitationBranch: { findMany: invitationBranchFindMany },
    });

    const result = await service.listInvitations({ restaurantId: RESTAURANT_ID });

    expect(result[0].branches).toEqual([{ id: 'branch-2', name: 'Downtown', status: 'ACTIVE' }]);
  });

  it('never includes an accepted or revoked invitation (query-level filter)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = buildService({ restaurantInvitation: { findMany } });

    await service.listInvitations({ restaurantId: RESTAURANT_ID });

    const args = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.acceptedAt).toBeNull();
    expect(args.where.revokedAt).toBeNull();
  });
});

describe('StaffInvitationsService.revokeInvitation', () => {
  it('scopes the conditional update by the exact authorized restaurantId (Tenant isolation)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = buildService({ restaurantInvitation: { updateMany } });

    await service.revokeInvitation({ restaurantId: RESTAURANT_ID, invitationId: INVITATION_ID });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: INVITATION_ID, restaurantId: RESTAURANT_ID, acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('returns revoked when the conditional update matched a row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = buildService({ restaurantInvitation: { updateMany } });

    const result = await service.revokeInvitation({ restaurantId: RESTAURANT_ID, invitationId: INVITATION_ID });

    expect(result).toEqual({ outcome: 'revoked' });
  });

  it('returns notFound when the invitation is already accepted, already revoked, unknown, or foreign', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = buildService({ restaurantInvitation: { updateMany } });

    const result = await service.revokeInvitation({ restaurantId: RESTAURANT_ID, invitationId: INVITATION_ID });

    expect(result).toEqual({ outcome: 'notFound' });
  });
});
