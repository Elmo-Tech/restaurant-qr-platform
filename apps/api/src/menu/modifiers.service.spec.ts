import { Prisma } from '../generated/prisma/client';
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

const PRESET_ID = '44444444-4444-4444-8444-444444444444';
const PRESET_OPTION_ID = '55555555-5555-4555-8555-555555555555';

const PRESET_ROW = {
  id: PRESET_ID,
  minimumSelections: 1,
  maximumSelections: 1,
  translations: [{ locale: 'en', name: 'Standard Size', helperText: 'Choose one' }],
  options: [
    {
      id: PRESET_OPTION_ID,
      status: 'ACTIVE' as const,
      priceAdjustment: { toFixed: () => '20.00' } as unknown as { toFixed: (n: number) => string },
      displayOrder: 0,
      translations: [{ locale: 'en', name: 'Large' }],
    },
  ],
};

function buildApplyPresetMock() {
  const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
  const modifierGroupFindFirst = jest.fn().mockResolvedValue(null); // not yet applied
  const modifierGroupCount = jest.fn().mockResolvedValue(0);
  const modifierPresetFindFirst = jest.fn().mockResolvedValue(PRESET_ROW);

  const modifierGroupCreate = jest.fn().mockResolvedValue({
    id: 'group-new',
    status: 'ACTIVE',
    minimumSelections: 1,
    maximumSelections: 1,
    displayOrder: 0,
    sourcePresetId: PRESET_ID,
  });
  const modifierGroupTranslationCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const modifierGroupTranslationFindMany = jest
    .fn()
    .mockResolvedValue([{ name: 'Standard Size', helperText: 'Choose one' }]);
  const modifierOptionCreate = jest.fn().mockResolvedValue({
    id: 'option-new',
    status: 'ACTIVE',
    priceAdjustment: { toFixed: () => '20.00' } as unknown as { toFixed: (n: number) => string },
    displayOrder: 0,
    sourcePresetOptionId: PRESET_OPTION_ID,
    priceIsOverridden: false,
  });
  const modifierOptionTranslationCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const modifierOptionTranslationFindMany = jest.fn().mockResolvedValue([{ name: 'Large' }]);

  const txClient = {
    modifierGroup: { create: modifierGroupCreate },
    modifierGroupTranslation: {
      createMany: modifierGroupTranslationCreateMany,
      findMany: modifierGroupTranslationFindMany,
    },
    modifierOption: { create: modifierOptionCreate },
    modifierOptionTranslation: {
      createMany: modifierOptionTranslationCreateMany,
      findMany: modifierOptionTranslationFindMany,
    },
  };
  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      product: { findFirst: productFindFirst },
      modifierGroup: { findFirst: modifierGroupFindFirst, count: modifierGroupCount },
      modifierPreset: { findFirst: modifierPresetFindFirst },
      $transaction,
    },
    productFindFirst,
    modifierGroupFindFirst,
    modifierGroupCount,
    modifierPresetFindFirst,
    modifierGroupCreate,
    modifierGroupTranslationCreateMany,
    modifierOptionCreate,
    modifierOptionTranslationCreateMany,
    $transaction,
  };
}

describe('ModifiersService.applyPresetToProduct (FT-6B)', () => {
  it('unknown/foreign productId -> productNotFound', async () => {
    const mock = buildApplyPresetMock();
    mock.productFindFirst.mockResolvedValue(null);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.applyPresetToProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      presetId: PRESET_ID,
    });

    expect(result).toEqual({ outcome: 'productNotFound' });
  });

  it('a Preset belonging to a DIFFERENT Restaurant -> presetNotFound (Section 10.1)', async () => {
    const mock = buildApplyPresetMock();
    mock.modifierPresetFindFirst.mockResolvedValue(null);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.applyPresetToProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      presetId: PRESET_ID,
    });

    expect(result).toEqual({ outcome: 'presetNotFound' });
    expect(mock.modifierPresetFindFirst).toHaveBeenCalledWith({
      where: { id: PRESET_ID, restaurantId: RESTAURANT_ID },
      select: expect.anything() as unknown,
    });
  });

  it('creates a linked Product-local Modifier Group/Option, copying the Preset defaults exactly', async () => {
    const mock = buildApplyPresetMock();
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.applyPresetToProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      presetId: PRESET_ID,
    });

    expect(result.outcome).toBe('created');
    expect(mock.modifierGroupCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourcePresetId: PRESET_ID,
        minimumSelections: 1,
        maximumSelections: 1,
      }) as unknown,
      select: expect.anything() as unknown,
    });
    expect(mock.modifierOptionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourcePresetOptionId: PRESET_OPTION_ID,
        priceIsOverridden: false,
      }) as unknown,
      select: expect.anything() as unknown,
    });
    // The copied priceAdjustment comes directly from the Preset Option's
    // OWN Decimal value -- never re-parsed through a JS number.
    const optionCreateData = mock.modifierOptionCreate.mock.calls[0][0] as {
      data: { priceAdjustment: unknown };
    };
    expect(optionCreateData.data.priceAdjustment).toBe(PRESET_ROW.options[0].priceAdjustment);
  });

  it('the SAME Preset cannot be attached twice to the SAME Product -> alreadyApplied', async () => {
    const mock = buildApplyPresetMock();
    mock.modifierGroupFindFirst.mockResolvedValue({ id: 'existing-linked-group' });
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.applyPresetToProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      presetId: PRESET_ID,
    });

    expect(result).toEqual({ outcome: 'alreadyApplied' });
    expect(mock.$transaction).not.toHaveBeenCalled();
  });

  it('a concurrent double-attach race hitting the unique constraint also converges on alreadyApplied', async () => {
    const mock = buildApplyPresetMock();
    const conflict = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Error & { code: string };
    conflict.code = 'P2002';
    mock.$transaction.mockRejectedValue(conflict);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.applyPresetToProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      presetId: PRESET_ID,
    });

    expect(result).toEqual({ outcome: 'alreadyApplied' });
  });
});

