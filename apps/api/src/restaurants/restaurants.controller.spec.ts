import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException } from '@nestjs/common';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { PutRestaurantLocaleDto } from './dto/put-restaurant-locale.dto';
import { RestaurantsController } from './restaurants.controller';
import type { RestaurantLocalesView } from './restaurant-locales.service';

function buildRequest(
  restaurantId: string,
  routeParamRestaurantId?: string,
): RestaurantAuthorizedRequest {
  return {
    params: { restaurantId: routeParamRestaurantId ?? restaurantId },
    restaurantAccess: {
      membershipId: 'membership-1',
      restaurantId,
      role: 'OWNER',
      allBranches: true,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

const SAMPLE_LOCALES: RestaurantLocalesView = {
  defaultLocale: 'en',
  locales: [
    { locale: 'en', isDefault: true, isActive: true },
    { locale: 'ar', isDefault: false, isActive: false },
  ],
};

describe('RestaurantsController', () => {
  let restaurantLocalesService: {
    listLocales: jest.Mock;
    setLocaleState: jest.Mock;
    setDefaultLocale: jest.Mock;
    getDefaultLocaleReadiness: jest.Mock;
  };
  let controller: RestaurantsController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = RestaurantsController.prototype.listLocales;
  const putHandler = RestaurantsController.prototype.setLocaleState;
  const defaultHandler = RestaurantsController.prototype.setDefaultLocale;
  const readinessHandler = RestaurantsController.prototype.defaultReadiness;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    restaurantLocalesService = {
      listLocales: jest.fn().mockResolvedValue(SAMPLE_LOCALES),
      setLocaleState: jest.fn(),
      setDefaultLocale: jest.fn(),
      getDefaultLocaleReadiness: jest.fn(),
    };
    controller = new RestaurantsController(restaurantLocalesService as never);
  });

  describe('GET (list locales)', () => {
    it('declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard, no CSRF/Branch/AllBranches guard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        listHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        RestaurantAccessGuard,
        PermissionGuard,
      ]);
      expect(guards).not.toContain(CsrfGuard);
      expect(guards).not.toContain(BranchAccessGuard);
      expect(guards).not.toContain(BranchManagementAccessGuard);
      expect(guards).not.toContain(AllBranchesRequiredGuard);
    });

    it('requires exactly restaurant.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        listHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.RESTAURANT_VIEW);
    });

    it('scopes by request.restaurantAccess.restaurantId, never the raw route param', async () => {
      await controller.listLocales(
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(restaurantLocalesService.listLocales).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
      });
    });

    it('wraps the result in the exact { data } envelope', async () => {
      const body = await controller.listLocales(buildRequest('restaurant-1'));

      expect(body).toEqual({ data: SAMPLE_LOCALES });
    });
  });

  describe('PUT :locale (set locale state)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        putHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
        AllBranchesRequiredGuard,
      ]);
      expect(guards).not.toContain(BranchAccessGuard);
      expect(guards).not.toContain(BranchManagementAccessGuard);
    });

    it('requires exactly restaurant.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        putHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.RESTAURANT_MANAGE);
    });

    it('forwards restaurantId from authorized context, locale from the route param, and isActive from the dto', async () => {
      restaurantLocalesService.setLocaleState.mockResolvedValue({
        outcome: 'updated',
        data: { locale: 'ar', isActive: true },
      });
      const dto = new PutRestaurantLocaleDto();
      dto.isActive = true;

      const body = await controller.setLocaleState(
        'ar',
        dto,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(restaurantLocalesService.setLocaleState).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        locale: 'ar',
        isActive: true,
      });
      expect(body).toEqual({ data: { locale: 'ar', isActive: true } });
    });

    it('maps defaultLocaleRequired to 409 DEFAULT_LOCALE_REQUIRED', async () => {
      restaurantLocalesService.setLocaleState.mockResolvedValue({
        outcome: 'defaultLocaleRequired',
      });
      const dto = new PutRestaurantLocaleDto();
      dto.isActive = false;

      await expect(
        controller.setLocaleState(
          'en',
          dto,
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'DEFAULT_LOCALE_REQUIRED',
            message: 'The default locale cannot be disabled.',
          },
        },
      });
      await expect(
        controller.setLocaleState(
          'en',
          dto,
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('POST :locale/default (make default, DEC-037)', () => {
    it('declares the Restaurant-structural guard chain and requires restaurant.manage', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, defaultHandler) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
        AllBranchesRequiredGuard,
      ]);
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, defaultHandler)).toBe(
        PERMISSIONS.RESTAURANT_MANAGE,
      );
    });

    it('scopes by the authorized Restaurant, never the route param', async () => {
      restaurantLocalesService.setDefaultLocale.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_LOCALES,
      });

      const body = await controller.setDefaultLocale(
        'ar',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(restaurantLocalesService.setDefaultLocale).toHaveBeenCalledWith(
        { restaurantId: 'authorized-restaurant' },
        'ar',
      );
      expect(body).toEqual({ data: SAMPLE_LOCALES });
    });

    it('maps a disabled language to 409 LOCALE_NOT_ACTIVE', async () => {
      restaurantLocalesService.setDefaultLocale.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.setDefaultLocale('ar', buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: { error: { code: 'LOCALE_NOT_ACTIVE' } },
      });
    });

    it('maps missing names to 409 DEFAULT_LOCALE_INCOMPLETE with the counts', async () => {
      restaurantLocalesService.setDefaultLocale.mockResolvedValue({
        outcome: 'incomplete',
        data: { locale: 'ar', ready: false, totalMissing: 4, missing: { products: 4 } },
      });

      await expect(
        controller.setDefaultLocale('ar', buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'DEFAULT_LOCALE_INCOMPLETE',
            totalMissing: 4,
            missing: { products: 4 },
          },
        },
      });
    });
  });

  describe('GET :locale/default-readiness (DEC-037)', () => {
    it('is a read-only route: no CSRF or AllBranches guard, restaurant.view', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, readinessHandler) as unknown[];

      expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, readinessHandler)).toBe(
        PERMISSIONS.RESTAURANT_VIEW,
      );
    });

    it('returns the readiness inside the data envelope', async () => {
      const readiness = { locale: 'ar', ready: true, totalMissing: 0, missing: {} };
      restaurantLocalesService.getDefaultLocaleReadiness.mockResolvedValue({
        outcome: 'ok',
        data: readiness,
      });

      const body = await controller.defaultReadiness(
        'ar',
        buildRequest('authorized-restaurant'),
      );

      expect(restaurantLocalesService.getDefaultLocaleReadiness).toHaveBeenCalledWith(
        { restaurantId: 'authorized-restaurant' },
        'ar',
      );
      expect(body).toEqual({ data: readiness });
    });
  });
});
