import { Injectable } from '@nestjs/common';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { normalizeLoginEmail } from '../auth/login/login.service';
import { isRetryableConflict } from '../auth/invitations/invitation-acceptance.service';
import type { Permission } from '../auth/permission/permission';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { resolveAssignableRole } from './staff-role-assignment';
import { validateBranchGrant } from './staff-branch-scope';
import type { AuthorizedStaffGranterScope, StaffMembershipListItem } from './staff.service';

const MAX_TRANSACTION_ATTEMPTS = 3;

export interface CreateStaffUserInput extends AuthorizedStaffGranterScope {
  /** The granter's effective Permissions (from `request.restaurantAccess`) -- a Role may only be given if it grants nothing beyond these. */
  granterPermissions: readonly string[];
  email: string;
  roleId: string;
  allBranches: boolean;
  branchIds: string[];
  active: boolean;
  /**
   * The password the admin typed. Only ever used when the email has NO account
   * yet; for an existing account it is ignored and never read or stored.
   */
  password: string | null;
}

/**
 * `accountCreated` is `false` when the email already had an account: only this
 * Restaurant's Membership was created and that account's password was never
 * touched. Nothing else about an existing account is returned.
 */
export type CreateStaffUserResult =
  | {
      outcome: 'created';
      data: StaffMembershipListItem;
      accountCreated: boolean;
    }
  | { outcome: 'branchNotFound' }
  | { outcome: 'scopeExceedsAuthority' }
  | { outcome: 'roleNotFound' }
  | { outcome: 'roleNotAssignable' }
  | { outcome: 'roleExceedsAuthority' }
  /** A brand-new account needs the admin to supply its password. */
  | { outcome: 'passwordRequired' }
  | { outcome: 'conflict' };

/**
 * FT-12 direct Staff User provisioning -- the primary V1 way to add Staff
 * (the invitation flow stays available for a future "Invite by email").
 *
 * - Email NOT known: creates the global `User` (ACTIVE, with the password the
 *   admin entered, Argon2id-hashed) plus this Restaurant's Membership and
 *   Branch scope, in one SERIALIZABLE transaction. The User signs in normally.
 * - Email already has an ACTIVE account: creates ONLY this Restaurant's
 *   Membership / Role / Branch scope. The submitted password is ignored: an
 *   existing account's password is never modified, and Argon2id never runs.
 * - Any existing Membership of this Restaurant (any status), or an existing
 *   account that is not ACTIVE, converges on one generic `conflict`.
 *
 * Argon2id runs before the transaction (never inside it), and only when no
 * account exists yet.
 */
@Injectable()
export class StaffProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasherService: PasswordHasherService,
  ) {}

  async createUser(input: CreateStaffUserInput): Promise<CreateStaffUserResult> {
    const emailNormalized = normalizeLoginEmail(input.email);

    const knownUser = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });

    let passwordHash: string | null = null;
    if (!knownUser) {
      if (!input.password) {
        return { outcome: 'passwordRequired' };
      }
      passwordHash = await this.passwordHasherService.hashPassword(input.password);
    }

    let lastRetryableError: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.attemptCreateUser(tx, input, emailNormalized, passwordHash),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableConflict(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          // A concurrent request may have created the account meanwhile; the
          // retry re-reads it and takes the existing-account path.
          lastRetryableError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastRetryableError;
  }

  private async attemptCreateUser(
    tx: Prisma.TransactionClient,
    input: CreateStaffUserInput,
    emailNormalized: string,
    passwordHash: string | null,
  ): Promise<CreateStaffUserResult> {
    // FT-12C: one of THIS Restaurant's Roles, never the protected Owner
    // Role, granting nothing the creator does not hold.
    const assignment = await resolveAssignableRole(tx, {
      restaurantId: input.restaurantId,
      roleId: input.roleId,
      granterPermissions: input.granterPermissions,
    });
    if (assignment.outcome !== 'valid') {
      return { outcome: assignment.outcome };
    }

    const grant = await validateBranchGrant(tx, {
      restaurantId: input.restaurantId,
      granterMembershipId: input.granterMembershipId,
      granterAllBranches: input.granterAllBranches,
      allBranches: input.allBranches,
      branchIds: input.branchIds,
    });
    if (grant.outcome === 'branchNotFound') {
      return { outcome: 'branchNotFound' };
    }
    if (grant.outcome === 'scopeExceedsAuthority') {
      return { outcome: 'scopeExceedsAuthority' };
    }

    const existingUser = await tx.user.findUnique({
      where: { emailNormalized },
      select: { id: true, status: true },
    });

    let userId: string;
    let accountCreated = false;

    if (existingUser) {
      if (existingUser.status !== 'ACTIVE') {
        return { outcome: 'conflict' };
      }
      const existingMembership = await tx.restaurantMembership.findFirst({
        where: { restaurantId: input.restaurantId, userId: existingUser.id },
        select: { id: true },
      });
      if (existingMembership) {
        return { outcome: 'conflict' };
      }
      userId = existingUser.id;
    } else {
      if (!passwordHash) {
        // The pre-read saw an account that no longer exists -- not reachable
        // (Users are never deleted), but fail closed rather than create an
        // account without a hashed password.
        return { outcome: 'conflict' };
      }
      const createdUser = await tx.user.create({
        data: {
          email: emailNormalized,
          emailNormalized,
          passwordHash,
          status: 'ACTIVE',
          preferredLocale: null,
        },
        select: { id: true },
      });
      userId = createdUser.id;
      accountCreated = true;
    }

    const status = input.active ? 'ACTIVE' : 'DISABLED';
    const membership = await tx.restaurantMembership.create({
      data: {
        restaurantId: input.restaurantId,
        userId,
        role: assignment.role.kind,
        roleId: assignment.role.id,
        allBranches: input.allBranches,
        status,
      },
      select: { id: true },
    });

    if (!input.allBranches) {
      await tx.restaurantMembershipBranch.createMany({
        data: grant.branches.map((branch) => ({
          restaurantMembershipId: membership.id,
          branchId: branch.id,
        })),
      });
    }

    return {
      outcome: 'created',
      accountCreated,
      data: {
        id: membership.id,
        user: { id: userId, email: emailNormalized },
        role: assignment.role.kind,
        roleId: assignment.role.id,
        roleName: assignment.role.name,
        status,
        allBranches: input.allBranches,
        branches: grant.branches,
      },
    };
  }
}