describe('ModifiersService.resetModifierOptionPrice (FT-6B, Section 5 "Reset to preset")', () => {
  function buildResetMock() {
    const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
    const modifierGroupFindFirst = jest.fn().mockResolvedValue({ id: 'group-1' });
    const modifierOptionFindFirst = jest.fn().mockResolvedValue({
      id: 'option-1',
      status: 'ACTIVE',
      priceAdjustment: { toFixed: () => '60.00' } as unknown as { toFixed: (n: number) => string },
      displayOrder: 0,
      sourcePresetOptionId: PRESET_OPTION_ID,
      priceIsOverridden: true,
    });
    const modifierPresetOptionFindUnique = jest.fn().mockResolvedValue({
      priceAdjustment: { toFixed: () => '45.00' } as unknown as { toFixed: (n: number) => string },
    });
    const modifierOptionUpdate = jest.fn().mockResolvedValue({
      id: 'option-1',
      status: 'ACTIVE',
      priceAdjustment: { toFixed: () => '45.00' } as unknown as { toFixed: (n: number) => string },
      displayOrder: 0,
      sourcePresetOptionId: PRESET_OPTION_ID,
      priceIsOverridden: false,
    });
    const restaurantFindUniqueOrThrow = jest.fn().mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
    const modifierOptionTranslationFindFirstOrThrow = jest.fn().mockResolvedValue({ name: 'Large' });
    const orderItemModifierCount = jest.fn().mockResolvedValue(0);

    const txClient = {
      modifierOption: { findFirst: modifierOptionFindFirst, update: modifierOptionUpdate },
      modifierPresetOption: { findUnique: modifierPresetOptionFindUnique },
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      modifierOptionTranslation: { findFirstOrThrow: modifierOptionTranslationFindFirstOrThrow },
      orderItemModifier: { count: orderItemModifierCount },
    };
    const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
      Promise.resolve(callback(txClient)),
    );

    return {
      prisma: {
        product: { findFirst: productFindFirst },
        modifierGroup: { findFirst: modifierGroupFindFirst },
        $transaction,
      },
      productFindFirst,
      modifierGroupFindFirst,
      modifierOptionFindFirst,
      modifierPresetOptionFindUnique,
      modifierOptionUpdate,
    };
  }

  it('adopts the Preset Option\'s CURRENT price and clears the override flag', async () => {
    const mock = buildResetMock();
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.resetModifierOptionPrice({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
      optionId: OPTION_ID,
    });

    expect(result.outcome).toBe('updated');
    expect(mock.modifierPresetOptionFindUnique).toHaveBeenCalledWith({
      where: { id: PRESET_OPTION_ID },
      select: { priceAdjustment: true },
    });
    expect(mock.modifierOptionUpdate).toHaveBeenCalledWith({
      where: { id: 'option-1' },
      data: {
        priceAdjustment: expect.anything() as unknown,
        priceIsOverridden: false,
      },
      select: expect.anything() as unknown,
    });
    if (result.outcome === 'updated') {
      expect(result.data.priceAdjustment).toBe('45.00');
      expect(result.data.priceIsOverridden).toBe(false);
    }
  });
});

