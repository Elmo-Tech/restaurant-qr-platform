import { Prisma } from '../generated/prisma/client';
import { ProductsService } from './products.service';

/** Isolates the one unavoidable `any`-erasure point (`jest.Mock.mock.calls` is untyped) behind a single typed helper. */
function firstCallArgs(mockFn: jest.Mock): Record<string, unknown> {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0][0] as Record<string, unknown>;
}

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'ar';
const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

const SAFE_PRODUCT_ROW = {
  id: 'product-1',
  publicId: 'product-uuid',
  categoryId: 'category-1',
  status: 'ACTIVE' as const,
  availability: 'AVAILABLE' as const,
  basePrice: new Prisma.Decimal('250.00'),
  primaryImageAssetPath: null,
  displayOrder: 0,
  allowCustomerNotes: true,
  featured: false,
  discountType: null,
  discountValue: null,
  discountEnabled: false,
  discountStartsOn: null,
  discountEndsOn: null,
};

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const productFindMany = jest.fn().mockResolvedValue([]);
  const categoryFindFirst = jest.fn().mockResolvedValue({ id: 'category-1' });
  // Mirrors a real `select: PRODUCT_SAFE_SELECT` query -- `updateProduct`'s
  // ownership check now selects every response field (not just `id`), so a
  // fully-empty-body no-op can return this row directly without a second
  // read.
  const productFindFirst = jest.fn().mockResolvedValue({ ...SAFE_PRODUCT_ROW });
  const productCreate = jest.fn();
  const productUpdate = jest.fn();
  const productTranslationCreate = jest.fn();
  const productTranslationUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: 1 });
  const productTranslationFindFirstOrThrow = jest.fn();
  const productTranslationFindMany = jest.fn().mockResolvedValue([]);
  const productTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const productTranslationUpsert = jest.fn();
  const productTranslationDeleteMany = jest
    .fn()
    .mockResolvedValue({ count: 0 });
  const restaurantLocaleFindUnique = jest
    .fn()
    .mockResolvedValue({ isActive: true });

  const txClient = {
    restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
    restaurantLocale: { findUnique: restaurantLocaleFindUnique },
    category: { findFirst: categoryFindFirst },
    product: {
      findFirst: productFindFirst,
      create: productCreate,
      update: productUpdate,
    },
    productTranslation: {
      create: productTranslationCreate,
      updateMany: productTranslationUpdateMany,
      findFirstOrThrow: productTranslationFindFirstOrThrow,
      findMany: productTranslationFindMany,
      findUnique: productTranslationFindUnique,
      upsert: productTranslationUpsert,
      deleteMany: productTranslationDeleteMany,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      branch: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Africa/Cairo' }) },
      product: {
        findMany: productFindMany,
        findFirst: productFindFirst,
        update: productUpdate,
      },
      productTranslation: { findMany: productTranslationFindMany },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    restaurantLocaleFindUnique,
    productFindMany,
    categoryFindFirst,
    productFindFirst,
    productCreate,
    productUpdate,
    productTranslationCreate,
    productTranslationUpdateMany,
    productTranslationFindFirstOrThrow,
    productTranslationFindMany,
    productTranslationFindUnique,
    productTranslationUpsert,
    productTranslationDeleteMany,
    $transaction,
  };
}

function buildService(
  mock: ReturnType<typeof buildPrismaMock>,
): ProductsService {
  return new ProductsService(mock.prisma as never);
}

