import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { SessionTokenService } from '../auth/session/session-token.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { BranchStatus } from '../generated/prisma/client';
import type { InvitableRole } from './dto/create-staff-invitation.dto';

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

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

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
    let validatedBranches: CreatedStaffInvitationBranch[] = [];

    if (!input.allBranches) {
      // Branch identity check happens BEFORE inviter-scope authority
      // disclosure (settled contract #10): an unknown or foreign-Restaurant
      // Branch id always produces `branchNotFound`, regardless of whether
      // the caller would also have lacked authority over it.
      const branches = await tx.branch.findMany({
        where: {
          id: { in: input.branchIds },
          restaurantId: input.restaurantId,
        },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, status: true },
      });

      if (branches.length !== input.branchIds.length) {
        return { outcome: 'branchNotFound' };
      }

      // Inviter Branch grant authority (settled contract #9), SECURITY
      // CRITICAL: a Branch-scoped caller may only grant a Branch set that is
      // an exact subset of their own CURRENT valid same-Restaurant Branch
      // assignments -- re-read from current DB state inside this same
      // transaction, using the established #61A same-Restaurant
      // defense-in-depth pattern, never trusted from stale/client state.
      if (!input.inviterAllBranches) {
        const callerAssignments = await tx.restaurantMembershipBranch.findMany({
          where: {
            restaurantMembershipId: input.inviterMembershipId,
            branch: { restaurantId: input.restaurantId },
          },
          select: { branchId: true },
        });
        const callerBranchIds = new Set(
          callerAssignments.map((assignment) => assignment.branchId),
        );
        // Authorize against the canonical Branch ids the identity query
        // already resolved (`branches`), never the raw request strings --
        // a well-formed UUID may be submitted with different letter casing
        // than the canonical value PostgreSQL/Prisma returns, and
        // `Set.has()` is a case-sensitive JavaScript string comparison.
        const exceedsAuthority = branches.some(
          (branch) => !callerBranchIds.has(branch.id),
        );
        if (exceedsAuthority) {
          return { outcome: 'scopeExceedsAuthority' };
        }
      }

      validatedBranches = branches;
    } else if (!input.inviterAllBranches) {
      // A Branch-scoped caller can never grant allBranches=true, regardless
      // of Role or `users.manage` (settled contract #9).
      return { outcome: 'scopeExceedsAuthority' };
    }

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
}
