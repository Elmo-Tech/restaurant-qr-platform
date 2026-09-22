import { ModifiersService } from './modifiers.service';

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'en';
const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const OPTION_ID = '33333333-3333-4333-8333-333333333333';

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest.fn().mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
  const modifierGroupFindFirst = jest.fn().mockResolvedValue({ id: 'group-1' });
  const modifierOptionFindFirst = jest.fn().mockResolvedValue({ id: 'option-1' });
  const modifierGroupUpdate = jest.fn();
  const modifierOptionUpdate = jest.fn();
  const modifierGroupTranslationFindMany = jest.fn().mockResolvedValue([]);
  const modifierGroupTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const modifierGroupTranslationUpsert = jest.fn();
  const modifierGroupTranslationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const modifierOptionTranslationFindMany = jest.fn().mockResolvedValue([]);
  const modifierOptionTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const modifierOptionTranslationUpsert = jest.fn();
  const modifierOptionTranslationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const restaurantLocaleFindUnique = jest.fn().mockResolvedValue({ isActive: true });

  const txClient = {
    restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
    restaurantLocale: { findUnique: restaurantLocaleFindUnique },
    modifierGroup: { findFirst: modifierGroupFindFirst, update: modifierGroupUpdate },
    modifierOption: { findFirst: modifierOptionFindFirst, update: modifierOptionUpdate },
    modifierGroupTranslation: {
      findMany: modifierGroupTranslationFindMany,
      findUnique: modifierGroupTranslationFindUnique,
      upsert: modifierGroupTranslationUpsert,
      deleteMany: modifierGroupTranslationDeleteMany,
    },
    modifierOptionTranslation: {
      findMany: modifierOptionTranslationFindMany,
      findUnique: modifierOptionTranslationFindUnique,
      upsert: modifierOptionTranslationUpsert,
      deleteMany: modifierOptionTranslationDeleteMany,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      product: { findFirst: productFindFirst },
      modifierGroup: { findFirst: modifierGroupFindFirst },
      modifierOption: { findFirst: modifierOptionFindFirst },
      modifierGroupTranslation: { findMany: modifierGroupTranslationFindMany },
      modifierOptionTranslation: { findMany: modifierOptionTranslationFindMany },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    productFindFirst,
    modifierGroupFindFirst,
    modifierOptionFindFirst,
    modifierGroupUpdate,
    modifierOptionUpdate,
    modifierGroupTranslationFindMany,
    modifierGroupTranslationFindUnique,
    modifierGroupTranslationUpsert,
    modifierGroupTranslationDeleteMany,
    modifierOptionTranslationFindMany,
    modifierOptionTranslationFindUnique,
    modifierOptionTranslationUpsert,
    modifierOptionTranslationDeleteMany,
    restaurantLocaleFindUnique,
    $transaction,
  };
}

function buildService(mock: ReturnType<typeof buildPrismaMock>): ModifiersService {
  return new ModifiersService(mock.prisma as never);
}

