import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';

@Injectable()
export class PromotionsFeatureGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { restaurantAccess } = context
      .switchToHttp()
      .getRequest<RestaurantAuthorizedRequest>();
    if (
      !(await this.entitlements.isEnabled(
        restaurantAccess.restaurantId,
        'PROMOTIONS',
      ))
    ) {
      throw featureNotAvailableException(
        new FeatureNotAvailableError('PROMOTIONS'),
      );
    }
    return true;
  }
}
