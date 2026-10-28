import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { featureNotAvailableException } from '../entitlements/feature-not-available';
import { FeatureNotAvailableError } from '../entitlements/features';

/**
 * Starting a Menu Import needs the `MENU_IMPORT` platform feature (DEC-057, MENU_IMPORT_SPEC.md #4A). It is a
 * guard, not a check in the handler, so a Restaurant without the feature is refused BEFORE the upload is read
 * into memory and before any model is called. Run it after the Restaurant guards: it reads the Restaurant from
 * the authenticated context, never from the URL or the body.
 */
@Injectable()
export class MenuImportFeatureGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RestaurantAuthorizedRequest>();
    const allowed = await this.entitlements.isEnabled(
      request.restaurantAccess.restaurantId,
      'MENU_IMPORT',
    );
    if (!allowed) {
      throw featureNotAvailableException(
        new FeatureNotAvailableError('MENU_IMPORT'),
      );
    }
    return true;
  }
}
