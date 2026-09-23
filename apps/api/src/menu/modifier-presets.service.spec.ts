import { ModifierPresetsService } from './modifier-presets.service';

const RESTAURANT_ID = 'restaurant-1';
const FOREIGN_RESTAURANT_ID = 'restaurant-2';
const DEFAULT_LOCALE = 'en';
const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';
const PRESET_OPTION_ID = '22222222-2222-4222-8222-222222222222';

function decimal(value: string) {
  return { toFixed: () => value } as unknown as { toFixed: (n: number) => string };
}

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest.fn().mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  // Tenant-scoped lookup: a foreign-Restaurant Preset id simply matches
  // zero rows -- the mock's default behavior models the REAL query
  // (`where: { id, restaurantId }`) by resolving to the row only when the
  // scope matches what the test configured.
  const modifierPresetFindFirst = jest.fn().mockResolvedValue({ id: 'preset-1' });
  const modifierPresetUpdate = jest.fn();
  const modifierPresetOptionFindFirst = jest.fn().mockResolvedValue({ id: 'preset-option-1' });
  const modifierPresetOptionFindMany = jest.fn().mockResolvedValue([]);
  const modifierPresetOptionUpdate = jest.fn().mockResolvedValue({
    id: 'preset-option-1',
    status: 'ACTIVE',
    priceAdjustment: decimal('45.00'),
    displayOrder: 0,
  });
  const modifierPresetTranslationFindMany = jest.fn().mockResolvedValue([]);
  const modifierPresetTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const modifierPresetTranslationUpsert = jest.fn();
  const modifierPresetTranslationFindFirstOrThrow = jest
    .fn()
    .mockResolvedValue({ name: 'Standard Size', helperText: null });
  const modifierPresetOptionTranslationFindUnique = jest.fn().mockResolvedValue(null);
  const modifierPresetOptionTranslationUpsert = jest.fn();
  const modifierPresetOptionTranslationFindFirstOrThrow = jest
    .fn()
    .mockResolvedValue({ name: 'Large' });
  const modifierGroupFindMany = jest.fn().mockResolvedValue([{ id: 'linked-group-1' }]);
  const modifierGroupTranslationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const modifierGroupUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const modifierOptionFindMany = jest.fn().mockResolvedValue([{ id: 'linked-option-1' }]);
  const modifierOptionTranslationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const modifierOptionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const restaurantLocaleFindUnique = jest.fn().mockResolvedValue({ isActive: true });
  // Section 5 closeout: "linked to any Product" existence checks -- default
  // to "no linked rows" (0) so every pre-existing test (written before
  // these checks existed) keeps passing unchanged.
  const modifierGroupCount = jest.fn().mockResolvedValue(0);
  const modifierOptionCount = jest.fn().mockResolvedValue(0);

  const txClient = {
    restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
    restaurantLocale: { findUnique: restaurantLocaleFindUnique },
    modifierPreset: { findFirst: modifierPresetFindFirst, update: modifierPresetUpdate },
    modifierPresetOption: {
      findFirst: modifierPresetOptionFindFirst,
      findMany: modifierPresetOptionFindMany,
      update: modifierPresetOptionUpdate,
    },
    modifierPresetTranslation: {
      findMany: modifierPresetTranslationFindMany,
      findUnique: modifierPresetTranslationFindUnique,
      upsert: modifierPresetTranslationUpsert,
      findFirstOrThrow: modifierPresetTranslationFindFirstOrThrow,
    },
    modifierPresetOptionTranslation: {
      findUnique: modifierPresetOptionTranslationFindUnique,
      upsert: modifierPresetOptionTranslationUpsert,
      findFirstOrThrow: modifierPresetOptionTranslationFindFirstOrThrow,
    },
    modifierGroup: { findMany: modifierGroupFindMany, updateMany: modifierGroupUpdateMany },
    modifierGroupTranslation: { updateMany: modifierGroupTranslationUpdateMany },
    modifierOption: { findMany: modifierOptionFindMany, updateMany: modifierOptionUpdateMany },
    modifierOptionTranslation: { updateMany: modifierOptionTranslationUpdateMany },
  };
  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      modifierPreset: { findFirst: modifierPresetFindFirst },
      modifierPresetOption: { findFirst: modifierPresetOptionFindFirst },
      modifierGroup: { count: modifierGroupCount },
      modifierOption: { count: modifierOptionCount },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    modifierPresetFindFirst,
    modifierPresetUpdate,
    modifierPresetOptionFindFirst,
    modifierPresetOptionUpdate,
    modifierGroupCount,
    modifierOptionCount,
    modifierGroupFindMany,
    modifierGroupTranslationUpdateMany,
    modifierGroupUpdateMany,
    modifierOptionFindMany,
    modifierOptionTranslationUpdateMany,
    modifierOptionUpdateMany,
    $transaction,
  };
}

