import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { BranchAccessService } from '../context/branch-access.service';
import type { BranchAuthorizedRequest } from './branch-authorized-request';

/**
 * Reuses the exact same externally-visible contract as BranchAccessGuard's
 * `notFound` outcome (AUTHORIZATION FOUNDATION G, decision 3;
 * AUTH_TENANCY_SPEC.md #61A) -- Business Foundation L2 introduces no new
 * error code.
 */
const BRANCH_NOT_FOUND_RESPONSE = {
  error: {
    code: 'BRANCH_NOT_FOUND',
    message: 'Branch not found.',
  },
};

/**
 * Reuses the exact same externally-visible contract as BranchAccessGuard's
 * `accessDenied` outcome. Business Foundation L2 introduces no new error
 * code, and deliberately has no `notOperational`/`BRANCH_NOT_OPERATIONAL`
 * mapping at all -- management access never checks Branch operational
 * status.
 */
const BRANCH_ACCESS_DENIED_RESPONSE = {
  error: {
    code: 'BRANCH_ACCESS_DENIED',
    message: 'You do not have access to this Branch.',
  },
};

/**
 * Business Foundation L2: Branch-scope enforcement for Staff configuration
 * mutations against an existing Branch (e.g. adding a Table), as opposed to
 * ordinary Branch-scoped business operations. Deliberately does NOT require
 * `Branch.status === 'ACTIVE'` -- a Branch created via Business Foundation K
 * starts `INACTIVE` and must remain configurable before activation.
 *
 * Must run after AuthGuard AND RestaurantAccessGuard in the same guard chain
 * (`@UseGuards(AuthGuard, RestaurantAccessGuard, BranchManagementAccessGuard)`)
 * -- it reads `request.restaurantAccess`, already attached by
 * RestaurantAccessGuard, and never re-derives Restaurant authorization
 * itself. Reads only the canonical `branchId` route parameter. Attaches the
 * exact same `request.branchAccess: BranchAccessContext` shape as
 * BranchAccessGuard -- there is no separate "management" request field.
 * Enforces no Role/Permission decision and no CSRF decision -- those remain
 * separate guards in the chain. Must never be combined with
 * AllBranchesRequiredGuard's Restaurant-wide-authority requirement: a
 * Branch-scoped Membership (`allBranches = false`) assigned to this
 * specific Branch has legitimate management authority over it.
 *
 * Fails closed even when used incorrectly: this guard is exported and
 * reusable, so a route that accidentally applies it without
 * RestaurantAccessGuard ahead of it must still deny with the same
 * `BRANCH_NOT_FOUND` contract used when a requested Branch's identity
 * cannot be disclosed -- never a `TypeError`/500 from reading Restaurant
 * context off a missing `restaurantAccess`.
 */
@Injectable()
export class BranchManagementAccessGuard implements CanActivate {
  constructor(private readonly branchAccessService: BranchAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Partial<BranchAuthorizedRequest>>();

    if (!request.restaurantAccess) {
      throw new HttpException(BRANCH_NOT_FOUND_RESPONSE, HttpStatus.NOT_FOUND);
    }

    const requestedBranchId =
      typeof request.params?.branchId === 'string'
        ? request.params.branchId
        : '';

    const result = await this.branchAccessService.resolveBranchManagementAccess(
      request.restaurantAccess,
      requestedBranchId,
    );

    if (result.outcome === 'notFound') {
      throw new HttpException(BRANCH_NOT_FOUND_RESPONSE, HttpStatus.NOT_FOUND);
    }

    if (result.outcome === 'accessDenied') {
      throw new HttpException(
        BRANCH_ACCESS_DENIED_RESPONSE,
        HttpStatus.FORBIDDEN,
      );
    }

    (request as BranchAuthorizedRequest).branchAccess = result.context;
    return true;
  }
}
