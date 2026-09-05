import { CategoriesService } from './categories.service';

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'ar';

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const categoryFindMany = jest.fn().mockResolvedValue([]);
  const menuFindFirst = jest.fn().mockResolvedValue({ id: 'menu-1' });
  const categoryCreate = jest.fn();
  const categoryTranslationCreate = jest.fn();

  const txClient = {
    menu: { findFirst: menuFindFirst },
    category: { create: categoryCreate },
    categoryTranslation: { create: categoryTranslationCreate },
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
    categoryTranslationCreate,
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
});
