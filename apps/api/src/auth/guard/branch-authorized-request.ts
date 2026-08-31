import type { BranchAccessContext } from '../context/branch-access.service';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

/**
 * A request that has passed AuthGuard, RestaurantAccessGuard, and
 * BranchAccessGuard, in that order. `branchAccess` is exactly the safe
 * context BranchAccessService produced.
 */
export interface BranchAuthorizedRequest extends RestaurantAuthorizedRequest {
  branchAccess: BranchAccessContext;
}
