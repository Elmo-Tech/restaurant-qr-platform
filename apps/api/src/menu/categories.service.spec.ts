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
  const categoryTranslationFindMany = jest.fn().mockResolvedValue([]);
  const categoryTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const categoryTranslationUpsert = jest.fn();
  const categoryTranslationDeleteMany = jest
    .fn()
    .mockResolvedValue({ count: 0 });
  const restaurantLocaleFindUnique = jest
    .fn()
    .mockResolvedValue({ isActive: true });

  const txClient = {
    restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
    restaurantLocale: { findUnique: restaurantLocaleFindUnique },
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
      findMany: categoryTranslationFindMany,
      findUnique: categoryTranslationFindUnique,
      upsert: categoryTranslationUpsert,
      deleteMany: categoryTranslationDeleteMany,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      category: {
        findMany: categoryFindMany,
        findFirst: categoryFindFirst,
        update: categoryUpdate,
      },
      categoryTranslation: { findMany: categoryTranslationFindMany },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    restaurantLocaleFindUnique,
    categoryFindMany,
    menuFindFirst,
    categoryCreate,
    categoryFindFirst,
    categoryUpdate,
    categoryTranslationCreate,
    categoryTranslationUpdateMany,
    categoryTranslationFindFirstOrThrow,
    categoryTranslationFindMany,
    categoryTranslationFindUnique,
    categoryTranslationUpsert,
    categoryTranslationDeleteMany,
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

    it('omitting every field is a true no-op -- zero writes, current row returned unchanged (corrected: no longer an empty-data update call)', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue({
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

      const result = await service.updateCategory({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.categoryUpdate).not.toHaveBeenCalled();
      expect(mock.categoryTranslationUpdateMany).not.toHaveBeenCalled();
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        outcome: 'updated',
        data: {
          id: 'category-1',
          menuId: 'menu-1',
          status: 'ACTIVE',
          displayOrder: 0,
          imageAssetPath: null,
          translation: {
            locale: DEFAULT_LOCALE,
            name: 'المقبلات',
            description: null,
          },
        },
      });
    });
  });

  describe('setCategoryImage', () => {
    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.setCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: 'not-a-uuid',
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign-Restaurant categoryId -> categoryNotFound, no update attempted (Tenant hiding)', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.setCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('scopes the ownership check by id + restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: null,
      });
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: '/media/new-file.jpg',
      });
      const service = buildService(mock);

      await service.setCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(mock.categoryFindFirst).toHaveBeenCalledWith({
        where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        select: { id: true, imageAssetPath: true },
      });
    });

    it('persists the new path via Category.update and reports the previous path for cleanup', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: '/media/old-file.jpg',
      });
      mock.categoryUpdate.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: '/media/new-file.jpg',
      });
      const service = buildService(mock);

      const result = await service.setCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
        imageAssetPath: '/media/new-file.jpg',
      });

      expect(mock.categoryUpdate).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { imageAssetPath: '/media/new-file.jpg' },
        select: { id: true, imageAssetPath: true },
      });
      expect(result).toEqual({
        outcome: 'updated',
        data: { id: 'category-1', imageAssetPath: '/media/new-file.jpg' },
        previousImageAssetPath: '/media/old-file.jpg',
      });
    });
  });

  describe('clearCategoryImage', () => {
    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.clearCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign-Restaurant categoryId -> categoryNotFound (Tenant hiding)', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.clearCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('clears imageAssetPath to null and reports the previous path', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: '/media/old-file.jpg',
      });
      const service = buildService(mock);

      const result = await service.clearCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.categoryUpdate).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { imageAssetPath: null },
      });
      expect(result).toEqual({
        outcome: 'cleared',
        previousImageAssetPath: '/media/old-file.jpg',
      });
    });

    it('is idempotent: no write when the image is already null', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue({
        id: 'category-1',
        imageAssetPath: null,
      });
      const service = buildService(mock);

      const result = await service.clearCategoryImage({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.categoryUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'cleared',
        previousImageAssetPath: null,
      });
    });
  });

  describe('getCategoryTranslations', () => {
    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.getCategoryTranslations({
        restaurantId: RESTAURANT_ID,
        categoryId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryFindFirst).not.toHaveBeenCalled();
    });

    it('unknown/foreign categoryId -> categoryNotFound', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.getCategoryTranslations({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
    });

    it('returns every existing translation row, raw, deterministically ordered', async () => {
      const mock = buildPrismaMock();
      mock.categoryTranslationFindMany.mockResolvedValue([
        { locale: 'ar', name: 'المقبلات', description: null },
        { locale: 'en', name: 'Appetizers', description: 'desc' },
      ]);
      const service = buildService(mock);

      const result = await service.getCategoryTranslations({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [
          { locale: 'ar', name: 'المقبلات', description: null },
          { locale: 'en', name: 'Appetizers', description: 'desc' },
        ],
      });
      expect(mock.categoryTranslationFindMany).toHaveBeenCalledWith({
        where: { categoryId: 'category-1' },
        select: { locale: true, name: true, description: true },
        orderBy: { locale: 'asc' },
      });
    });

    it('a missing secondary translation is simply absent -- no fallback/synthetic row', async () => {
      const mock = buildPrismaMock();
      mock.categoryTranslationFindMany.mockResolvedValue([
        { locale: 'en', name: 'Appetizers', description: null },
      ]);
      const service = buildService(mock);

      const result = await service.getCategoryTranslations({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [{ locale: 'en', name: 'Appetizers', description: null }],
      });
    });

    it('never writes', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.getCategoryTranslations({
        restaurantId: RESTAURANT_ID,
        categoryId: WELL_FORMED_UUID,
      });

      expect(mock.$transaction).not.toHaveBeenCalled();
      expect(mock.categoryTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.categoryTranslationDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('putCategoryTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      categoryId: WELL_FORMED_UUID,
      locale: 'ar' as const,
      name: 'المقبلات',
      description: null,
    };

    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.putCategoryTranslation({
        ...BASE_INPUT,
        categoryId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('unknown/foreign categoryId -> categoryNotFound, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryTranslationUpsert).not.toHaveBeenCalled();
    });

    it('inactive locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.putCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.categoryTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('active secondary locale, missing translation -> creates via upsert and touches Category.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.categoryTranslationFindUnique.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'المقبلات', description: null },
      });
      expect(mock.categoryTranslationUpsert).toHaveBeenCalledWith({
        where: {
          categoryId_locale: { categoryId: 'category-1', locale: 'ar' },
        },
        create: {
          categoryId: 'category-1',
          locale: 'ar',
          name: 'المقبلات',
          description: null,
        },
        update: { name: 'المقبلات', description: null },
      });
      expect(mock.categoryUpdate).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('active secondary locale, existing DIFFERENT translation -> replaces via upsert and touches Category.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.categoryTranslationFindUnique.mockResolvedValue({
        name: 'old name',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.putCategoryTranslation(BASE_INPUT);

      expect(result.outcome).toBe('updated');
      expect(mock.categoryTranslationUpsert).toHaveBeenCalledTimes(1);
      expect(mock.categoryUpdate).toHaveBeenCalledTimes(1);
    });

    it('the default locale can be written (writing the default locale is allowed by policy)', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.categoryTranslationFindUnique.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putCategoryTranslation({
        ...BASE_INPUT,
        locale: 'en',
      });

      expect(result.outcome).toBe('updated');
    });

    it('an exact normalized no-op returns the existing row without rewriting it and without touching Category.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.categoryTranslationFindUnique.mockResolvedValue({
        name: 'المقبلات',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.putCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'المقبلات', description: null },
      });
      expect(mock.categoryTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('Tenant-scoped: resolves the Category by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.putCategoryTranslation(BASE_INPUT);

      expect(mock.categoryFindFirst).toHaveBeenCalledWith({
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

  describe('deleteCategoryTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      categoryId: WELL_FORMED_UUID,
      locale: 'ar' as const,
    };

    it('a malformed categoryId -> categoryNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation({
        ...BASE_INPUT,
        categoryId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('unknown/foreign categoryId -> categoryNotFound', async () => {
      const mock = buildPrismaMock();
      mock.categoryFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'categoryNotFound' });
      expect(mock.categoryTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('the default locale can never be deleted -> defaultTranslationRequired, regardless of row existence, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'ar',
      });
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'defaultTranslationRequired' });
      expect(mock.categoryTranslationDeleteMany).not.toHaveBeenCalled();
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
    });

    it('an inactive secondary locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.categoryTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('an active secondary locale with an existing row -> deletes it and touches Category.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.categoryTranslationDeleteMany.mockResolvedValue({ count: 1 });
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.categoryTranslationDeleteMany).toHaveBeenCalledWith({
        where: { categoryId: 'category-1', locale: 'ar' },
      });
      expect(mock.categoryUpdate).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('an active secondary locale with NO existing row -> safe 204 no-op, never creates anything, no timestamp touch', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({
        defaultLocale: 'en',
      });
      mock.categoryTranslationDeleteMany.mockResolvedValue({ count: 0 });
      const service = buildService(mock);

      const result = await service.deleteCategoryTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.categoryUpdate).not.toHaveBeenCalled();
      expect(mock.categoryTranslationUpsert).not.toHaveBeenCalled();
    });

    it('never affects another Restaurant -- scoped by categoryId resolved under restaurantId', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.deleteCategoryTranslation(BASE_INPUT);

      expect(mock.categoryFindFirst).toHaveBeenCalledWith({
        where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        select: { id: true },
      });
    });
  });
});