describe('ModifiersService.deleteModifierGroup (FT-6B closeout, Section 3/4)', () => {
  function buildDeleteGroupMock(historicalReferenceCount: number) {
    const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
    const modifierGroupFindFirst = jest.fn().mockResolvedValue({ id: 'group-1' });
    const orderItemModifierCount = jest.fn().mockResolvedValue(historicalReferenceCount);
    const modifierOptionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const modifierGroupDelete = jest.fn().mockResolvedValue({});

    const txClient = {
      modifierGroup: { findFirst: modifierGroupFindFirst, delete: modifierGroupDelete },
      modifierOption: { deleteMany: modifierOptionDeleteMany },
      orderItemModifier: { count: orderItemModifierCount },
    };
    const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
      Promise.resolve(callback(txClient)),
    );

    return {
      prisma: { product: { findFirst: productFindFirst }, $transaction },
      productFindFirst,
      modifierGroupFindFirst,
      orderItemModifierCount,
      modifierOptionDeleteMany,
      modifierGroupDelete,
    };
  }

  it('hard-deletes a Group with zero historical Order references', async () => {
    const mock = buildDeleteGroupMock(0);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.deleteModifierGroup({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
    });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(mock.modifierOptionDeleteMany).toHaveBeenCalledWith({ where: { modifierGroupId: 'group-1' } });
    expect(mock.modifierGroupDelete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
  });

  it('rejects deleting a Group that has ever been snapshotted into a historical Order', async () => {
    const mock = buildDeleteGroupMock(1);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.deleteModifierGroup({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
    });

    expect(result).toEqual({ outcome: 'hasHistoricalReferences' });
    expect(mock.modifierOptionDeleteMany).not.toHaveBeenCalled();
    expect(mock.modifierGroupDelete).not.toHaveBeenCalled();
  });

  it('unknown/foreign productId -> productNotFound, zero writes', async () => {
    const mock = buildDeleteGroupMock(0);
    mock.productFindFirst.mockResolvedValue(null);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.deleteModifierGroup({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
    });

    expect(result).toEqual({ outcome: 'productNotFound' });
    expect(mock.modifierGroupDelete).not.toHaveBeenCalled();
  });
});

describe('ModifiersService.removeModifierGroupFromProduct (FT-6B closeout, Section 3/4, "Remove from Product")', () => {
  function buildRemoveMock(historicalReferenceCount: number) {
    const productFindFirst = jest.fn().mockResolvedValue({ id: 'product-1' });
    const modifierGroupFindFirst = jest.fn().mockResolvedValue({ id: 'group-1' });
    const orderItemModifierCount = jest.fn().mockResolvedValue(historicalReferenceCount);
    const modifierOptionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const modifierGroupDelete = jest.fn().mockResolvedValue({});
    const modifierGroupUpdate = jest.fn().mockResolvedValue({
      id: 'group-1',
      status: 'INACTIVE',
      minimumSelections: 1,
      maximumSelections: 1,
      displayOrder: 0,
      sourcePresetId: 'preset-1',
    });
    const restaurantFindUniqueOrThrow = jest.fn().mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
    const modifierGroupTranslationFindFirstOrThrow = jest
      .fn()
      .mockResolvedValue({ name: 'Standard Size', helperText: null });
    const modifierOptionFindMany = jest.fn().mockResolvedValue([]);

    const txClient = {
      modifierGroup: {
        findFirst: modifierGroupFindFirst,
        delete: modifierGroupDelete,
        update: modifierGroupUpdate,
      },
      modifierOption: { deleteMany: modifierOptionDeleteMany, findMany: modifierOptionFindMany },
      orderItemModifier: { count: orderItemModifierCount },
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      modifierGroupTranslation: { findFirstOrThrow: modifierGroupTranslationFindFirstOrThrow },
    };
    const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
      Promise.resolve(callback(txClient)),
    );

    return {
      prisma: { product: { findFirst: productFindFirst }, $transaction },
      productFindFirst,
      modifierGroupFindFirst,
      orderItemModifierCount,
      modifierOptionDeleteMany,
      modifierGroupDelete,
      modifierGroupUpdate,
    };
  }

  it('hard-deletes when historically safe', async () => {
    const mock = buildRemoveMock(0);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.removeModifierGroupFromProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
    });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(mock.modifierGroupDelete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
    expect(mock.modifierGroupUpdate).not.toHaveBeenCalled();
  });

  it('deactivates instead of deleting when historical Order references exist', async () => {
    const mock = buildRemoveMock(1);
    const service = new ModifiersService(mock.prisma as never);

    const result = await service.removeModifierGroupFromProduct({
      restaurantId: RESTAURANT_ID,
      productId: WELL_FORMED_UUID,
      groupId: GROUP_ID,
    });

    expect(result.outcome).toBe('deactivated');
    expect(mock.modifierGroupDelete).not.toHaveBeenCalled();
    expect(mock.modifierGroupUpdate).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { status: 'INACTIVE' },
      select: expect.anything() as unknown,
    });
    if (result.outcome === 'deactivated') {
      expect(result.data.status).toBe('INACTIVE');
    }
  });
});