describe('ProductsService', () => {
  describe('listProducts', () => {
    it('scopes the query by restaurantId only when no categoryId filter is supplied', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.listProducts({ restaurantId: RESTAURANT_ID });

      expect(mock.productFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: RESTAURANT_ID },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('adds the categoryId filter alongside restaurantId, never in place of it', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.listProducts({
        restaurantId: RESTAURANT_ID,
        categoryId: 'category-1',
      });

      expect(mock.productFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: RESTAURANT_ID, categoryId: 'category-1' },
        }),
      );
    });

    it('formats basePrice to an exact 2-decimal string', async () => {
      const mock = buildPrismaMock();
      mock.productFindMany.mockResolvedValue([
        {
          ...SAFE_PRODUCT_ROW,
          basePrice: new Prisma.Decimal('10.5'),
          translations: [
            { locale: DEFAULT_LOCALE, name: 'برجر', description: null },
          ],
        },
      ]);
      const service = buildService(mock);

      const result = await service.listProducts({
        restaurantId: RESTAURANT_ID,
      });

      expect(result[0]?.basePrice).toBe('10.50');
    });

    it('returns an empty array when there are no Products', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.listProducts({
        restaurantId: RESTAURANT_ID,
      });

      expect(result).toEqual([]);
    });
  });

  describe('createProduct', () => {
    const baseInput = {
      restaurantId: RESTAURANT_ID,
      categoryId: 'category-1',
      name: 'برجر',
      description: null,
      status: 'ACTIVE' as const,
      availability: 'AVAILABLE' as const,
      basePrice: '250.00',
      displayOrder: 0,
      allowCustomerNotes: true,
      featured: false,
    };

    it('resolves the Category by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.productCreate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createProduct(baseInput);

      expect(mock.categoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'category-1', restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown/foreign categoryId -> categoryNotFound, no Product or translation ever written', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.createProduct(baseInput);

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.productCreate).not.toHaveBeenCalled();
      expect(mock.productTranslationCreate).not.toHaveBeenCalled();
    });

    it('converts the validated decimal string to a Prisma.Decimal, never JS floating point', async () => {
      const mock = buildPrismaMock();
      mock.productCreate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createProduct(baseInput);

      const createCall = firstCallArgs(mock.productCreate) as {
        data: { basePrice: Prisma.Decimal };
      };
      expect(createCall.data.basePrice).toBeInstanceOf(Prisma.Decimal);
      expect(createCall.data.basePrice.toFixed(2)).toBe('250.00');
    });

    it('always persists primaryImageAssetPath as null and generates a server-controlled publicId', async () => {
      const mock = buildPrismaMock();
      mock.productCreate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createProduct(baseInput);

      const createCall = firstCallArgs(mock.productCreate) as {
        data: { primaryImageAssetPath: string | null; publicId: string };
      };
      expect(createCall.data.primaryImageAssetPath).toBeNull();
      expect(createCall.data.publicId).toMatch(/^product-[0-9a-f-]{36}$/i);
    });

    it('never persists a Product without its translation created in the same transaction', async () => {
      const mock = buildPrismaMock();
      mock.productCreate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createProduct(baseInput);

      expect(mock.$transaction).toHaveBeenCalledTimes(1);
      expect(mock.productTranslationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            productId: SAFE_PRODUCT_ROW.id,
            locale: DEFAULT_LOCALE,
            name: baseInput.name,
            description: null,
          },
        }),
      );
    });
  });

  describe('updateProduct', () => {
    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.restaurantFindUniqueOrThrow).not.toHaveBeenCalled();
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the Product by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.productUpdate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'برجر',
        description: null,
      });
      const service = buildService(mock);

      await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(mock.productFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown/foreign productId -> productNotFound, no update ever attempted', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('a category move resolves the target Category by id AND restaurantId; unknown/foreign -> categoryNotFound', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        categoryId: 'foreign-category',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'foreign-category', restaurantId: RESTAURANT_ID },
        }),
      );
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('only supplied fields are included in the Product update data', async () => {
      const mock = buildPrismaMock();
      mock.productUpdate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'برجر',
        description: null,
      });
      const service = buildService(mock);

      await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        featured: true,
      });

      expect(mock.productUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { featured: true } }),
      );
    });

    it('supplying name/description updates the default-locale translation via updateMany, then re-reads it for the response', async () => {
      const mock = buildPrismaMock();
      mock.productUpdate.mockResolvedValue(SAFE_PRODUCT_ROW);
      mock.productTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'New Name',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        name: 'New Name',
      });

      expect(mock.productTranslationUpdateMany).toHaveBeenCalledWith({
        where: { productId: SAFE_PRODUCT_ROW.id, locale: DEFAULT_LOCALE },
        data: { name: 'New Name' },
      });
      expect(result).toEqual({
        outcome: 'updated',
        data: expect.objectContaining({
          translation: {
            locale: DEFAULT_LOCALE,
            name: 'New Name',
            description: null,
          },
        }) as unknown,
      });
    });

    it('omitting every field is a true no-op -- zero writes, current row returned unchanged (corrected: no longer an empty-data update call)', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'برجر',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.updateProduct({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(mock.productUpdate).not.toHaveBeenCalled();
      expect(mock.productTranslationUpdateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'updated',
        data: {
          id: SAFE_PRODUCT_ROW.id,
          publicId: SAFE_PRODUCT_ROW.publicId,
          categoryId: SAFE_PRODUCT_ROW.categoryId,
          status: SAFE_PRODUCT_ROW.status,
          availability: SAFE_PRODUCT_ROW.availability,
          basePrice: '250.00',
          primaryImageAssetPath: null,
          displayOrder: 0,
          allowCustomerNotes: true,
          featured: false,
          discount: null,
          translation: {
            locale: DEFAULT_LOCALE,
            name: 'برجر',
            description: null,
          },
        },
      });
    });
  });

  describe('updateAvailability', () => {
    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.updateAvailability({
        restaurantId: RESTAURANT_ID,
        productId: 'not-a-uuid',
        availability: 'SOLD_OUT',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign productId -> productNotFound, no update attempted', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateAvailability({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        availability: 'SOLD_OUT',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('changes only availability, returning exactly { id, availability }', async () => {
      const mock = buildPrismaMock();
      mock.productUpdate.mockResolvedValue({
        id: 'product-1',
        availability: 'SOLD_OUT',
      });
      const service = buildService(mock);

      const result = await service.updateAvailability({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        availability: 'SOLD_OUT',
      });

      expect(mock.productUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { availability: 'SOLD_OUT' },
        select: { id: true, availability: true },
      });
      expect(result).toEqual({
        outcome: 'updated',
        data: { id: 'product-1', availability: 'SOLD_OUT' },
      });
    });
  });

  describe('setProductImage', () => {
    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.setProductImage({
        restaurantId: RESTAURANT_ID,
        productId: 'not-a-uuid',
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign-Restaurant productId -> productNotFound, no update attempted (Tenant hiding)', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.setProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('scopes the ownership check by id + restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.productUpdate.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: '/media/new-file.jpg',
      });
      const service = buildService(mock);

      await service.setProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(mock.productFindFirst).toHaveBeenCalledWith({
        where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        select: { id: true, primaryImageAssetPath: true },
      });
    });

    it('persists the new path via Product.update and reports the previous path for cleanup', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: '/media/old-file.jpg',
      });
      mock.productUpdate.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: '/media/new-file.jpg',
      });
      const service = buildService(mock);

      const result = await service.setProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(mock.productUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { primaryImageAssetPath: '/media/new-file.jpg' },
        select: { id: true, primaryImageAssetPath: true },
      });
      expect(result).toEqual({
        outcome: 'updated',
        data: { id: 'product-1', primaryImageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: '/media/old-file.jpg',
      });
    });

    it('reports null as the previous path when the Product had no image yet', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: null,
      });
      mock.productUpdate.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: '/media/new-file.jpg',
      });
      const service = buildService(mock);

      const result = await service.setProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(result).toMatchObject({ previousImageAssetPath: null });
    });
  });

  describe('clearProductImage', () => {
    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.clearProductImage({
        restaurantId: RESTAURANT_ID,
        productId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign-Restaurant productId -> productNotFound (Tenant hiding)', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.clearProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('clears primaryImageAssetPath to null and reports the previous path', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: '/media/old-file.jpg',
      });
      const service = buildService(mock);

      const result = await service.clearProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(mock.productUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { primaryImageAssetPath: null },
      });
      expect(result).toEqual({
        outcome: 'cleared',
        previousImageAssetPath: '/media/old-file.jpg',
      });
    });

    it('is idempotent: no write when the image is already null', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue({
        id: 'product-1',
        primaryImageAssetPath: null,
      });
      const service = buildService(mock);

      const result = await service.clearProductImage({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(mock.productUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'cleared',
        previousImageAssetPath: null,
      });
    });
  });

  describe('getProductTranslations', () => {
    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.getProductTranslations({
        restaurantId: RESTAURANT_ID,
        productId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign productId -> productNotFound', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.getProductTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
    });

    it('returns every existing translation row, raw, deterministically ordered', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindMany.mockResolvedValue([
        { locale: 'ar', name: 'برجر', description: null },
        { locale: 'en', name: 'Burger', description: 'desc' },
      ]);
      const service = buildService(mock);

      const result = await service.getProductTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [
          { locale: 'ar', name: 'برجر', description: null },
          { locale: 'en', name: 'Burger', description: 'desc' },
        ],
      });
      expect(mock.productTranslationFindMany).toHaveBeenCalledWith({
        where: { productId: 'product-1' },
        select: { locale: true, name: true, description: true },
        orderBy: { locale: 'asc' },
      });
    });

    it('a missing secondary translation is simply absent -- no fallback/synthetic row', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindMany.mockResolvedValue([
        { locale: 'en', name: 'Burger', description: null },
      ]);
      const service = buildService(mock);

      const result = await service.getProductTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [{ locale: 'en', name: 'Burger', description: null }],
      });
    });

    it('never writes', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.getProductTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
      });

      expect(mock.$transaction).not.toHaveBeenCalled();
      expect(mock.productTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.productTranslationDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('putProductTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      locale: 'ar' as const,
      name: 'برجر',
      description: null,
    };

    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.putProductTranslation({
        ...BASE_INPUT,
        productId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('unknown/foreign productId -> productNotFound, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productTranslationUpsert).not.toHaveBeenCalled();
    });

    it('inactive locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.putProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.productTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('active secondary locale, missing translation -> creates via upsert and touches Product.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindUnique.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putProductTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'برجر', description: null },
      });
      expect(mock.productTranslationUpsert).toHaveBeenCalledWith({
        where: {
          productId_locale: { productId: 'product-1', locale: 'ar' },
        },
        create: {
          productId: 'product-1',
          locale: 'ar',
          name: 'برجر',
          description: null,
        },
        update: { name: 'برجر', description: null },
      });
      expect(mock.productUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('active secondary locale, existing DIFFERENT translation -> replaces via upsert and touches Product.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindUnique.mockResolvedValue({
        name: 'old name',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.putProductTranslation(BASE_INPUT);

      expect(result.outcome).toBe('updated');
      expect(mock.productTranslationUpsert).toHaveBeenCalledTimes(1);
      expect(mock.productUpdate).toHaveBeenCalledTimes(1);
    });

    it('the default locale can be written (writing the default locale is allowed by policy)', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.productTranslationFindUnique.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putProductTranslation({
        ...BASE_INPUT,
        locale: 'en',
      });

      expect(result.outcome).toBe('updated');
    });

    it('an exact normalized no-op returns the existing row without rewriting it and without touching Product.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.productTranslationFindUnique.mockResolvedValue({
        name: 'برجر',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.putProductTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'برجر', description: null },
      });
      expect(mock.productTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('Tenant-scoped: resolves the Product by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.putProductTranslation(BASE_INPUT);

      expect(mock.productFindFirst).toHaveBeenCalledWith({
        where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        select: { id: true },
      });
      expect(mock.restaurantLocaleFindUnique).toHaveBeenCalledWith({
        where: {
          restaurantId_locale: { restaurantId: RESTAURANT_ID, locale: 'ar' },
        },
        select: { isActive: true },
      });
    });
  });

  describe('deleteProductTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      locale: 'ar' as const,
    };

    it('a malformed productId -> productNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.deleteProductTranslation({
        ...BASE_INPUT,
        productId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('unknown/foreign productId -> productNotFound', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.deleteProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'productNotFound' });
      expect(mock.productTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('the default locale can never be deleted -> defaultTranslationRequired, regardless of row existence, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'ar',
      });
      const service = buildService(mock);

      const result = await service.deleteProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'defaultTranslationRequired' });
      expect(mock.productTranslationDeleteMany).not.toHaveBeenCalled();
      expect(mock.productUpdate).not.toHaveBeenCalled();
    });

    it('an inactive secondary locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.deleteProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.productTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('an active secondary locale with an existing row -> deletes it and touches Product.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.productTranslationDeleteMany.mockResolvedValue({ count: 1 });
      const service = buildService(mock);

      const result = await service.deleteProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.productTranslationDeleteMany).toHaveBeenCalledWith({
        where: { productId: 'product-1', locale: 'ar' },
      });
      expect(mock.productUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('an active secondary locale with NO existing row -> safe 204 no-op, never creates anything, no timestamp touch', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.productTranslationDeleteMany.mockResolvedValue({ count: 0 });
      const service = buildService(mock);

      const result = await service.deleteProductTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.productUpdate).not.toHaveBeenCalled();
      expect(mock.productTranslationUpsert).not.toHaveBeenCalled();
    });

    it('never affects another Restaurant -- scoped by productId resolved under restaurantId', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.deleteProductTranslation(BASE_INPUT);

      expect(mock.productFindFirst).toHaveBeenCalledWith({
        where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        select: { id: true },
      });
    });
  });
});
