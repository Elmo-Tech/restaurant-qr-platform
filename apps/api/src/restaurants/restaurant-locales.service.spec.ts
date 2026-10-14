import { RestaurantLocalesService } from './restaurant-locales.service';

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'en';

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const restaurantLocaleFindMany = jest.fn().mockResolvedValue([]);
  const restaurantLocaleUpsert = jest.fn();
  const restaurantLocaleUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

  const txClient = {
    restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
    restaurantLocale: {
      upsert: restaurantLocaleUpsert,
      updateMany: restaurantLocaleUpdateMany,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      restaurantLocale: {
        findMany: restaurantLocaleFindMany,
      },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    restaurantLocaleFindMany,
    restaurantLocaleUpsert,
    restaurantLocaleUpdateMany,
    $transaction,
  };
}

function buildService(
  mock: ReturnType<typeof buildPrismaMock>,
): RestaurantLocalesService {
  return new RestaurantLocalesService(mock.prisma as never);
}

describe('RestaurantLocalesService.listLocales', () => {
  it('returns en and ar exactly once, in registry order', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(result.locales.map((l) => l.locale)).toEqual(['en', 'ar']);
  });

  it('a missing non-default row appears inactive', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleFindMany.mockResolvedValue([]);
    const service = buildService(mock);

    const result = await service.listLocales({ restaurantId: RESTAURANT_ID });

    const ar = result.locales.find((l) => l.locale === 'ar');
    expect(ar).toEqual({ locale: 'ar', isDefault: false, isActive: false });
  });

  it('an existing inactive row appears inactive', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleFindMany.mockResolvedValue([
      { locale: 'ar', isActive: false },
    ]);
    const service = buildService(mock);

    const result = await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(result.locales.find((l) => l.locale === 'ar')?.isActive).toBe(false);
  });

  it('an existing active row appears active', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleFindMany.mockResolvedValue([
      { locale: 'ar', isActive: true },
    ]);
    const service = buildService(mock);

    const result = await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(result.locales.find((l) => l.locale === 'ar')?.isActive).toBe(true);
  });

  it('marks the Restaurant.defaultLocale entry isDefault=true and every other entry isDefault=false', async () => {
    const mock = buildPrismaMock();
    mock.restaurantFindUniqueOrThrow.mockResolvedValue({
      defaultLocale: 'ar',
    });
    const service = buildService(mock);

    const result = await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(result.defaultLocale).toBe('ar');
    expect(result.locales.find((l) => l.locale === 'ar')?.isDefault).toBe(true);
    expect(result.locales.find((l) => l.locale === 'en')?.isDefault).toBe(
      false,
    );
  });

  it('never writes -- no upsert/updateMany/create/update call exists on the mock at all for this path', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(mock.$transaction).not.toHaveBeenCalled();
    expect(mock.restaurantLocaleUpsert).not.toHaveBeenCalled();
    expect(mock.restaurantLocaleUpdateMany).not.toHaveBeenCalled();
  });

  it('scopes the RestaurantLocale read by restaurantId', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.listLocales({ restaurantId: RESTAURANT_ID });

    expect(mock.restaurantLocaleFindMany).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID },
      select: { locale: true, isActive: true },
    });
  });
});

describe('RestaurantLocalesService.setLocaleState -- enable', () => {
  it('enabling a missing locale creates an active row via upsert', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: true,
    });

    expect(result).toEqual({
      outcome: 'updated',
      data: { locale: 'ar', isActive: true },
    });
    expect(mock.restaurantLocaleUpsert).toHaveBeenCalledWith({
      where: {
        restaurantId_locale: { restaurantId: RESTAURANT_ID, locale: 'ar' },
      },
      create: { restaurantId: RESTAURANT_ID, locale: 'ar', isActive: true },
      update: { isActive: true },
    });
  });

  it('enabling an inactive locale reactivates it via the same upsert', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: true,
    });

    expect(result.outcome).toBe('updated');
    expect(mock.restaurantLocaleUpsert).toHaveBeenCalledTimes(1);
  });

  it('enabling an already-active locale is idempotent success', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'en',
      isActive: true,
    });

    expect(result).toEqual({
      outcome: 'updated',
      data: { locale: 'en', isActive: true },
    });
  });

  it('never calls updateMany (disable path) when enabling', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: true,
    });

    expect(mock.restaurantLocaleUpdateMany).not.toHaveBeenCalled();
  });
});

