import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';

/**
 * Managing Offers needs the `OFFERS` platform feature (DEC-069, OFFERS_SPEC.md #4). A guard, so a Restaurant without the
 * feature is refused BEFORE a body or an upload is read. Run it after the Restaurant guards: it reads the Restaurant from the
 * authenticated context, never from the URL or the body.
 */
@Injectable()
export class OffersFeatureGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RestaurantAuthorizedRequest>();
    const allowed = await this.entitlements.isEnabled(
      request.restaurantAccess.restaurantId,
      'OFFERS',
    );
    if (!allowed) {
      throw featureNotAvailableException(
        new FeatureNotAvailableError('OFFERS'),
      );
    }
    return true;
  }
}
