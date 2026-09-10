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
