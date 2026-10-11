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
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { PutTranslationDto } from './dto/put-translation.dto';
import { UpdateProductAvailabilityDto } from './dto/update-product-availability.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsController } from './products.controller';
import type { ProductWithTranslation } from './products.service';

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

const SAMPLE_PRODUCT: ProductWithTranslation = {
  id: 'product-1',
  publicId: 'product-uuid',
  categoryId: 'category-1',
  status: 'ACTIVE',
  availability: 'AVAILABLE',
  basePrice: '250.00',
  primaryImageAssetPath: null,
  displayOrder: 0,
  allowCustomerNotes: true,
  featured: false,
  discount: null,
  translation: { locale: 'ar', name: 'برجر', description: null },
};

describe('ProductsController', () => {
  let productsService: {
    listProducts: jest.Mock;
    createProduct: jest.Mock;
    updateProduct: jest.Mock;
    updateAvailability: jest.Mock;
    productExists: jest.Mock;
    setProductImage: jest.Mock;
    clearProductImage: jest.Mock;
    getProductTranslations: jest.Mock;
    putProductTranslation: jest.Mock;
    deleteProductTranslation: jest.Mock;
  };
  let imageStorageService: {
    saveImage: jest.Mock;
    deleteImage: jest.Mock;
    deleteImageBestEffort: jest.Mock;
  };
  let controller: ProductsController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = ProductsController.prototype.listProducts;
  const createHandler = ProductsController.prototype.createProduct;
  const updateHandler = ProductsController.prototype.updateProduct;
  const availabilityHandler =
    ProductsController.prototype.updateProductAvailability;
  const uploadImageHandler = ProductsController.prototype.uploadProductImage;
  const removeImageHandler = ProductsController.prototype.removeProductImage;
  const getTranslationsHandler =
    ProductsController.prototype.getProductTranslations;
  const putTranslationHandler =
    ProductsController.prototype.putProductTranslation;
  const deleteTranslationHandler =
    ProductsController.prototype.deleteProductTranslation;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    productsService = {
      listProducts: jest.fn().mockResolvedValue([]),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      updateAvailability: jest.fn(),
      productExists: jest.fn().mockResolvedValue(true),
      setProductImage: jest.fn(),
      clearProductImage: jest.fn(),
      getProductTranslations: jest.fn(),
      putProductTranslation: jest.fn(),
      deleteProductTranslation: jest.fn(),
    };
    imageStorageService = {
      saveImage: jest
        .fn()
        .mockResolvedValue({ assetPath: '/media/new-file.jpg' }),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      deleteImageBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    controller = new ProductsController(
      productsService as never,
      imageStorageService as never,
    );
  });

  function expectNoBranchGuard(guards: unknown[]) {
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(BranchManagementAccessGuard);
  }

  function expectMutationGuardChain(guards: unknown[]) {
    expect(guards).toEqual([
      AuthGuard,
      CsrfGuard,
      RestaurantAccessGuard,
      PermissionGuard,
      AllBranchesRequiredGuard,
    ]);
    expectNoBranchGuard(guards);
  }

  function expectReadGuardChain(guards: unknown[]) {
    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
    expect(guards).not.toContain(CsrfGuard);
    expect(guards).not.toContain(AllBranchesRequiredGuard);
    expectNoBranchGuard(guards);
  }

  describe('GET (list)', () => {
    it('declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard, no CSRF/AllBranchesRequiredGuard', () => {
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
      expect(guards).not.toContain(AllBranchesRequiredGuard);
      expectNoBranchGuard(guards);
    });

    it('requires exactly menu.view', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        listHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_VIEW);
    });

    it('scopes by request.restaurantAccess.restaurantId and forwards the optional categoryId filter', async () => {
      const query = new ListProductsQueryDto();
      query.categoryId = 'category-1';

      await controller.listProducts(
        query,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(productsService.listProducts).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
      });
    });

    it('wraps the result in the exact { data } envelope, including an empty list', async () => {
      const body = await controller.listProducts(
        new ListProductsQueryDto(),
        buildRequest('restaurant-1'),
      );

      expect(body).toEqual({ data: [] });
    });
  });

  describe('POST (create)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard', () => {
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
      expectNoBranchGuard(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        createHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId from authorized context and dto fields on success', async () => {
      productsService.createProduct.mockResolvedValue({
        outcome: 'created',
        data: SAMPLE_PRODUCT,
      });
      const dto = new CreateProductDto();
      dto.categoryId = 'category-1';
      dto.name = 'برجر';
      dto.description = null;
      dto.status = 'ACTIVE';
      dto.availability = 'AVAILABLE';
      dto.basePrice = '250.00';
      dto.displayOrder = 0;
      dto.allowCustomerNotes = true;
      dto.featured = false;

      const body = await controller.createProduct(
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(productsService.createProduct).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        categoryId: 'category-1',
        name: 'برجر',
        description: null,
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        basePrice: '250.00',
        displayOrder: 0,
        allowCustomerNotes: true,
        featured: false,
      });
      expect(body).toEqual({ data: SAMPLE_PRODUCT });
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      productsService.createProduct.mockResolvedValue({
        outcome: 'categoryNotFound',
      });
      const dto = new CreateProductDto();

      await expect(
        controller.createProduct(dto, buildRequest('authorized-restaurant')),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });
  });

  describe('PATCH :productId (update)', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard', () => {
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
      expectNoBranchGuard(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        updateHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId + productId (route param) + dto fields on success', async () => {
      productsService.updateProduct.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_PRODUCT,
      });
      const dto = new UpdateProductDto();
      dto.name = 'New Name';

      const body = await controller.updateProduct(
        'product-1',
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(productsService.updateProduct).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
        categoryId: undefined,
        name: 'New Name',
        description: undefined,
        status: undefined,
        basePrice: undefined,
        displayOrder: undefined,
        allowCustomerNotes: undefined,
        featured: undefined,
      });
      expect(body).toEqual({ data: SAMPLE_PRODUCT });
    });

    it('maps productNotFound to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.updateProduct.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.updateProduct(
          'unknown-id',
          new UpdateProductDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });

    it('maps categoryNotFound to 404 CATEGORY_NOT_FOUND', async () => {
      productsService.updateProduct.mockResolvedValue({
        outcome: 'categoryNotFound',
      });

      await expect(
        controller.updateProduct(
          'product-1',
          new UpdateProductDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
        },
      });
    });
  });

  describe('PATCH :productId/availability', () => {
    it('declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard -> AllBranchesRequiredGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        availabilityHandler,
      ) as unknown[];

      expect(guards).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
        AllBranchesRequiredGuard,
      ]);
      expectNoBranchGuard(guards);
    });

    it('requires exactly menu.manage', () => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        availabilityHandler,
      ) as string;

      expect(permission).toBe(PERMISSIONS.MENU_MANAGE);
    });

    it('forwards restaurantId + productId + availability on success, returning only { id, availability }', async () => {
      productsService.updateAvailability.mockResolvedValue({
        outcome: 'updated',
        data: { id: 'product-1', availability: 'SOLD_OUT' },
      });
      const dto = new UpdateProductAvailabilityDto();
      dto.availability = 'SOLD_OUT';

      const body = await controller.updateProductAvailability(
        'product-1',
        dto,
        buildRequest('authorized-restaurant'),
      );

      expect(productsService.updateAvailability).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
        availability: 'SOLD_OUT',
      });
      expect(body).toEqual({
        data: { id: 'product-1', availability: 'SOLD_OUT' },
      });
    });

    it('maps productNotFound to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.updateAvailability.mockResolvedValue({
        outcome: 'productNotFound',
      });
      const dto = new UpdateProductAvailabilityDto();
      dto.availability = 'AVAILABLE';

      await expect(
        controller.updateProductAvailability(
          'unknown-id',
          dto,
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });
  });

  describe('POST :productId/image', () => {
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
      productsService.setProductImage.mockResolvedValue({
        outcome: 'updated',
        data: { id: 'product-1', primaryImageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: null,
      });

      const body = await controller.uploadProductImage(
        'product-1',
        buildFile(),
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.saveImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(productsService.setProductImage).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
        imageAssetPath: '/media/new-file.jpg',
      });
      expect(body).toEqual({
        data: { primaryImageAssetPath: '/media/new-file.jpg' },
      });
      // No previous image -- cleanup is still called (it no-ops internally on null).
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        null,
      );
    });

    it('removes the old asset after successfully replacing an existing image', async () => {
      productsService.setProductImage.mockResolvedValue({
        outcome: 'updated',
        data: { id: 'product-1', primaryImageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: '/media/old-file.jpg',
      });

      await controller.uploadProductImage(
        'product-1',
        buildFile(),
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/old-file.jpg',
      );
    });

    it('rejects a non-whitelisted MIME type with INVALID_IMAGE_TYPE, without saving anything', async () => {
      await expect(
        controller.uploadProductImage(
          'product-1',
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
        controller.uploadProductImage(
          'product-1',
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
        controller.uploadProductImage(
          'product-1',
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

    it('maps a foreign/unknown Product to 404 PRODUCT_NOT_FOUND WITHOUT ever saving the file (Tenant preflight, FT-2 code review blocker)', async () => {
      productsService.productExists.mockResolvedValue(false);

      await expect(
        controller.uploadProductImage(
          'foreign-product',
          buildFile(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
      expect(productsService.productExists).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'foreign-product',
      });
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
      expect(productsService.setProductImage).not.toHaveBeenCalled();
    });

    it('cleans up the just-saved file and maps a foreign/unknown Product to 404 PRODUCT_NOT_FOUND, never touching the old asset', async () => {
      productsService.setProductImage.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.uploadProductImage(
          'unknown-id',
          buildFile(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/new-file.jpg',
      );
    });

    it('cleans up the just-saved orphan file if the DB write itself throws', async () => {
      productsService.setProductImage.mockRejectedValue(new Error('db down'));

      await expect(
        controller.uploadProductImage(
          'product-1',
          buildFile(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toThrow('db down');
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/new-file.jpg',
      );
    });
  });

  describe('DELETE :productId/image', () => {
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
      productsService.clearProductImage.mockResolvedValue({
        outcome: 'cleared',
        previousImageAssetPath: '/media/old-file.jpg',
      });

      const body = await controller.removeProductImage(
        'product-1',
        buildRequest('authorized-restaurant'),
      );

      expect(productsService.clearProductImage).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
      });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        '/media/old-file.jpg',
      );
      expect(body).toBeUndefined();
    });

    it('is idempotent when no image is set (nothing to delete)', async () => {
      productsService.clearProductImage.mockResolvedValue({
        outcome: 'cleared',
        previousImageAssetPath: null,
      });

      await controller.removeProductImage(
        'product-1',
        buildRequest('authorized-restaurant'),
      );

      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith(
        null,
      );
    });

    it('maps a foreign/unknown Product to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.clearProductImage.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.removeProductImage(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });
  });

  describe('GET :productId/translations', () => {
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

    it('forwards restaurantId from authorized context and productId from the route param', async () => {
      productsService.getProductTranslations.mockResolvedValue({
        outcome: 'found',
        data: [{ locale: 'en', name: 'Burger', description: null }],
      });

      const body = await controller.getProductTranslations(
        'product-1',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(productsService.getProductTranslations).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
      });
      expect(body).toEqual({
        data: [{ locale: 'en', name: 'Burger', description: null }],
      });
    });

    it('maps productNotFound to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.getProductTranslations.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.getProductTranslations(
          'unknown-id',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });
  });

  describe('PUT :productId/translations/:locale', () => {
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

    it('forwards restaurantId from authorized context, productId/locale from route params, and dto fields', async () => {
      productsService.putProductTranslation.mockResolvedValue({
        outcome: 'updated',
        data: { locale: 'ar', name: 'برجر', description: null },
      });
      const dto = new PutTranslationDto();
      dto.name = 'برجر';
      dto.description = null;

      const body = await controller.putProductTranslation(
        'product-1',
        'ar',
        dto,
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(productsService.putProductTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
        locale: 'ar',
        name: 'برجر',
        description: null,
      });
      expect(body).toEqual({
        data: { locale: 'ar', name: 'برجر', description: null },
      });
    });

    it('maps productNotFound to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.putProductTranslation.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.putProductTranslation(
          'unknown-id',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      productsService.putProductTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.putProductTranslation(
          'product-1',
          'ar',
          new PutTranslationDto(),
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('DELETE :productId/translations/:locale', () => {
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

    it('forwards restaurantId from authorized context and productId/locale from route params, returns undefined on success', async () => {
      productsService.deleteProductTranslation.mockResolvedValue({
        outcome: 'deleted',
      });

      const body = await controller.deleteProductTranslation(
        'product-1',
        'ar',
        buildRequest('authorized-restaurant', 'attacker-supplied-value'),
      );

      expect(productsService.deleteProductTranslation).toHaveBeenCalledWith({
        restaurantId: 'authorized-restaurant',
        productId: 'product-1',
        locale: 'ar',
      });
      expect(body).toBeUndefined();
    });

    it('maps productNotFound to 404 PRODUCT_NOT_FOUND', async () => {
      productsService.deleteProductTranslation.mockResolvedValue({
        outcome: 'productNotFound',
      });

      await expect(
        controller.deleteProductTranslation(
          'unknown-id',
          'ar',
          buildRequest('authorized-restaurant'),
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' },
        },
      });
    });

    it('maps localeNotActive to 409 LOCALE_NOT_ACTIVE', async () => {
      productsService.deleteProductTranslation.mockResolvedValue({
        outcome: 'localeNotActive',
      });

      await expect(
        controller.deleteProductTranslation(
          'product-1',
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
      productsService.deleteProductTranslation.mockResolvedValue({
        outcome: 'defaultTranslationRequired',
      });

      await expect(
        controller.deleteProductTranslation(
          'product-1',
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
