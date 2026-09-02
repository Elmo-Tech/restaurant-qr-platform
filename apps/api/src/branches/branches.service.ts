import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { BranchStatus } from '../generated/prisma/client';
import { createBranchPublicId } from './branch-public-id';

/**
 * Safe Staff-facing Branch shape (API_CONVENTIONS.md #59: Restaurant
 * Branches is the canonical "Small Admin Collection" example). Mirrors
 * `AuthContextBranch`'s deliberately minimal field set (id, name, status)
 * rather than the full Prisma row -- `timezone`/`phone`/`address` belong to
 * a future Branch-detail/settings slice (STAFF_DASHBOARD_UX_SPEC.md #178),
 * not this list. `status` is current operational state, not authorization
 * (AUTH_TENANCY_SPEC.md #148A): an INACTIVE Branch within scope is still
 * listed -- Branch status never expands or reduces authorization scope.
 */
export interface BranchListItem {
  id: string;
  name: string;
  status: BranchStatus;
}

/**
 * The minimum safe authorized scope this query needs -- exactly the fields
 * already produced by `RestaurantAccessGuard` on `request.restaurantAccess`.
 * Never the full Express request, never a re-derived Role/Membership query.
 */
export interface AuthorizedBranchScope {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
}

/** The safe Branch detail shape returned by Create (Business Foundation K). Never `restaurantId`, `publicId`, `createdAt`, or `updatedAt`. */
export interface CreatedBranch {
  id: string;
  name: string;
  status: BranchStatus;
  timezone: string;
  phone: string | null;
  address: string | null;
}

/**
 * Client-writable Create Branch input, already DTO-validated and
 * normalized (trimmed; empty optional strings already reduced to `null`).
 * `restaurantId` here is the Backend-authorized value from
 * `request.restaurantAccess.restaurantId` -- never a client-supplied value.
 */
export interface CreateBranchInput {
  restaurantId: string;
  name: string;
  timezone: string;
  phone: string | null;
  address: string | null;
}

/**
 * Business Foundation J (corrected): Branch list honors the caller's
 * current ACTIVE RestaurantMembership Branch scope, reusing the same
 * semantics `/auth/me`'s `AuthContextService` already established
 * (AUTH_TENANCY_SPEC.md #58-61A) rather than a separate, looser policy.
 * `branches.view` gates whether the caller may call this route at all; it
 * does not widen which Branches within it they may see.
 */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listBranches(scope: AuthorizedBranchScope): Promise<BranchListItem[]> {
    if (scope.allBranches) {
      // Explicitly Tenant-scoped by the query itself (AUTH_TENANCY_SPEC.md
      // #61A), not merely trusted from RestaurantAccessGuard having already
      // authorized this restaurantId -- defense in depth.
      return this.prisma.branch.findMany({
        where: { restaurantId: scope.restaurantId },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, status: true },
      });
    }

    // AUTH_TENANCY_SPEC.md #61A: a RestaurantMembershipBranch row is a valid
    // grant only when Branch.restaurantId equals the Membership's own
    // restaurantId. Requiring both restaurantMembershipId AND
    // branch.restaurantId in the same query -- never restaurantMembershipId
    // alone -- means a malformed cross-Restaurant assignment row can never
    // surface a foreign Branch here, regardless of how it came to exist.
    const rows = await this.prisma.restaurantMembershipBranch.findMany({
      where: {
        restaurantMembershipId: scope.membershipId,
        branch: { restaurantId: scope.restaurantId },
      },
      orderBy: { branch: { id: 'asc' } },
      select: {
        branch: { select: { id: true, name: true, status: true } },
      },
    });

    return rows.map((row) => row.branch);
  }

  /**
   * Business Foundation K: creates a new Branch. `restaurantId` authority
   * comes only from the caller (already the Backend-authorized
   * `request.restaurantAccess.restaurantId` by the time it reaches here --
   * this service does not re-derive or re-trust any other source).
   * `publicId` is Backend-generated and independent from the internal `id`
   * (never derived from it). `status` is always `INACTIVE` on creation --
   * Branch creation and Branch activation are separate lifecycle concerns,
   * and the client cannot choose an initial status. The Prisma `data`
   * object is built explicitly field-by-field, never a spread of the
   * input, so DTO growth can never silently become persistence authority.
   */
  async createBranch(input: CreateBranchInput): Promise<CreatedBranch> {
    return this.prisma.branch.create({
      data: {
        restaurantId: input.restaurantId,
        publicId: createBranchPublicId(),
        name: input.name,
        status: 'INACTIVE',
        timezone: input.timezone,
        phone: input.phone,
        address: input.address,
      },
      select: {
        id: true,
        name: true,
        status: true,
        timezone: true,
        phone: true,
        address: true,
      },
    });
  }
}
