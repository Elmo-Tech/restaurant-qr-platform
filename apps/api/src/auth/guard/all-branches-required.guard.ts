import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

/**
 * Business Foundation K, approved decision: reuses the exact existing
 * generic Permission-denial contract. A caller failing this check must be
 * externally indistinguishable from a caller simply lacking the required
 * Permission -- never a new externally-visible error code.
 */
const PERMISSION_DENIED_RESPONSE = {
  error: {
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission to perform this action.',
  },
};

/**
 * Restaurant-structural authority enforcement. Some mutations (e.g.
 * creating a new Branch) are Restaurant-wide by nature -- the resource
 * being created cannot already exist inside any Membership's Branch scope,
 * so an ordinary Permission grant is not enough. A Branch-scoped Membership
 * (`allBranches = false`) must never gain Restaurant-wide structural
 * authority merely because its Role holds the relevant Permission
 * (e.g. `branches.manage`).
 *
 * Must run after RestaurantAccessGuard in the same guard chain -- it reads
 * `request.restaurantAccess.allBranches`, already resolved this same
 * request, and performs no Membership query of its own (nothing to cache,
 * nothing that can go stale within a request).
 *
 * Fails closed even when used incorrectly: this guard is exported and
 * reusable, so a route that accidentally applies it without
 * RestaurantAccessGuard ahead of it must still deny with the exact same
 * `PERMISSION_DENIED` contract -- never a `TypeError`/500 from reading
 * `allBranches` off a missing `restaurantAccess`.
 */
@Injectable()
export class AllBranchesRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Partial<RestaurantAuthorizedRequest>>();

    if (request.restaurantAccess?.allBranches !== true) {
      throw new HttpException(PERMISSION_DENIED_RESPONSE, HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