function buildService(mock: ReturnType<typeof buildPrismaMock>): ModifierPresetsService {
  return new ModifierPresetsService(mock.prisma as never);
}

describe('ModifierPresetsService -- Tenant isolation (FT-6B, Section 10.1)', () => {
  it('a Preset belonging to a DIFFERENT Restaurant -> presetNotFound on update', async () => {
    const mock = buildPrismaMock();
    mock.modifierPresetFindFirst.mockResolvedValue(null); // foreign-Restaurant scope never matches
    const service = buildService(mock);

    const result = await service.updatePreset({
      restaurantId: FOREIGN_RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      name: 'Hijacked',
    });

    expect(result).toEqual({ outcome: 'presetNotFound' });
    expect(mock.modifierPresetFindFirst).toHaveBeenCalledWith({
      where: { id: WELL_FORMED_UUID, restaurantId: FOREIGN_RESTAURANT_ID },
      select: expect.anything() as unknown,
    });
  });

  it('a Preset Option belonging to a DIFFERENT Restaurant -> presetNotFound on option update', async () => {
    const mock = buildPrismaMock();
    mock.modifierPresetFindFirst.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.updatePresetOption({
      restaurantId: FOREIGN_RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
      priceAdjustment: '99.00',
    });

    expect(result).toEqual({ outcome: 'presetNotFound' });
  });
});

describe('ModifierPresetsService.updatePresetOption -- price sync (FT-6B, Section 7)', () => {
  it('syncs the new price ONLY to linked Options that are NOT price-overridden', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.updatePresetOption({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
      priceAdjustment: '45.00',
    });

    expect(result.outcome).toBe('updated');
    expect(mock.modifierOptionUpdateMany).toHaveBeenCalledWith({
      where: { sourcePresetOptionId: 'preset-option-1', priceIsOverridden: false },
      data: { priceAdjustment: expect.anything() as unknown },
    });
  });

  it('status/displayOrder changes sync to EVERY linked Option regardless of price override', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.updatePresetOption({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
      status: 'INACTIVE',
      displayOrder: 2,
    });

    expect(mock.modifierOptionUpdateMany).toHaveBeenCalledWith({
      where: { sourcePresetOptionId: 'preset-option-1' },
      data: { status: 'INACTIVE', displayOrder: 2 },
    });
  });
});

describe('ModifierPresetsService.updatePreset -- min/max sync (FT-6B, Section 7)', () => {
  it('syncs minimumSelections/maximumSelections to every linked Product-local Group', async () => {
    const mock = buildPrismaMock();
    mock.modifierPresetFindFirst.mockResolvedValue({
      id: 'preset-1',
      minimumSelections: 1,
      maximumSelections: 1,
    });
    const service = buildService(mock);

    await service.updatePreset({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      maximumSelections: 2,
    });

    expect(mock.modifierGroupUpdateMany).toHaveBeenCalledWith({
      where: { sourcePresetId: 'preset-1' },
      data: { minimumSelections: 1, maximumSelections: 2 },
    });
  });
});

describe('ModifierPresetsService.putPresetTranslation -- translation sync (FT-6B, Section 7/10.9)', () => {
  it('syncs the name/helperText to every linked Product-local ModifierGroupTranslation for the SAME locale', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.putPresetTranslation({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      locale: 'ar',
      name: 'المقاس القياسي',
      helperText: 'اختر واحدًا',
    });

    expect(result.outcome).toBe('updated');
    expect(mock.modifierGroupFindMany).toHaveBeenCalledWith({
      where: { sourcePresetId: 'preset-1' },
      select: { id: true },
    });
    expect(mock.modifierGroupTranslationUpdateMany).toHaveBeenCalledWith({
      where: { modifierGroupId: { in: ['linked-group-1'] }, locale: 'ar' },
      data: { name: 'المقاس القياسي', helperText: 'اختر واحدًا' },
    });
  });

  it('never touches linked Groups when there are none (no-op sync)', async () => {
    const mock = buildPrismaMock();
    mock.modifierGroupFindMany.mockResolvedValue([]);
    const service = buildService(mock);

    await service.putPresetTranslation({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      locale: 'ar',
      name: 'اسم',
      helperText: null,
    });

    expect(mock.modifierGroupTranslationUpdateMany).not.toHaveBeenCalled();
  });
});

