import { Injectable } from '@nestjs/common';
import { isSerializationConflict } from '../database/serialization-conflict';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { SessionTokenService } from '../auth/session/session-token.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { BranchStatus } from '../generated/prisma/client';
import type { InvitableRole } from './dto/create-staff-invitation.dto';
import { validateBranchGrant } from './staff-branch-scope';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_TRANSACTION_ATTEMPTS = 3;

export interface CreateStaffInvitationInput {
  restaurantId: string;
  inviterMembershipId: string;
  inviterAllBranches: boolean;
  invitedByUserId: string;
  email: string;
  role: InvitableRole;
  allBranches: boolean;
  branchIds: string[];
}

export interface CreatedStaffInvitationBranch {
  id: string;
  name: string;
  status: BranchStatus;
}

/** The exact safe response shape (Business Foundation S, settled contract #19). Never `restaurantId`, `emailNormalized` (this IS the normalized value under the public name `email`), `tokenHash`, `invitedByUserId`, `acceptedAt`, `revokedAt`, or `createdAt`. */
export interface CreatedStaffInvitation {
  id: string;
  email: string;
  role: InvitableRole;
  allBranches: boolean;
  branches: CreatedStaffInvitationBranch[];
  expiresAt: Date;
  invitationToken: string;
}

/**
 * Business Foundation S, settled result type: a plain outcome, never an HTTP
 * exception -- the controller alone decides how each outcome maps to its
 * HTTP status/body.
 */
export type CreateStaffInvitationResult =
  | { outcome: 'created'; data: CreatedStaffInvitation }
  | { outcome: 'branchNotFound' }
  | { outcome: 'scopeExceedsAuthority' }
  | { outcome: 'conflict' };

export interface ListStaffInvitationsInput {
  restaurantId: string;
}

/**
 * FT-12: one still-relevant (not accepted, not revoked) `RestaurantInvitation`
 * row -- an accepted Invitation is superseded by the real Membership it
 * produced (visible instead via Staff Membership List) and is never shown
 * here; a revoked one is simply gone. `status` is derived, never a stored
 * column (RestaurantInvitation has none, #77) -- `'EXPIRED'` when
 * `expiresAt` has passed, `'PENDING'` otherwise. Never `tokenHash`,
 * `invitedByUserId`, `acceptedAt`, or `revokedAt`.
 */
export interface StaffInvitationListItem {
  id: string;
  email: string;
  role: InvitableRole;
  allBranches: boolean;
  branches: CreatedStaffInvitationBranch[];
  createdAt: Date;
  expiresAt: Date;
  status: 'PENDING' | 'EXPIRED';
}

export interface RevokeStaffInvitationInput {
  restaurantId: string;
  invitationId: string;
}

export type RevokeStaffInvitationResult = { outcome: 'revoked' } | { outcome: 'notFound' };

/**
 * Business Foundation S: Staff Invitation creation. INVITATION-ONLY
 * lifecycle (settled contract #2) -- this service never creates or mutates a
 * `User` or `RestaurantMembership` row of any kind. It persists exactly a
 * `RestaurantInvitation` (+ `RestaurantInvitationBranch` rows when
 * `allBranches = false`) inside one `SERIALIZABLE` transaction, retried up to
 * `MAX_TRANSACTION_ATTEMPTS` times on a Postgres serialization conflict
 * (`P2034`) -- the schema deliberately has no unique constraint on
 * `(restaurantId, emailNormalized)` (DATABASE_SPEC.md #33C), so `SERIALIZABLE`
 * isolation is what makes the duplicate-pending-Invitation check
 * concurrency-safe without a schema migration.
 */
