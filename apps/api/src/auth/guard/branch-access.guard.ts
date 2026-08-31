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
 * AUTHORIZATION FOUNDATION G, decision 3: identical for an unknown Branch
 * and a Branch that exists but belongs to a foreign Restaurant (including a
 * malformed cross-Restaurant RestaurantMembershipBranch assignment,
 * AUTH_TENANCY_SPEC.md #61A) -- checked before Branch-scope or
 * operational-state disclosure.
 */
const BRANCH_NOT_FOUND_RESPONSE = {
  error: {
    code: 'BRANCH_NOT_FOUND',
    message: 'Branch not found.',
  },
};

/**
 * AUTHORIZATION FOUNDATION G, decision 4: the Branch belongs to the
 * authorized Restaurant but is outside the Membership's authorized Branch
 * scope (allBranches=false with no valid same-Restaurant assignment, or
 * zero assignments).
 */
const BRANCH_ACCESS_DENIED_RESPONSE = {
  error: {
    code: 'BRANCH_ACCESS_DENIED',
    message: 'You do not have access to this Branch.',
  },
};

/**
 * AUTHORIZATION FOUNDATION G, decision 5: only reachable after both Branch
 * identity and Branch-scope authorization have already been proven.
 */
const BRANCH_NOT_OPERATIONAL_RESPONSE = {
  error: {
    code: 'BRANCH_NOT_OPERATIONAL',
    message: 'Branch is not currently operational.',
  },
};

/**
 * Branch scope enforcement. Must run after AuthGuard AND RestaurantAccessGuard
 * in the same guard chain
 * (`@UseGuards(AuthGuard, RestaurantAccessGuard, BranchAccessGuard)`) -- it
 * reads `request.restaurantAccess`, already attached by RestaurantAccessGuard,
 * and never re-derives Restaurant authorization itself. Reads only the
 * canonical `branchId` route parameter. Does not enforce Role permission --
 * that is a later slice.
 */
@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private readonly branchAccessService: BranchAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<BranchAuthorizedRequest>();

    const requestedBranchId =
      typeof request.params.branchId === 'string'
        ? request.params.branchId
        : '';

    const result = await this.branchAccessService.resolveBranchAccess(
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

    if (result.outcome === 'notOperational') {
      throw new HttpException(
        BRANCH_NOT_OPERATIONAL_RESPONSE,
        HttpStatus.CONFLICT,
      );
    }

    request.branchAccess = result.context;
    return true;
  }
}
