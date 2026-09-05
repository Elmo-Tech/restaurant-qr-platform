import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/guard/auth.guard';
import { BranchAccessGuard } from '../auth/guard/branch-access.guard';
import { BranchManagementAccessGuard } from '../auth/guard/branch-management-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { CreateMenuDto } from './dto/create-menu.dto';
import { MenusController } from './menus.controller';
import type { MenuWithTranslation } from './menus.service';

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

describe('MenusController', () => {
  let menusService: { listMenus: jest.Mock; createMenu: jest.Mock };
  let controller: MenusController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = MenusController.prototype.listMenus;
  const createHandler = MenusController.prototype.createMenu;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    menusService = {
      listMenus: jest.fn().mockResolvedValue([]),
      createMenu: jest.fn(),
    };
    controller = new MenusController(menusService as never);
  });

  describe('GET (list)', () => {
    it('declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard, no CSRF/Branch guard', () => {
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

    it('requires exactly menu.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        listHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_VIEW);
    });

    it('scopes by request.restaurantAccess.restaurantId, never the raw route param', async () => {
      await controller.listMenus(
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(menusService.listMenus).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
      });
    });

    it('wraps the result in the exact { data } envelope, including an empty list', async () => {
      menusService.listMenus.mockResolvedValue([]);

      const body = await controller.listMenus(buildRequest('restaurant-1'));

      expect(body).toEqual({ data: [] });
    });
  });

  describe('POST (create)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        createHandler,
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

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        createHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context and dto fields, never isPrimary/restaurantId/locale from the body', async () => {
      const created: MenuWithTranslation = {
        id: 'menu-1',
        nameInternal: 'Main Menu',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translation: {
          locale: 'ar',
          name: 'القائمة الرئيسية',
          description: null,
        },
      };
      menusService.createMenu.mockResolvedValue(created);
      const dto = new CreateMenuDto();
      dto.nameInternal = 'Main Menu';
      dto.name = 'القائمة الرئيسية';
      dto.description = null;
      dto.status = 'ACTIVE';
      dto.displayOrder = 0;

      const body = await controller.createMenu(
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(menusService.createMenu).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        nameInternal: 'Main Menu',
        name: 'القائمة الرئيسية',
        description: null,
        status: 'ACTIVE',
        displayOrder: 0,
      });
      expect(body).toEqual({ data: created });
    });
  });
});
