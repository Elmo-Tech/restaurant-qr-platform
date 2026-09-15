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
import { CategoriesController } from './categories.controller';
import type { CategoryWithTranslation } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { PutTranslationDto } from './dto/put-translation.dto';
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
    categoryExists: jest.Mock;
    setCategoryImage: jest.Mock;
    clearCategoryImage: jest.Mock;
    getCategoryTranslations: jest.Mock;
    putCategoryTranslation: jest.Mock;
    deleteCategoryTranslation: jest.Mock;
  };
  let imageStorageService: {
    saveImage: jest.Mock;
    deleteImage: jest.Mock;
    deleteImageBestEffort: jest.Mock;
  };
  let controller: CategoriesController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = CategoriesController.prototype.listCategories;
  const createHandler = CategoriesController.prototype.createCategory;
  const updateHandler = CategoriesController.prototype.updateCategory;
  const uploadImageHandler = CategoriesController.prototype.uploadCategoryImage;
  const removeImageHandler = CategoriesController.prototype.removeCategoryImage;
  const getTranslationsHandler =
    CategoriesController.prototype.getCategoryTranslations;
  const putTranslationHandler =
    CategoriesController.prototype.putCategoryTranslation;
  const deleteTranslationHandler =
    CategoriesController.prototype.deleteCategoryTranslation;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    categoriesService = {
      listCategories: jest.fn().mockResolvedValue([]),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      categoryExists: jest.fn().mockResolvedValue(true),
      setCategoryImage: jest.fn(),
      clearCategoryImage: jest.fn(),
      getCategoryTranslations: jest.fn(),
      putCategoryTranslation: jest.fn(),
      deleteCategoryTranslation: jest.fn(),
    };
    imageStorageService = {
      saveImage: jest
        .fn()
        .mockResolvedValue({ assetPath: '/media/new-file.jpg' }),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      deleteImageBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    controller = new CategoriesController(
      categoriesService as never,
      imageStorageService as never,
    );
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

  describe('POST :categoryId/image', () => {
    function buildFile(
      overrides: Partial<{ mimetype: string; size: number }> = {},
    ) {
      return {
        originalname: 'photo.jpg',
        mimetype: overrides.mimetype ?? 'image/jpeg',
        size: overrides.size ?? 1024,
        // Real JPEG magic bytes (FF D8 FF) -- `assertValidImageUpload` now
        // sniffs the actual signature, so a valid-upload test must supply a
        // buffer that genuinely matches its claimed `image/jpeg` mimetype.
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      };
    }

    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        uploadImageHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        uploadImageHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('saves the file, persists the new path, and returns it (valid upload)', async () => {
      categoriesService.setCategoryImage.mockResolvedValue({
        outcome: 'updated',
        data: { id: 'category-1', imageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: null,
      });

      const body = await controller.uploadCategoryImage(
        'category-1',
        buildFile(),
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.saveImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(categoriesService.setCategoryImage).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
        imageAssetPath: '/media/new-file.jpg',
      });
      expect(body).toEqual({ data: { imageAssetPath: '/media/new-file.jpg' } });
      // No previous image -- cleanup is still called (it no-ops internally on null).
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        null,
      );
    });

    it('removes the old asset after successfully replacing an existing image', async () => {
      categoriesService.setCategoryImage.mockResolvedValue({
        outcome: 'updated',
        data: { id: 'category-1', imageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: '/media/old-file.jpg',
      });

      await controller.uploadCategoryImage(
        'category-1',
        buildFile(),
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/old-file.jpg',
      );
    });

    it('rejects a non-whitelisted MIME type with INVALID_IMAGE_TYPE, without saving anything', async () => {
      await expect(
        controller.uploadCategoryImage(
          'category-1',
          buildFile({ mimetype: 'application/pdf' }),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'INVALID_IMAGE_TYPE',
            message: 'Only JPEG, PNG, and WebP images are supported.',
          },
        },
      });
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
    });

    it('rejects a file above 5 MB with IMAGE_TOO_LARGE, without saving anything', async () => {
      await expect(
        controller.uploadCategoryImage(
          'category-1',
          buildFile({ size: 5 * 1024 * 1024 + 1 }),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'IMAGE_TOO_LARGE',
            message: 'Image must be 5 MB or smaller.',
          },
        },
      });
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
    });

    it('rejects a missing file with IMAGE_REQUIRED', async () => {
      await expect(
        controller.uploadCategoryImage(
          'category-1',
          undefined,
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'IMAGE_REQUIRED',
            message: 'An image file is required.',
          },
        },
      });
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
    });

    it('maps a foreign/unknown Category to 404 CATEGORY_NOT_FOUND WITHOUT ever saving the file (Tenant preflight, FT-2 code review blocker)', async () => {
      categoriesService.categoryExists.mockResolvedValue(false);

      await expect(
        controller.uploadCategoryImage(
          'foreign-category',
          buildFile(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
      expect(categoriesService.categoryExists).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'foreign-category',
      });
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
      expect(categoriesService.setCategoryImage).not.toHaveBeenCalled();
    });

    it('cleans up the just-saved file and maps a foreign/unknown Category to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.setCategoryImage.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.uploadCategoryImage(
          'unknown-id',
          buildFile(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/new-file.jpg',
      );
    });
  });

  describe('DELETE :categoryId/image', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        removeImageHandler,
      ) as unknown[];

      expectMutationGuardChain(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        removeImageHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('clears the image and removes the old local asset', async () => {
      categoriesService.clearCategoryImage.mockResolvedValue({
        outcome: 'cleared',
        previousImageAssetPath: '/media/old-file.jpg',
      });

      const body = await controller.removeCategoryImage(
        'category-1',
        buildRequest('authorized-restaurant'),
      );

      expect(categoriesService.clearCategoryImage).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
      });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/old-file.jpg',
      );
      expect(body).toBeUndefined();
    });

    it('is idempotent when no image is set (nothing to delete)', async () => {
      categoriesService.clearCategoryImage.mockResolvedValue({
        outcome: 'cleared',
        previousImageAssetPath: null,
      });

      await controller.removeCategoryImage(
        'category-1',
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        null,
      );
    });

    it('maps a foreign/unknown Category to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.clearCategoryImage.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.removeCategoryImage(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });
  });

  describe('GET :categoryId/translations', () => {
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

    it('forwards restaurantId from authorized context and categoryId from the route param', async () => {
      categoriesService.getCategoryTranslations.mockResolvedValue({
        outcome: 'found',
        data: [{ locale: 'en', name: 'Appetizers', description: null }],
      });

      const body = await controller.getCategoryTranslations(
        'category-1',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(categoriesService.getCategoryTranslations).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
      });
      expect(body).toEqual({
        data: [{ locale: 'en', name: 'Appetizers', description: null }],
      });
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.getCategoryTranslations.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.getCategoryTranslations(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });
  });

  describe('PUT :categoryId/translations/:locale', () => {
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

    it('forwards restaurantId from authorized context, categoryId/locale from route params, and dto fields', async () => {
      categoriesService.putCategoryTranslation.mockResolvedValue({
        outcome: 'updated',
        data: { locale: 'ar', name: 'المقبلات', description: null },
      });
      const dto = new PutTranslationDto();
      dto.name = 'المقبلات';
      dto.description = null;

      const body = await controller.putCategoryTranslation(
        'category-1',
        'ar',
        dto,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(categoriesService.putCategoryTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
        locale: 'ar',
        name: 'المقبلات',
        description: null,
      });
      expect(body).toEqual({
        data: { locale: 'ar', name: 'المقبلات', description: null },
      });
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.putCategoryTranslation.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.putCategoryTranslation(
          'unknown-id',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      categoriesService.putCategoryTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.putCategoryTranslation(
          'category-1',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('DELETE :categoryId/translations/:locale', () => {
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

    it('forwards restaurantId from authorized context and categoryId/locale from route params, returns undefined on success', async () => {
      categoriesService.deleteCategoryTranslation.mockResolvedValue({
        outcome: 'deleted',
      });

      const body = await controller.deleteCategoryTranslation(
        'category-1',
        'ar',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(categoriesService.deleteCategoryTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
        locale: 'ar',
      });
      expect(body).toBeUndefined();
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      categoriesService.deleteCategoryTranslation.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.deleteCategoryTranslation(
          'unknown-id',
          'ar',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      categoriesService.deleteCategoryTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.deleteCategoryTranslation(
          'category-1',
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
      categoriesService.deleteCategoryTranslation.mockResolvedValue({
        outcome: 'defaultTranslationRequired',
      });

      await expect(
        controller.deleteCategoryTranslation(
          'category-1',
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
    });
  });
});