@Injectable()
export class StaffInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async createInvitation(
    input: CreateStaffInvitationInput,
  ): Promise<CreateStaffInvitationResult> {
    let lastConflictError: unknown;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.attemptCreateInvitation(tx, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          isSerializationConflict(error) &&
          attempt < MAX_TRANSACTION_ATTEMPTS
        ) {
          lastConflictError = error;
          continue;
        }
        throw error;
      }
    }

    // Unreachable in practice (the loop always returns or throws), but keeps
    // the function's control flow explicit for TypeScript.
    throw lastConflictError;
  }

  private async attemptCreateInvitation(
    tx: Prisma.TransactionClient,
    input: CreateStaffInvitationInput,
  ): Promise<CreateStaffInvitationResult> {
    // Branch identity + inviter Branch-grant authority (settled contract
    // #9/#10, SECURITY CRITICAL): shared with Staff Membership scope-editing
    // (FT-12) via `validateBranchGrant` -- see that function's docstring.
    const grant = await validateBranchGrant(tx, {
      restaurantId: input.restaurantId,
      granterMembershipId: input.inviterMembershipId,
      granterAllBranches: input.inviterAllBranches,
      allBranches: input.allBranches,
      branchIds: input.branchIds,
    });
    if (grant.outcome === 'branchNotFound') {
      return { outcome: 'branchNotFound' };
    }
    if (grant.outcome === 'scopeExceedsAuthority') {
      return { outcome: 'scopeExceedsAuthority' };
    }
    const validatedBranches: CreatedStaffInvitationBranch[] = input.allBranches ? [] : grant.branches;

    // Tenant-scoped existing-Membership check (settled contract #11):
    // queries RestaurantMembership joined to the invited email directly,
    // scoped to the authorized Restaurant -- never a global User fetch, so
    // this can never reveal whether the email belongs to another Restaurant.
    // ANY existing Membership status (ACTIVE/INVITED/DISABLED) conflicts
    // identically; self-invitation is naturally covered here too, since the
    // caller's own Membership already exists in this Restaurant.
    const existingMembership = await tx.restaurantMembership.findFirst({
      where: {
        restaurantId: input.restaurantId,
        user: { emailNormalized: input.email },
      },
      select: { id: true },
    });
    if (existingMembership) {
      return { outcome: 'conflict' };
    }

    // Existing currently-pending Invitation check (settled contract #12).
    // Historical (accepted/revoked/expired) rows never block a new Create.
    const now = new Date();
    const pendingInvitation = await tx.restaurantInvitation.findFirst({
      where: {
        restaurantId: input.restaurantId,
        emailNormalized: input.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (pendingInvitation) {
      return { outcome: 'conflict' };
    }

    // Token generated inside this transaction attempt (settled contract
    // #14): only the successfully committed attempt's raw token ever leaves
    // this service. Reuses the existing generic SessionTokenService
    // primitive unchanged -- no separate crypto scheme.
    const rawToken = this.sessionTokenService.generateRawToken();
    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    const ttlDays = this.configService.get('RESTAURANT_INVITATION_TTL_DAYS', {
      infer: true,
    });
    const expiresAt = new Date(now.getTime() + ttlDays * MILLISECONDS_PER_DAY);

    const invitation = await tx.restaurantInvitation.create({
      data: {
        restaurantId: input.restaurantId,
        emailNormalized: input.email,
        role: input.role,
        allBranches: input.allBranches,
        tokenHash,
        expiresAt,
        invitedByUserId: input.invitedByUserId,
      },
      select: {
        id: true,
        emailNormalized: true,
        role: true,
        allBranches: true,
        expiresAt: true,
      },
    });

    let branches: CreatedStaffInvitationBranch[];
    if (input.allBranches) {
      // allBranches=true: every Branch belonging to the authorized
      // Restaurant, ACTIVE and INACTIVE, ordered by id ASC. No
      // RestaurantInvitationBranch row is created (settled contract #13).
      branches = await tx.branch.findMany({
        where: { restaurantId: input.restaurantId },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, status: true },
      });
    } else {
      await tx.restaurantInvitationBranch.createMany({
        data: validatedBranches.map((branch) => ({
          restaurantInvitationId: invitation.id,
          branchId: branch.id,
        })),
      });
      branches = validatedBranches;
    }

    return {
      outcome: 'created',
      data: {
        id: invitation.id,
        email: invitation.emailNormalized,
        role: invitation.role as InvitableRole,
        allBranches: invitation.allBranches,
        branches,
        expiresAt: invitation.expiresAt,
        invitationToken: rawToken,
      },
    };
  }

  /**
   * FT-12 (API_CONVENTIONS.md #117, previously "remains unsettled and
   * unimplemented"): lists every still-relevant `RestaurantInvitation` for
   * one Restaurant -- `acceptedAt IS NULL AND revokedAt IS NULL`, regardless
   * of `expiresAt` (an expired-but-not-yet-revoked Invitation still shows,
   * with a derived `'EXPIRED'` status, so Staff can see it needs a fresh
   * Invitation rather than it silently vanishing). Restaurant-scoped at the
   * query itself, exactly like every other Tenant-scoped list in this
   * codebase. No Branch-scoped-caller subset-visibility rule -- unlike Staff
   * Membership List (#117A), an Invitation has no Membership yet to compare
   * scope against; visibility is gated entirely by `users.view` at the
   * Controller.
   */
  async listInvitations(input: ListStaffInvitationsInput): Promise<StaffInvitationListItem[]> {
    const now = new Date();
    const invitations = await this.prisma.restaurantInvitation.findMany({
      where: { restaurantId: input.restaurantId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        emailNormalized: true,
        role: true,
        allBranches: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    if (invitations.length === 0) {
      return [];
    }

    const needsAllBranches = invitations.some((invitation) => invitation.allBranches);
    const scopedInvitationIds = invitations
      .filter((invitation) => !invitation.allBranches)
      .map((invitation) => invitation.id);

    const [restaurantBranches, invitationBranchRows] = await Promise.all([
      needsAllBranches
        ? this.prisma.branch.findMany({
            where: { restaurantId: input.restaurantId },
            orderBy: { id: 'asc' },
            select: { id: true, name: true, status: true },
          })
        : Promise.resolve([]),
      scopedInvitationIds.length > 0
        ? this.prisma.restaurantInvitationBranch.findMany({
            where: {
              restaurantInvitationId: { in: scopedInvitationIds },
              branch: { restaurantId: input.restaurantId },
            },
            orderBy: { branch: { id: 'asc' } },
            select: {
              restaurantInvitationId: true,
              branch: { select: { id: true, name: true, status: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const branchesByInvitationId = new Map<string, CreatedStaffInvitationBranch[]>();
    for (const row of invitationBranchRows) {
      const list = branchesByInvitationId.get(row.restaurantInvitationId) ?? [];
      list.push(row.branch);
      branchesByInvitationId.set(row.restaurantInvitationId, list);
    }

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.emailNormalized,
      role: invitation.role as InvitableRole,
      allBranches: invitation.allBranches,
      branches: invitation.allBranches
        ? restaurantBranches
        : (branchesByInvitationId.get(invitation.id) ?? []),
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      status: invitation.expiresAt > now ? 'PENDING' : 'EXPIRED',
    }));
  }

  /**
   * FT-12: revokes a still-pending Invitation. The conditional `updateMany`
   * (`WHERE acceptedAt IS NULL AND revokedAt IS NULL`) is both the identity
   * check and the one-time-consumption guard in a single atomic statement --
   * an already-accepted or already-revoked Invitation (or an unknown/
   * foreign-Restaurant id) all converge on the identical `notFound` outcome,
   * matching this codebase's established existence-hiding convention. Never
   * touches `acceptedAt`, and never touches any `User`/`RestaurantMembership`
   * row -- revoking an Invitation has no effect on any Membership that may
   * have been created from a DIFFERENT, already-accepted Invitation.
   */
  async revokeInvitation(input: RevokeStaffInvitationInput): Promise<RevokeStaffInvitationResult> {
    const result = await this.prisma.restaurantInvitation.updateMany({
      where: {
        id: input.invitationId,
        restaurantId: input.restaurantId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return result.count > 0 ? { outcome: 'revoked' } : { outcome: 'notFound' };
  }
}
