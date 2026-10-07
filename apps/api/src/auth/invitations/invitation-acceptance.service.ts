import { Injectable } from '@nestjs/common';
import { isSerializationConflict } from '../../database/serialization-conflict';
import { PasswordHasherService } from '../password/password-hasher.service';
import { hasPermission } from '../permission/has-permission';
import { effectiveRolePermissions } from '../permission/role-permissions';
import { PERMISSIONS } from '../permission/permission';
import { SessionTokenService } from '../session/session-token.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  INVITABLE_ROLES,
  type InvitableRole,
} from '../../staff/dto/create-staff-invitation.dto';

const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * The real Postgres unique-index names behind the two constraints a
 * concurrent race during Acceptance could legitimately hit:
 * `User.emailNormalized` (a second concurrent Acceptance/registration for
 * the same brand-new email) and `RestaurantMembership(restaurantId,
 * userId)` (a second concurrent grant for the same target Restaurant).
 * Confirmed directly from the committed migration SQL
 * (`20260830161321_tenant_identity_foundation/migration.sql`):
 * `CREATE UNIQUE INDEX "users_email_normalized_key" ...` and
 * `CREATE UNIQUE INDEX "restaurant_memberships_restaurant_id_user_id_key" ...`.
 * The `meta.driverAdapterError.cause.constraint.index` P2002 shape itself
 * (rather than the classic `meta.target` array) was already empirically
 * verified against this repository's real Prisma 7 + `@prisma/adapter-pg`
 * client for two other constraints (Business Foundation L3/Q) -- this is
 * the same driver-adapter-level behavior, not a per-constraint one, so it
 * is reused here rather than re-verified from scratch.
 */
const RETRYABLE_UNIQUE_CONSTRAINTS = new Set([
  'users_email_normalized_key',
  'restaurant_memberships_restaurant_id_user_id_key',
]);

function isRetryableUniqueRace(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  const constraintIndex = meta?.driverAdapterError?.cause?.constraint?.index;
  return (
    typeof constraintIndex === 'string' &&
    RETRYABLE_UNIQUE_CONSTRAINTS.has(constraintIndex)
  );
}

export function isRetryableConflict(error: unknown): boolean {
  return isSerializationConflict(error) || isRetryableUniqueRace(error);
}

function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
}

/**
 * Business Foundation T, settled result type: a plain outcome, never an
 * HTTP exception -- the controller alone decides how each maps to its HTTP
 * status/body. `invitationNotFound` is the single generic outcome covering
 * every unusable-Invitation/unusable-grant-state reason (settled contract
 * #10) -- it deliberately carries no further detail.
 */
export type AcceptInvitationResult =
  | { outcome: 'accepted' }
  | { outcome: 'invitationNotFound' }
  | { outcome: 'restaurantNotOperational' }
  | { outcome: 'invalidCredentials' };

/**
 * Business Foundation T: Staff Invitation Acceptance. Public, token-authorized
 * (no Staff session of any kind is consulted or required). Consumes exactly
 * one still-pending `RestaurantInvitation` and materializes the resulting
 * Restaurant access (`User` find-or-create, `RestaurantMembership`,
 * `RestaurantMembershipBranch[]`) inside one `SERIALIZABLE` transaction,
 * retried up to `MAX_TRANSACTION_ATTEMPTS` times on a Postgres serialization
 * conflict (P2034) or one of the two specific unique-constraint races a
 * concurrent Acceptance could legitimately produce (P2002) -- the same
 * bounded-retry strategy Business Foundation S already established, reused
 * unchanged in kind (not copied verbatim, since the retryable error set
 * differs here).
 */