describe('RestaurantLocalesService.setLocaleState -- disable', () => {
  it('disabling an active non-default locale deactivates it via Tenant-scoped updateMany', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleUpdateMany.mockResolvedValue({ count: 1 });
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: false,
    });

    expect(result).toEqual({
      outcome: 'updated',
      data: { locale: 'ar', isActive: false },
    });
    expect(mock.restaurantLocaleUpdateMany).toHaveBeenCalledWith({
      where: { restaurantId: RESTAURANT_ID, locale: 'ar', isActive: true },
      data: { isActive: false },
    });
  });

  it('disabling an already-inactive locale is idempotent success (updateMany affects zero rows)', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleUpdateMany.mockResolvedValue({ count: 0 });
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: false,
    });

    expect(result).toEqual({
      outcome: 'updated',
      data: { locale: 'ar', isActive: false },
    });
  });

  it('disabling a never-enabled locale is a safe no-op and never calls create/upsert', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleUpdateMany.mockResolvedValue({ count: 0 });
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: false,
    });

    expect(result).toEqual({
      outcome: 'updated',
      data: { locale: 'ar', isActive: false },
    });
    expect(mock.restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('never calls upsert (enable path) when disabling', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: false,
    });

    expect(mock.restaurantLocaleUpsert).not.toHaveBeenCalled();
  });

  it('disabling the current default locale returns defaultLocaleRequired and never writes', async () => {
    const mock = buildPrismaMock();
    mock.restaurantFindUniqueOrThrow.mockResolvedValue({
      defaultLocale: 'en',
    });
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'en',
      isActive: false,
    });

    expect(result).toEqual({ outcome: 'defaultLocaleRequired' });
    expect(mock.restaurantLocaleUpsert).not.toHaveBeenCalled();
    expect(mock.restaurantLocaleUpdateMany).not.toHaveBeenCalled();
  });

  it('enabling the current default locale is allowed (already active, idempotent)', async () => {
    const mock = buildPrismaMock();
    mock.restaurantFindUniqueOrThrow.mockResolvedValue({
      defaultLocale: 'en',
    });
    const service = buildService(mock);

    const result = await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'en',
      isActive: true,
    });

    expect(result.outcome).toBe('updated');
  });
});

describe('RestaurantLocalesService.setLocaleState -- Tenant isolation', () => {
  it('reads defaultLocale scoped to the authorized restaurantId only', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: true,
    });

    expect(mock.restaurantFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      select: { defaultLocale: true },
    });
  });

  it('the disable updateMany is scoped by restaurantId, never affecting another Restaurant', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: false,
    });

    expect(mock.restaurantLocaleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { restaurantId: RESTAURANT_ID, locale: 'ar', isActive: true },
      }),
    );
  });

  it('the enable upsert is scoped by restaurantId, never affecting another Restaurant', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.setLocaleState({
      restaurantId: RESTAURANT_ID,
      locale: 'ar',
      isActive: true,
    });

    expect(mock.restaurantLocaleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId_locale: { restaurantId: RESTAURANT_ID, locale: 'ar' },
        },
      }),
    );
  });
});