describe('ModifierPresetsService.putPresetOptionTranslation -- translation sync (FT-6B, Section 7)', () => {
  it('syncs the name to every linked Product-local ModifierOptionTranslation for the SAME locale', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.putPresetOptionTranslation({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
      locale: 'ar',
      name: 'كبير',
    });

    expect(result.outcome).toBe('updated');
    expect(mock.modifierOptionFindMany).toHaveBeenCalledWith({
      where: { sourcePresetOptionId: 'preset-option-1' },
      select: { id: true },
    });
    expect(mock.modifierOptionTranslationUpdateMany).toHaveBeenCalledWith({
      where: { modifierOptionId: { in: ['linked-option-1'] }, locale: 'ar' },
      data: { name: 'كبير' },
    });
  });
});

describe('ModifierPresetsService.deletePreset (FT-6B closeout, Section 5)', () => {
  it('allows Delete when the Preset has no linked Product Groups', async () => {
    const mock = buildPrismaMock();
    mock.modifierGroupCount.mockResolvedValue(0);
    const modifierPresetDelete = jest.fn().mockResolvedValue({});
    const service = new ModifierPresetsService({
      ...mock.prisma,
      modifierPreset: { ...mock.prisma.modifierPreset, delete: modifierPresetDelete },
    } as never);

    const result = await service.deletePreset({ restaurantId: RESTAURANT_ID, presetId: WELL_FORMED_UUID });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(modifierPresetDelete).toHaveBeenCalledWith({ where: { id: 'preset-1' } });
  });

  it('rejects Delete when the Preset is currently linked to a Product', async () => {
    const mock = buildPrismaMock();
    mock.modifierGroupCount.mockResolvedValue(1);
    const modifierPresetDelete = jest.fn();
    const service = new ModifierPresetsService({
      ...mock.prisma,
      modifierPreset: { ...mock.prisma.modifierPreset, delete: modifierPresetDelete },
    } as never);

    const result = await service.deletePreset({ restaurantId: RESTAURANT_ID, presetId: WELL_FORMED_UUID });

    expect(result).toEqual({ outcome: 'hasLinkedProducts' });
    expect(modifierPresetDelete).not.toHaveBeenCalled();
  });

  it('a Preset belonging to a DIFFERENT Restaurant -> presetNotFound', async () => {
    const mock = buildPrismaMock();
    mock.modifierPresetFindFirst.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.deletePreset({ restaurantId: FOREIGN_RESTAURANT_ID, presetId: WELL_FORMED_UUID });

    expect(result).toEqual({ outcome: 'presetNotFound' });
  });
});

describe('ModifierPresetsService.deletePresetOption (FT-6B closeout, Section 5)', () => {
  it('allows Delete when the Preset Option has no linked Product-local Options', async () => {
    const mock = buildPrismaMock();
    mock.modifierOptionCount.mockResolvedValue(0);
    const modifierPresetOptionDelete = jest.fn().mockResolvedValue({});
    const service = new ModifierPresetsService({
      ...mock.prisma,
      modifierPresetOption: { ...mock.prisma.modifierPresetOption, delete: modifierPresetOptionDelete },
    } as never);

    const result = await service.deletePresetOption({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
    });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(modifierPresetOptionDelete).toHaveBeenCalledWith({ where: { id: 'preset-option-1' } });
  });

  it('rejects Delete when the Preset Option is currently linked to a Product-local Option', async () => {
    const mock = buildPrismaMock();
    mock.modifierOptionCount.mockResolvedValue(1);
    const modifierPresetOptionDelete = jest.fn();
    const service = new ModifierPresetsService({
      ...mock.prisma,
      modifierPresetOption: { ...mock.prisma.modifierPresetOption, delete: modifierPresetOptionDelete },
    } as never);

    const result = await service.deletePresetOption({
      restaurantId: RESTAURANT_ID,
      presetId: WELL_FORMED_UUID,
      presetOptionId: PRESET_OPTION_ID,
    });

    expect(result).toEqual({ outcome: 'hasLinkedProducts' });
    expect(modifierPresetOptionDelete).not.toHaveBeenCalled();
  });
});