@Injectable()
export class InvitationAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly passwordHasherService: PasswordHasherService,
  ) {}

  async acceptInvitation(
    input: AcceptInvitationInput,
  ): Promise<AcceptInvitationResult> {
    // Malformed-shape tokens never even open a transaction (settled
    // contract #9/#22): this both avoids wasting a SERIALIZABLE attempt on
    // obviously-garbage input and guarantees Argon2id can never run for it,
    // matching this repository's established `isWellFormedUuid` pre-check
    // precedent (TablesService). The DTO deliberately does not perform this
    // check itself, so this remains the single place malformed and unknown
    // tokens converge on the identical `invitationNotFound` outcome.
    if (!this.sessionTokenService.isWellFormedRawToken(input.token)) {
      return { outcome: 'invitationNotFound' };
    }

    const tokenHash = this.sessionTokenService.hashToken(input.token);

    let lastRetryableError: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.attemptAcceptInvitation(tx, tokenHash, input.password),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableConflict(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          lastRetryableError = error;
          continue;
        }
        throw error;
      }
    }

    // Unreachable in practice (the loop always returns or throws), but
    // keeps the function's control flow explicit for TypeScript.
    throw lastRetryableError;
  }

  private async attemptAcceptInvitation(
    tx: Prisma.TransactionClient,
    tokenHash: string,
    password: string,
  ): Promise<AcceptInvitationResult> {
    const now = new Date();

    // Step 1-2 (settled contract #22): resolve a still-pending Invitation.
    // Unknown token, expired, revoked, and already-accepted all converge
    // here identically -- this single query's `where` clause is the
    // pending-state definition itself (settled contract #11), never a
    // separate status column.
    const invitation = await tx.restaurantInvitation.findFirst({
      where: {
        tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        restaurantId: true,
        emailNormalized: true,
        role: true,
        allBranches: true,
        invitedByUserId: true,
      },
    });
    if (!invitation) {
      return { outcome: 'invitationNotFound' };
    }

    // Defense-in-depth (settled contract #17/#20): Foundation S can never
    // create an OWNER Invitation, so an unsupported stored Role here can
    // only be historical/corrupt data -- fail closed identically.
    if (!isInvitableRole(invitation.role)) {
      return { outcome: 'invitationNotFound' };
    }

    // Step 3: Restaurant operational state. This is the one outcome
    // deliberately NOT folded into the generic `invitationNotFound`
    // (settled contract #12) -- it reuses the exact existing
    // `RESTAURANT_NOT_OPERATIONAL` contract, and the Invitation is left
    // untouched (not consumed) so it may be retried once the Restaurant
    // becomes ACTIVE again.
    const restaurant = await tx.restaurant.findUnique({
      where: { id: invitation.restaurantId },
      select: { status: true },
    });
    if (!restaurant) {
      // Not reachable under normal FK-Restrict integrity, but never
      // disclose a distinct reason if it somehow were.
      return { outcome: 'invitationNotFound' };
    }
    if (restaurant.status !== 'ACTIVE') {
      return { outcome: 'restaurantNotOperational' };
    }

    // Step 4 (settled contract #18): Branch grant integrity, revalidated
    // now (not trusted from Create time). `allBranches=true` requires zero
    // InvitationBranch rows; `allBranches=false` requires at least one
    // VALID same-Restaurant row, and any row pointing at a foreign
    // Restaurant (malformed/corrupt) must never silently be dropped and
    // treated as "still fine" -- a total-vs-valid count mismatch fails
    // closed rather than silently narrowing scope.
    let validatedBranchIds: string[] = [];
    if (invitation.allBranches) {
      const contradictoryRowCount = await tx.restaurantInvitationBranch.count({
        where: { restaurantInvitationId: invitation.id },
      });
      if (contradictoryRowCount !== 0) {
        return { outcome: 'invitationNotFound' };
      }
    } else {
      const [totalRowCount, validRows] = await Promise.all([
        tx.restaurantInvitationBranch.count({
          where: { restaurantInvitationId: invitation.id },
        }),
        tx.restaurantInvitationBranch.findMany({
          where: {
            restaurantInvitationId: invitation.id,
            branch: { restaurantId: invitation.restaurantId },
          },
          select: { branchId: true },
        }),
      ]);
      if (validRows.length === 0 || validRows.length !== totalRowCount) {
        return { outcome: 'invitationNotFound' };
      }
      validatedBranchIds = validRows.map((row) => row.branchId);
    }

    // Step 5 (settled contract #19), SECURITY CRITICAL: revalidate the
    // CURRENT authority of the original inviter inside this same
    // transaction -- an Invitation is not a frozen grant. Every check here
    // converges on the identical generic outcome; no distinct reason ever
    // leaks which specific condition failed.
    const inviter = await tx.user.findUnique({
      where: { id: invitation.invitedByUserId },
      select: { status: true },
    });
    if (!inviter || inviter.status !== 'ACTIVE') {
      return { outcome: 'invitationNotFound' };
    }
    const inviterMembership = await tx.restaurantMembership.findFirst({
      where: {
        restaurantId: invitation.restaurantId,
        userId: invitation.invitedByUserId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        allBranches: true,
        restaurantRole: { select: { kind: true, permissions: true } },
      },
    });
    if (!inviterMembership) {
      return { outcome: 'invitationNotFound' };
    }
    if (
      !hasPermission(
        effectiveRolePermissions(inviterMembership.restaurantRole),
        PERMISSIONS.USERS_MANAGE,
      )
    ) {
      return { outcome: 'invitationNotFound' };
    }
    if (!inviterMembership.allBranches) {
      if (invitation.allBranches) {
        return { outcome: 'invitationNotFound' };
      }
      const inviterAssignments = await tx.restaurantMembershipBranch.findMany({
        where: {
          restaurantMembershipId: inviterMembership.id,
          branch: { restaurantId: invitation.restaurantId },
        },
        select: { branchId: true },
      });
      const inviterBranchIds = new Set(
        inviterAssignments.map((assignment) => assignment.branchId),
      );
      const exceedsCurrentAuthority = validatedBranchIds.some(
        (branchId) => !inviterBranchIds.has(branchId),
      );
      if (exceedsCurrentAuthority) {
        return { outcome: 'invitationNotFound' };
      }
    }

    // Step 6 (settled contract #14/#16): resolve User/Membership state.
    const existingUser = await tx.user.findUnique({
      where: { emailNormalized: invitation.emailNormalized },
      select: { id: true, status: true, passwordHash: true },
    });

    if (existingUser) {
      // Never silently activate a globally INVITED/DISABLED User through a
      // Restaurant Invitation.
      if (existingUser.status !== 'ACTIVE') {
        return { outcome: 'invitationNotFound' };
      }
      // Foundation S already prevented this at Create time; state may have
      // changed since. ANY status (ACTIVE/INVITED/DISABLED) conflicts
      // identically -- this Foundation creates a Membership only when none
      // exists at all.
      const existingMembership = await tx.restaurantMembership.findFirst({
        where: {
          restaurantId: invitation.restaurantId,
          userId: existingUser.id,
        },
        select: { id: true },
      });
      if (existingMembership) {
        return { outcome: 'invitationNotFound' };
      }
    }

    // Step 7 (settled contract #4/#22): password proof, only now -- after
    // every other unusable-state check has already passed, so random
    // invalid-token traffic never reaches Argon2id.
    let passwordHashToPersist: string | undefined;
    if (existingUser) {
      const passwordMatches = await this.passwordHasherService.verifyPassword(
        password,
        existingUser.passwordHash,
      );
      if (!passwordMatches) {
        // The one deliberate exception to the generic outcome (settled
        // contract #4): reuses Login's exact existing contract, never a
        // second credential-error shape.
        return { outcome: 'invalidCredentials' };
      }
    } else {
      passwordHashToPersist =
        await this.passwordHasherService.hashPassword(password);
    }

    // FT-12C: the Invitation carries a starter-role KIND; the Membership
    // needs this Restaurant's Role row of that kind. If the Restaurant has
    // since deleted that Role, the Invitation is unusable (generic outcome).
    const grantedRole = await tx.restaurantRole.findFirst({
      where: { restaurantId: invitation.restaurantId, kind: invitation.role },
      select: { id: true },
    });
    if (!grantedRole) {
      return { outcome: 'invitationNotFound' };
    }

    // Step 8: mutations. The conditional acceptedAt transition is the
    // one-time-consumption race guard (settled contract #23) -- it must
    // still match the exact pending predicate used by the read above, so a
    // concurrent winner that consumed the Invitation between our read and
    // this write is detected here (zero rows transition) rather than
    // silently double-granting access.
    const consumption = await tx.restaurantInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (consumption.count !== 1) {
      return { outcome: 'invitationNotFound' };
    }

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const createdUser = await tx.user.create({
        data: {
          // Settled contract #13: the Invitation never preserved original
          // casing, so a brand-new User's `email` is the normalized value
          // itself -- identical to `emailNormalized`.
          email: invitation.emailNormalized,
          emailNormalized: invitation.emailNormalized,
          // Non-null by schema (`passwordHash: String`); always set here.
          passwordHash: passwordHashToPersist as string,
          status: 'ACTIVE',
          preferredLocale: null,
        },
        select: { id: true },
      });
      userId = createdUser.id;
    }

    const membership = await tx.restaurantMembership.create({
      data: {
        restaurantId: invitation.restaurantId,
        userId,
        role: invitation.role,
        roleId: grantedRole.id,
        allBranches: invitation.allBranches,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!invitation.allBranches) {
      await tx.restaurantMembershipBranch.createMany({
        data: validatedBranchIds.map((branchId) => ({
          restaurantMembershipId: membership.id,
          branchId,
        })),
      });
    }

    return { outcome: 'accepted' };
  }
}