describe('RestaurantLocalesService default locale (DEC-037)', () => {
  const NONE_MISSING = {
    menus: 0,
    categories: 0,
    products: 0,
    modifierGroups: 0,
    modifierOptions: 0,
    modifierPresets: 0,
    modifierPresetOptions: 0,
    branches: 0,
    deliveryZones: 0,
  };

  function buildDefaultMock(options: {
    defaultLocale?: string;
    localeActive?: boolean;
    missing?: Partial<typeof NONE_MISSING>;
    branchNames?: { branchId: string; name: string }[];
    zoneNames?: { deliveryZoneId: string; name: string }[];
  }) {
    const missing = { ...NONE_MISSING, ...options.missing };
    const count = (value: number) => jest.fn().mockResolvedValue(value);
    const client = {
      restaurant: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ defaultLocale: options.defaultLocale ?? 'en' }),
        update: jest.fn().mockResolvedValue({}),
      },
      restaurantLocale: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isActive: options.localeActive ?? true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      menu: { count: count(missing.menus) },
      category: { count: count(missing.categories) },
      product: { count: count(missing.products) },
      modifierGroup: { count: count(missing.modifierGroups) },
      modifierOption: { count: count(missing.modifierOptions) },
      modifierPreset: { count: count(missing.modifierPresets) },
      modifierPresetOption: { count: count(missing.modifierPresetOptions) },
      branch: { count: count(missing.branches), update: jest.fn() },
      deliveryZone: { count: count(missing.deliveryZones), update: jest.fn() },
      branchTranslation: {
        findMany: jest.fn().mockResolvedValue(options.branchNames ?? []),
      },
      deliveryZoneTranslation: {
        findMany: jest.fn().mockResolvedValue(options.zoneNames ?? []),
      },
    };
    const prisma = {
      ...client,
      $transaction: jest.fn((callback: (tx: typeof client) => unknown) =>
        Promise.resolve(callback(client)),
      ),
    };
    return { client, prisma, service: new RestaurantLocalesService(prisma as never) };
  }

  it('refuses a language that is not enabled for the Restaurant, writing nothing', async () => {
    const { client, service } = buildDefaultMock({ localeActive: false });

    const result = await service.setDefaultLocale({ restaurantId: RESTAURANT_ID }, 'ar');

    expect(result).toEqual({ outcome: 'localeNotActive' });
    expect(client.restaurant.update).not.toHaveBeenCalled();
  });

  it('refuses while names are missing and reports the counts per kind', async () => {
    const { client, service } = buildDefaultMock({
      missing: { products: 12, categories: 3 },
    });

    const result = await service.setDefaultLocale({ restaurantId: RESTAURANT_ID }, 'ar');

    expect(result).toMatchObject({
      outcome: 'incomplete',
      data: { ready: false, totalMissing: 15, missing: { products: 12, categories: 3 } },
    });
    expect(client.restaurant.update).not.toHaveBeenCalled();
    expect(client.branch.update).not.toHaveBeenCalled();
  });

  it('counts missing names scoped to the Restaurant and the target locale only', async () => {
    const { client, service } = buildDefaultMock({});

    await service.setDefaultLocale({ restaurantId: RESTAURANT_ID }, 'ar');

    expect(client.product.count).toHaveBeenCalledWith({
      where: {
        restaurantId: RESTAURANT_ID,
        translations: { none: { locale: 'ar', name: { not: '' } } },
      },
    });
  });

  it('changes the default and re-points branch and zone names to the new default', async () => {
    const { client, service } = buildDefaultMock({
      branchNames: [{ branchId: 'branch-1', name: 'الفرع الرئيسي' }],
      zoneNames: [{ deliveryZoneId: 'zone-1', name: 'وسط البلد' }],
    });

    const result = await service.setDefaultLocale({ restaurantId: RESTAURANT_ID }, 'ar');

    expect(result.outcome).toBe('updated');
    expect(client.restaurant.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { defaultLocale: 'ar' },
    });
    expect(client.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-1' },
      data: { name: 'الفرع الرئيسي' },
    });
    expect(client.deliveryZone.update).toHaveBeenCalledWith({
      where: { id: 'zone-1' },
      data: { name: 'وسط البلد' },
    });
    expect(client.branchTranslation.findMany).toHaveBeenCalledWith({
      where: { locale: 'ar', branch: { restaurantId: RESTAURANT_ID } },
      select: { branchId: true, name: true },
    });
  });

  it('is a harmless no-op when the language already is the default', async () => {
    const { client, service } = buildDefaultMock({
      defaultLocale: 'ar',
      missing: { products: 5 },
    });

    const result = await service.setDefaultLocale({ restaurantId: RESTAURANT_ID }, 'ar');

    expect(result.outcome).toBe('updated');
    expect(client.restaurant.update).not.toHaveBeenCalled();
    expect(client.product.count).not.toHaveBeenCalled();
  });

  it('readiness reports ready=false with counts, and does not write', async () => {
    const { client, service } = buildDefaultMock({ missing: { menus: 1 } });

    const result = await service.getDefaultLocaleReadiness(
      { restaurantId: RESTAURANT_ID },
      'ar',
    );

    expect(result).toMatchObject({
      outcome: 'ok',
      data: { locale: 'ar', ready: false, totalMissing: 1 },
    });
    expect(client.restaurant.update).not.toHaveBeenCalled();
  });

  it('readiness for a language that is not enabled is localeNotActive', async () => {
    const { service } = buildDefaultMock({ localeActive: false });

    const result = await service.getDefaultLocaleReadiness(
      { restaurantId: RESTAURANT_ID },
      'ar',
    );

    expect(result).toEqual({ outcome: 'localeNotActive' });
  });
});
