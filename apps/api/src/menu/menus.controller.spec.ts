import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { PutTranslationDto } from './dto/put-translation.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
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

const SAMPLE_MENU: MenuWithTranslation = {
  id: 'menu-1',
  nameInternal: 'Main Menu',
  status: 'ACTIVE',
  displayOrder: 0,
  isPrimary: true,
  translation: { locale: 'ar', name: 'القائمة الرئيسية', description: null },
};

describe('MenusController', () => {
  let menusService: {
    listMenus: jest.Mock;
    createMenu: jest.Mock;
    updateMenu: jest.Mock;
    setPrimaryMenu: jest.Mock;
    getMenuTranslations: jest.Mock;
    putMenuTranslation: jest.Mock;
    deleteMenuTranslation: jest.Mock;
  };
  let controller: MenusController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = MenusController.prototype.listMenus;
  const createHandler = MenusController.prototype.createMenu;
  const updateHandler = MenusController.prototype.updateMenu;
  const setPrimaryHandler = MenusController.prototype.setPrimaryMenu;
  const getTranslationsHandler = MenusController.prototype.getMenuTranslations;
  const putTranslationHandler = MenusController.prototype.putMenuTranslation;
  const deleteTranslationHandler =
    MenusController.prototype.deleteMenuTranslation;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    menusService = {
      listMenus: jest.fn().mockResolvedValue([]),
      createMenu: jest.fn(),
      updateMenu: jest.fn(),
      setPrimaryMenu: jest.fn(),
      getMenuTranslations: jest.fn(),
      putMenuTranslation: jest.fn(),
      deleteMenuTranslation: jest.fn(),
    };
    controller = new MenusController(menusService as never);
  });

  function expectMutationGuardChain(guards: unknown[]) {
    expect(guards).toEqual([
      AuthGuard,
      CsrfGuard,
      RestaurantAccessGuard,
      PermissionGuard,
      AllBranchesRequiredGuard,
    ]);
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(BranchManagementAccessGuard);
  }

  function expectReadGuardChain(guards: unknown[]) {
    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
    expect(guards).not.toContain(CsrfGuard);
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(BranchManagementAccessGuard);
    expect(guards).not.toContain(AllBranchesRequiredGuard);
  }

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

  describe('PATCH :menuId (update)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        updateHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context, menuId from the route param, and dto fields on success', async () => {
      menusService.updateMenu.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_MENU,
      });
      const dto = new UpdateMenuDto();
      dto.displayOrder = 3;

      const body = await controller.updateMenu(
        'menu-1',
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(menusService.updateMenu).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
        nameInternal: undefined,
        name: undefined,
        description: undefined,
        status: undefined,
        displayOrder: 3,
      });
      expect(body).toEqual({ data: SAMPLE_MENU });
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      menusService.updateMenu.mockResolvedValue({ outcome: 'menuNotFound' });

      await expect(
        controller.updateMenu(
          'unknown-id',
          new UpdateMenuDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
      await expect(
        controller.updateMenu(
          'unknown-id',
          new UpdateMenuDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH :menuId/primary (set primary)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        setPrimaryHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        setPrimaryHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context and menuId from the route param, never a body field', async () => {
      menusService.setPrimaryMenu.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_MENU,
      });

      const body = await controller.setPrimaryMenu(
        'menu-1',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(menusService.setPrimaryMenu).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
      });
      expect(body).toEqual({ data: SAMPLE_MENU });
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      menusService.setPrimaryMenu.mockResolvedValue({
        outcome: 'menuNotFound',
      });

      await expect(
        controller.setPrimaryMenu(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
    });
  });

  describe('GET :menuId/translations', () => {
    it('declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard, no CSRF/Branch/AllBranches guard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        getTranslationsHandler,
      ) as unknown[];

      expectReadGuardChain(guards);
    });

    it('requires exactly menu.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        getTranslationsHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_VIEW);
    });

    it('forwards restaurantId from authorized context and menuId from the route param', async () => {
      menusService.getMenuTranslations.mockResolvedValue({
        outcome: 'found',
        data: [{ locale: 'en', name: 'Main Menu', description: null }],
      });

      const body = await controller.getMenuTranslations(
        'menu-1',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(menusService.getMenuTranslations).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
      });
      expect(body).toEqual({
        data: [{ locale: 'en', name: 'Main Menu', description: null }],
      });
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      menusService.getMenuTranslations.mockResolvedValue({
        outcome: 'menuNotFound',
      });

      await expect(
        controller.getMenuTranslations(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
    });
  });

  describe('PUT :menuId/translations/:locale', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        putTranslationHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        putTranslationHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context, menuId/locale from route params, and dto fields', async () => {
      menusService.putMenuTranslation.mockResolvedValue({
        outcome: 'updated',
        data: { locale: 'ar', name: 'الرئيسية', description: null },
      });
      const dto = new PutTranslationDto();
      dto.name = 'الرئيسية';
      dto.description = null;

      const body = await controller.putMenuTranslation(
        'menu-1',
        'ar',
        dto,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(menusService.putMenuTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
        locale: 'ar',
        name: 'الرئيسية',
        description: null,
      });
      expect(body).toEqual({
        data: { locale: 'ar', name: 'الرئيسية', description: null },
      });
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      menusService.putMenuTranslation.mockResolvedValue({
        outcome: 'menuNotFound',
      });

      await expect(
        controller.putMenuTranslation(
          'unknown-id',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      menusService.putMenuTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.putMenuTranslation(
          'menu-1',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'LOCALE_NOT_ACTIVE',
            message: 'The locale is not active for this Restaurant.',
          },
        },
      });
      await expect(
        controller.putMenuTranslation(
          'menu-1',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('DELETE :menuId/translations/:locale', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        deleteTranslationHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        deleteTranslationHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context and menuId/locale from route params, returns undefined on success', async () => {
      menusService.deleteMenuTranslation.mockResolvedValue({
        outcome: 'deleted',
      });

      const body = await controller.deleteMenuTranslation(
        'menu-1',
        'ar',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(menusService.deleteMenuTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
        locale: 'ar',
      });
      expect(body).toBeUndefined();
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      menusService.deleteMenuTranslation.mockResolvedValue({
        outcome: 'menuNotFound',
      });

      await expect(
        controller.deleteMenuTranslation(
          'unknown-id',
          'ar',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      menusService.deleteMenuTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.deleteMenuTranslation(
          'menu-1',
          'ar',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'LOCALE_NOT_ACTIVE',
            message: 'The locale is not active for this Restaurant.',
          },
        },
      });
    });

    it('maps defaultTranslationRequired to 409 DEFAULT_TRANSLATION_REQUIRED', async () => {
      menusService.deleteMenuTranslation.mockResolvedValue({
        outcome: 'defaultTranslationRequired',
      });

      await expect(
        controller.deleteMenuTranslation(
          'menu-1',
          'en',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'DEFAULT_TRANSLATION_REQUIRED',
            message: 'The default locale translation cannot be deleted.',
          },
        },
      });
      await expect(
        controller.deleteMenuTranslation(
          'menu-1',
          'en',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
