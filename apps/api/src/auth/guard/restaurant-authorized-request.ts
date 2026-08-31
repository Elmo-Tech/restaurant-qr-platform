import type { RestaurantAccessContext } from '../context/restaurant-access.service';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * A request that has passed both AuthGuard and RestaurantAccessGuard.
 * `restaurantAccess` is exactly the safe context RestaurantAccessService
 * produced -- never a Prisma record, never a client-supplied value.
 */
export interface RestaurantAuthorizedRequest extends AuthenticatedRequest {
  restaurantAccess: RestaurantAccessContext;
}
