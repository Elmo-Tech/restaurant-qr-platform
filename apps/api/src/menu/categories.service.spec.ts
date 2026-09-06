import { CategoriesService } from './categories.service';

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'ar';

const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const categoryFindMany = jest.fn().mockResolvedValue([]);
  const menuFindFirst = jest.fn().mockResolvedValue({ id: 'menu-1' });
  const categoryCreate = jest.fn();
  const categoryFindFirst = jest.fn().mockResolvedValue({ id: 'category-1' });
  const categoryUpdate = jest.fn();
  const categoryTranslationCreate = jest.fn();
  const categoryTranslationUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: 1 });
  const categoryTranslationFindFirstOrThrow = jest.fn();

  const txClient = {
    menu: { findFirst: menuFindFirst },
    category: {
      create: categoryCreate,
      findFirst: categoryFindFirst,
      update: categoryUpdate,
    },
    categoryTranslation: {
      create: categoryTranslationCreate,
      updateMany: categoryTranslationUpdateMany,
      findFirstOrThrow: categoryTranslationFindFirstOrThrow,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      category: { findMany: categoryFindMany },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    categoryFindMany,
    menuFindFirst,
    categoryCreate,
    categoryFindFirst,
    categoryUpdate,
    categoryTranslationCreate,
    categoryTranslationUpdateMany,
    categoryTranslationFindFirstOrThrow,
    $transaction,
  };
}

function buildService(
  mock: ReturnType<typeof buildPrismaMock>,
): CategoriesService {
  return new CategoriesService(mock.prisma as never);
}

describe('CategoriesService', () => {
  describe('listCategories', () => {
    it('scopes the query by restaurantId only when no menuId filter is supplied', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.listCategories({ restaurantId: RESTAURANT_ID });

      expect(mock.categoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: RESTAURANT_ID },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('adds the menuId filter alongside restaurantId, never in place of it', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.listCategories({
        restaurantId: RESTAURANT_ID,
        menuId: 'menu-1',
      });

      expect(mock.categoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: RESTAURANT_ID, menuId: 'menu-1' },
        }),
      );
    });

    it('returns an empty array as data when there are no Categories', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.listCategories({
        restaurantId: RESTAURANT_ID,
      });

      expect(result).toEqual([]);
    });
  });

  describe('createCategory', () => {
    const baseInput = {
      restaurantId: RESTAURANT_ID,
      menuId: 'menu-1',
      name: 'المقبلات',
      description: null,
      status: 'ACTIVE' as const,
      displayOrder: 0,
    };

    it('resolves the Menu by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.categoryCreate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createCategory(baseInput);

      expect(mock.menuFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'menu-1', restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown menuId -> menuNotFound, no Category or translation ever written', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.createCategory(baseInput);

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.categoryCreate).not.toHaveBeenCalled();
      expect(mock.categoryTranslationCreate).not.toHaveBeenCalled();
    });

    it('foreign-Restaurant menuId collapses to the identical menuNotFound outcome (the Tenant-scoped query itself already excludes it)', async () => {
      const mock = buildPrismaMock();
      // The query's own where clause (id + restaurantId) is what prevents a
      // foreign-Restaurant Menu from ever matching -- simulated here as the
      // same null result a genuinely unknown id would produce.
      mock.menuFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.createCategory(baseInput);

      expect(result).toEqual({ outcome: 'menuNotFound' });
    });

    it('persists imageAssetPath as null unconditionally', async () => {
      const mock = buildPrismaMock();
      mock.categoryCreate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createCategory(baseInput);

      expect(mock.categoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            restaurantId: RESTAURANT_ID,
            menuId: 'menu-1',
            status: 'ACTIVE',
            displayOrder: 0,
            imageAssetPath: null,
          },
        }),
      );
    });

    it('never persists a Category without its translation created in the same transaction', async () => {
      const mock = buildPrismaMock();
      mock.categoryCreate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      const result = await service.createCategory(baseInput);

      expect(mock.$transaction).toHaveBeenCalledTimes(1);
      expect(mock.categoryTranslationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            categoryId: 'category-1',
            locale: DEFAULT_LOCALE,
            name: baseInput.name,
            description: baseInput.description,
          },
        }),
      );
      expect(result).toEqual({
        outcome: 'created',
        data: {
          id: 'category-1',
          menuId: 'menu-1',
          status: 'ACTIVE',
          displayOrder: 0,
          imageAssetPath: null,
          translation: {
            locale: DEFAULT_LOCALE,
            name: baseInput.name,
            description: null,
          },
        },
      });
    });
  });

  describe('updateCategory', () => {
    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.restaurantFindUniqueOrThrow).not.toHaveBeenCalled();
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the Category by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'المقبلات',
        description: null,
      });
      const service = buildService(mock);

      await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.categoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown/foreign categoryId -> categoryNotFound, no update ever attempted', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('a same-Restaurant menu move resolves the target Menu by id AND restaurantId, and succeeds', async () => {
      const mock = buildPrismaMock();
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-2',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'المقبلات',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        menuId: 'menu-2',
      });

      expect(mock.menuFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'menu-2', restaurantId: RESTAURANT_ID },
        }),
      );
      expect(mock.categoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { menuId: 'menu-2' } }),
      );
      expect(result).toEqual({
        outcome: 'updated',
        data: expect.objectContaining({ menuId: 'menu-2' }) as unknown,
      });
    });

    it('unknown/foreign target menuId -> menuNotFound, Category left entirely unchanged', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        menuId: 'foreign-menu',
      });

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('supplying name/description updates the default-locale translation via updateMany, then re-reads it for the response', async () => {
      const mock = buildPrismaMock();
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'New Name',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        name: 'New Name',
      });

      expect(mock.categoryTranslationUpdateMany).toHaveBeenCalledWith({
        where: { categoryId: 'category-1', locale: DEFAULT_LOCALE },
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

    it('description: null clears the translation description', async () => {
      const mock = buildPrismaMock();
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'المقبلات',
        description: null,
      });
      const service = buildService(mock);

      await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        description: null,
      });

      expect(mock.categoryTranslationUpdateMany).toHaveBeenCalledWith({
        where: { categoryId: 'category-1', locale: DEFAULT_LOCALE },
        data: { description: null },
      });
    });

    it('omitting every field still performs a safe no-op Category update and returns the current translation, using one transaction', async () => {
      const mock = buildPrismaMock();
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        menuId: 'menu-1',
        status: 'ACTIVE',
        displayOrder: 0,
        imageAssetPath: null,
      });
      mock.categoryTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'المقبلات',
        description: null,
      });
      const service = buildService(mock);

      await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.categoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
      expect(mock.categoryTranslationUpdateMany).not.toHaveBeenCalled();
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
