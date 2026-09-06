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

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const productFindMany = jest.fn().mockResolvedValue([]);
  const categoryFindFirst = jest.fn().mockResolvedValue({ id: 'category-1' });
  const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
  const productCreate = jest.fn();
  const productUpdate = jest.fn();
  const productTranslationCreate = jest.fn();
  const productTranslationUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: 1 });
  const productTranslationFindFirstOrThrow = jest.fn();

  const txClient = {
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
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      product: {
        findMany: productFindMany,
        findFirst: productFindFirst,
        update: productUpdate,
      },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    productFindMany,
    categoryFindFirst,
    productFindFirst,
    productCreate,
    productUpdate,
    productTranslationCreate,
    productTranslationUpdateMany,
    productTranslationFindFirstOrThrow,
    $transaction,
  };
}

function buildService(
  mock: ReturnType<typeof buildPrismaMock>,
): ProductsService {
  return new ProductsService(mock.prisma as never);
}

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
};

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

    it('omitting every field still performs a safe no-op Product update and returns the current translation', async () => {
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

      expect(mock.productUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
      expect(mock.productTranslationUpdateMany).not.toHaveBeenCalled();
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
});
