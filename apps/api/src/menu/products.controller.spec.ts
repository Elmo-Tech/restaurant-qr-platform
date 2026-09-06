import { GUARDS_METADATA } from '@nestjs/common/constants';
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
  translation: { locale: 'ar', name: 'برجر', description: null },
};

describe('ProductsController', () => {
  let productsService: {
    listProducts: jest.Mock;
    createProduct: jest.Mock;
    updateProduct: jest.Mock;
    updateAvailability: jest.Mock;
  };
  let controller: ProductsController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = ProductsController.prototype.listProducts;
  const createHandler = ProductsController.prototype.createProduct;
  const updateHandler = ProductsController.prototype.updateProduct;
  const availabilityHandler =
    ProductsController.prototype.updateProductAvailability;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    productsService = {
      listProducts: jest.fn().mockResolvedValue([]),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      updateAvailability: jest.fn(),
    };
    controller = new ProductsController(productsService as never);
  });

  function expectNoBranchGuard(guards: unknown[]) {
    expect(guards).not.toContain(BranchAccessGuard);
    expect(guards).not.toContain(BranchManagementAccessGuard);
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
});
