import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { RestaurantAccessService } from '../context/restaurant-access.service';
import type { RestaurantAuthorizedRequest } from './restaurant-authorized-request';

/**
 * AUTHORIZATION FOUNDATION G, decision 1: deliberately identical to an
 * unknown Restaurant, a User with no Membership, and an INVITED/DISABLED
 * Membership -- existence-hiding. The requested Restaurant UUID is
 * identification only, never authorization.
 */
const RESTAURANT_NOT_FOUND_RESPONSE = {
  error: {
    code: 'RESTAURANT_NOT_FOUND',
    message: 'Restaurant not found.',
  },
};

/**
 * AUTHORIZATION FOUNDATION G, decision 2: only reachable after an ACTIVE
 * Membership has already been proven -- operational state is never
 * disclosed before authorization.
 */
const RESTAURANT_NOT_OPERATIONAL_RESPONSE = {
  error: {
    code: 'RESTAURANT_NOT_OPERATIONAL',
    message: 'Restaurant is not currently operational.',
  },
};

/**
 * Restaurant Tenant-scope enforcement. Must run after AuthGuard in the same
 * guard chain (`@UseGuards(AuthGuard, RestaurantAccessGuard)`) -- it reads
 * `request.auth`, already attached by AuthGuard, and never re-authenticates.
 * Reads only the canonical `restaurantId` route parameter; never a body,
 * query, or header value. Does not enforce Branch scope or Role permission
 * -- those are BranchAccessGuard and a later Permission slice.
 */
@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(
    private readonly restaurantAccessService: RestaurantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RestaurantAuthorizedRequest>();

    const requestedRestaurantId =
      typeof request.params.restaurantId === 'string'
        ? request.params.restaurantId
        : '';

    const result = await this.restaurantAccessService.resolveRestaurantAccess(
      request.auth.userId,
      requestedRestaurantId,
    );

    if (result.outcome === 'notFound') {
      throw new HttpException(
        RESTAURANT_NOT_FOUND_RESPONSE,
        HttpStatus.NOT_FOUND,
      );
    }

    if (result.outcome === 'notOperational') {
      throw new HttpException(
        RESTAURANT_NOT_OPERATIONAL_RESPONSE,
        HttpStatus.CONFLICT,
      );
    }

    request.restaurantAccess = result.context;
    return true;
  }
}
