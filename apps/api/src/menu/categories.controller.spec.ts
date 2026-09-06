import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
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
import { CategoriesController } from './categories.controller';
import type { CategoryWithTranslation } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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

const SAMPLE_CATEGORY: CategoryWithTranslation = {
  id: 'category-1',
  menuId: 'menu-1',
  status: 'ACTIVE',
  displayOrder: 0,
  imageAssetPath: null,
  translation: { locale: 'ar', name: 'المقبلات', description: null },
};

describe('CategoriesController', () => {
  let categoriesService: {
    listCategories: jest.Mock;
    createCategory: jest.Mock;
    updateCategory: jest.Mock;
  };
  let controller: CategoriesController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = CategoriesController.prototype.listCategories;
  const createHandler = CategoriesController.prototype.createCategory;
  const updateHandler = CategoriesController.prototype.updateCategory;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    categoriesService = {
      listCategories: jest.fn().mockResolvedValue([]),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
    };
    controller = new CategoriesController(categoriesService as never);
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

    it('scopes by request.restaurantAccess.restaurantId and forwards the optional menuId filter', async () => {
      const query = new ListCategoriesQueryDto();
      query.menuId = 'menu-1';

      await controller.listCategories(
        query,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(categoriesService.listCategories).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
      });
    });

    it('wraps the result in the exact { data } envelope, including an empty list', async () => {
      categoriesService.listCategories.mockResolvedValue([]);

      const body = await controller.listCategories(
        new ListCategoriesQueryDto(),
        buildRequest('restaurant-1'),
      );

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

    it('forwards restaurantId from authorized context and dto fields on success', async () => {
      const created: CategoryWithTranslation = {
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
        translation: { locale: 'ar', name: 'المقبلات', description: null },
      };
      categoriesService.createCategory.mockResolvedValue({
        outcome: 'created',
        data: created,
      });
      const dto = new CreateCategoryDto();
      dto.menuId = 'menu-1';
      dto.name = 'المقبلات';
      dto.description = null;
      dto.status = 'ACTIVE';
      dto.displayOrder = 0;

      const body = await controller.createCategory(
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(categoriesService.createCategory).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        menuId: 'menu-1',
        name: 'المقبلات',
        description: null,
        status: 'ACTIVE',
        displayOrder: 0,
      });
      expect(body).toEqual({ data: created });
    });

    it('maps menuNotFound to 404 MENU_NOT_FOUND', async () => {
      categoriesService.createCategory.mockResolvedValue({
        outcome: 'menuNotFound',
      });
      const dto = new CreateCategoryDto();
      dto.menuId = 'foreign-or-unknown-menu';
      dto.name = 'Name';
      dto.description = null;
      dto.status = 'ACTIVE';
      dto.displayOrder = 0;

      await expect(
        controller.createCategory(dto, buildRequest('authorized-restaurant')),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
      await expect(
        controller.createCategory(dto, buildRequest('authorized-restaurant')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH :categoryId (update)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard, no BranchAccessGuard/BranchManagementAccessGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        updateHandler,
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
        updateHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context, categoryId from the route param, and dto fields on success', async () => {
      categoriesService.updateCategory.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_CATEGORY,
      });
      const dto = new UpdateCategoryDto();
      dto.displayOrder = 2;

      const body = await controller.updateCategory(
        'category-1',
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(categoriesService.updateCategory).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
        menuId: undefined,
        name: undefined,
        description: undefined,
        status: undefined,
        displayOrder: 2,
      });
      expect(body).toEqual({ data: SAMPLE_CATEGORY });
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.updateCategory.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.updateCategory(
          'unknown-id',
          new UpdateCategoryDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });

    it('maps menuNotFound (unknown/foreign move target) to 404 MENU_NOT_FOUND', async () => {
      categoriesService.updateCategory.mockResolvedValue({
        outcome: 'menuNotFound',
      });
      const dto = new UpdateCategoryDto();
      dto.menuId = 'foreign-or-unknown-menu';

      await expect(
        controller.updateCategory(
          'category-1',
          dto,
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'MENU_NOT_FOUND', message: 'Menu not found.' },
        },
      });
    });
  });
});