describe('ModifiersService -- localization closeout (FT-6A)', () => {
  describe('getModifierGroupTranslations', () => {
    it('unknown/foreign productId -> productNotFound', async () => {
      const mock = buildPrismaMock();
      mock.productFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.getModifierGroupTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        groupId: GROUP_ID,
      });

      expect(result).toEqual({ outcome: 'productNotFound' });
    });

    it('a Group belonging to a DIFFERENT Product -> groupNotFound', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.getModifierGroupTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        groupId: GROUP_ID,
      });

      expect(result).toEqual({ outcome: 'groupNotFound' });
      expect(mock.modifierGroupFindFirst).toHaveBeenCalledWith({
        where: { id: GROUP_ID, productId: 'product-1', restaurantId: RESTAURANT_ID },
        select: { id: true },
      });
    });

    it('returns every existing translation row, raw', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupTranslationFindMany.mockResolvedValue([
        { locale: 'en', name: 'Size', helperText: 'Choose one' },
        { locale: 'ar', name: 'الحجم', helperText: null },
      ]);
      const service = buildService(mock);

      const result = await service.getModifierGroupTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        groupId: GROUP_ID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [
          { locale: 'en', name: 'Size', helperText: 'Choose one' },
          { locale: 'ar', name: 'الحجم', helperText: null },
        ],
      });
    });
  });

  describe('putModifierGroupTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
      locale: 'ar' as const,
      name: 'الحجم',
      helperText: 'اختر واحدًا',
    };

    it('inactive locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.putModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.modifierGroupTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.modifierGroupUpdate).not.toHaveBeenCalled();
    });

    it('missing translation -> creates via upsert and touches ModifierGroup.updatedAt', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.putModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'الحجم', helperText: 'اختر واحدًا' },
      });
      expect(mock.modifierGroupTranslationUpsert).toHaveBeenCalledWith({
        where: { modifierGroupId_locale: { modifierGroupId: 'group-1', locale: 'ar' } },
        create: { modifierGroupId: 'group-1', locale: 'ar', name: 'الحجم', helperText: 'اختر واحدًا' },
        update: { name: 'الحجم', helperText: 'اختر واحدًا' },
      });
      expect(mock.modifierGroupUpdate).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('an exact normalized no-op returns the existing row without rewriting it', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupTranslationFindUnique.mockResolvedValue({
        name: 'الحجم',
        helperText: 'اختر واحدًا',
      });
      const service = buildService(mock);

      const result = await service.putModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({
        outcome: 'updated',
        data: { locale: 'ar', name: 'الحجم', helperText: 'اختر واحدًا' },
      });
      expect(mock.modifierGroupTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.modifierGroupUpdate).not.toHaveBeenCalled();
    });

    it('a foreign Group -> groupNotFound, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'groupNotFound' });
      expect(mock.modifierGroupTranslationUpsert).not.toHaveBeenCalled();
    });
  });

  describe('deleteModifierGroupTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
      locale: 'ar' as const,
    };

    it('the default locale cannot be deleted -> defaultTranslationRequired', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({ defaultLocale: 'ar' });
      const service = buildService(mock);

      const result = await service.deleteModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'defaultTranslationRequired' });
      expect(mock.modifierGroupTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('inactive locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.deleteModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.modifierGroupTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('a non-default active locale deletes and touches ModifierGroup.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupTranslationDeleteMany.mockResolvedValue({ count: 1 });
      const service = buildService(mock);

      const result = await service.deleteModifierGroupTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.modifierGroupTranslationDeleteMany).toHaveBeenCalledWith({
        where: { modifierGroupId: 'group-1', locale: 'ar' },
      });
      expect(mock.modifierGroupUpdate).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('getModifierOptionTranslations', () => {
    it('a foreign Option -> optionNotFound', async () => {
      const mock = buildPrismaMock();
      mock.modifierOptionFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.getModifierOptionTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        groupId: GROUP_ID,
        optionId: OPTION_ID,
      });

      expect(result).toEqual({ outcome: 'optionNotFound' });
    });

    it('returns every existing translation row, raw (name only, no second field)', async () => {
      const mock = buildPrismaMock();
      mock.modifierOptionTranslationFindMany.mockResolvedValue([
        { locale: 'en', name: 'Large' },
        { locale: 'ar', name: 'كبير' },
      ]);
      const service = buildService(mock);

      const result = await service.getModifierOptionTranslations({
        restaurantId: RESTAURANT_ID,
        productId: WELL_FORMED_UUID,
        groupId: GROUP_ID,
        optionId: OPTION_ID,
      });

      expect(result).toEqual({
        outcome: 'found',
        data: [
          { locale: 'en', name: 'Large' },
          { locale: 'ar', name: 'كبير' },
        ],
      });
    });
  });

  describe('putModifierOptionTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
      optionId: OPTION_ID,
      locale: 'ar' as const,
      name: 'كبير',
    };

    it('inactive locale -> localeNotActive, zero writes', async () => {
      const mock = buildPrismaMock();
      mock.restaurantLocaleFindUnique.mockResolvedValue({ isActive: false });
      const service = buildService(mock);

      const result = await service.putModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'localeNotActive' });
      expect(mock.modifierOptionTranslationUpsert).not.toHaveBeenCalled();
    });

    it('missing translation -> creates via upsert and touches ModifierOption.updatedAt', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.putModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'updated', data: { locale: 'ar', name: 'كبير' } });
      expect(mock.modifierOptionTranslationUpsert).toHaveBeenCalledWith({
        where: { modifierOptionId_locale: { modifierOptionId: 'option-1', locale: 'ar' } },
        create: { modifierOptionId: 'option-1', locale: 'ar', name: 'كبير' },
        update: { name: 'كبير' },
      });
      expect(mock.modifierOptionUpdate).toHaveBeenCalledWith({
        where: { id: 'option-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('an exact normalized no-op returns the existing row without rewriting it', async () => {
      const mock = buildPrismaMock();
      mock.modifierOptionTranslationFindUnique.mockResolvedValue({ name: 'كبير' });
      const service = buildService(mock);

      const result = await service.putModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'updated', data: { locale: 'ar', name: 'كبير' } });
      expect(mock.modifierOptionTranslationUpsert).not.toHaveBeenCalled();
      expect(mock.modifierOptionUpdate).not.toHaveBeenCalled();
    });

    it('an Option belonging to a DIFFERENT Group -> groupNotFound', async () => {
      const mock = buildPrismaMock();
      mock.modifierGroupFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.putModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'groupNotFound' });
    });
  });

  describe('deleteModifierOptionTranslation', () => {
    const BASE_INPUT = {
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
      optionId: OPTION_ID,
      locale: 'ar' as const,
    };

    it('the default locale cannot be deleted -> defaultTranslationRequired', async () => {
      const mock = buildPrismaMock();
      mock.restaurantFindUniqueOrThrow.mockResolvedValue({ defaultLocale: 'ar' });
      const service = buildService(mock);

      const result = await service.deleteModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'defaultTranslationRequired' });
      expect(mock.modifierOptionTranslationDeleteMany).not.toHaveBeenCalled();
    });

    it('a non-default active locale deletes and touches ModifierOption.updatedAt', async () => {
      const mock = buildPrismaMock();
      mock.modifierOptionTranslationDeleteMany.mockResolvedValue({ count: 1 });
      const service = buildService(mock);

      const result = await service.deleteModifierOptionTranslation(BASE_INPUT);

      expect(result).toEqual({ outcome: 'deleted' });
      expect(mock.modifierOptionTranslationDeleteMany).toHaveBeenCalledWith({
        where: { modifierOptionId: 'option-1', locale: 'ar' },
      });
      expect(mock.modifierOptionUpdate).toHaveBeenCalledWith({
        where: { id: 'option-1' },
        data: { updatedAt: expect.any(Date) as Date },
      });
    });

    it('a malformed optionId -> optionNotFound, zero writes', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.deleteModifierOptionTranslation({
        ...BASE_INPUT,
        optionId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'optionNotFound' });
      expect(mock.modifierOptionTranslationDeleteMany).not.toHaveBeenCalled();
    });
  });
});
