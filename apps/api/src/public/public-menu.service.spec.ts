import { PublicMenuService } from './public-menu.service';

function decimal(value: string) {
  return { toFixed: () => value } as unknown as { toFixed: (digits: number) => string };
}

const GENERIC_QR_ROW = {
  type: 'GENERIC' as const,
  status: 'ACTIVE' as const,
  restaurantId: 'restaurant-1',
  restaurant: {
    name: 'Elmo Bistro',
    status: 'ACTIVE' as const,
    defaultLocale: 'en',
    currencyCode: 'EGP',
  },
  branch: null,
  table: null,
};

const TABLE_QR_ROW = {
  ...GENERIC_QR_ROW,
  type: 'TABLE' as const,
  branch: { name: 'Downtown Branch' },
  table: { tableNumber: '12' },
};

const MENU_ROW = {
  id: 'menu-1',
  translations: [
    { locale: 'en', name: 'Main Menu', description: 'Everyday favorites.' },
    { locale: 'ar', name: 'القائمة الرئيسية', description: null },
  ],
};

function buildCategoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'category-1',
    imageAssetPath: '/media/category-1.jpg',
    translations: [
      { locale: 'en', name: 'Burgers', description: 'Grilled to order.' },
      { locale: 'ar', name: 'برجر', description: null },
    ],
    products: [
      {
        id: 'product-1',
        basePrice: decimal('12.50'),
        primaryImageAssetPath: '/media/product-1.jpg',
        availability: 'AVAILABLE' as const,
        featured: true,
        translations: [
          { locale: 'en', name: 'Cheeseburger', description: 'Beef, cheddar, pickles.' },
          { locale: 'ar', name: 'تشيز برجر', description: null },
        ],
        modifierGroups: [] as {
          id: string;
          minimumSelections: number;
          maximumSelections: number;
          translations: { locale: string; name: string; helperText: string | null }[];
          options: {
            id: string;
            priceAdjustment: { toFixed(digits: number): string };
            translations: { locale: string; name: string }[];
          }[];
        }[],
      },
    ],
    ...overrides,
  };
}

function buildPrismaMock() {
  const qrCodeFindUnique = jest.fn().mockResolvedValue(GENERIC_QR_ROW);
  const restaurantLocaleFindMany = jest
    .fn()
    .mockResolvedValue([{ locale: 'en' }, { locale: 'ar' }]);
  const menuFindFirst = jest.fn().mockResolvedValue(MENU_ROW);
  const categoryFindMany = jest.fn().mockResolvedValue([buildCategoryRow()]);
  const branchFindMany = jest.fn().mockResolvedValue([
    { id: 'branch-a', name: 'Downtown', deliveryZones: [] },
    {
      id: 'branch-b',
      name: 'Uptown',
      deliveryZones: [
        { id: 'zone-1', name: 'University District', deliveryFee: decimal('25.00'), minimumOrder: decimal('100.00') },
      ],
    },
  ]);

  // Deliberately ONLY find*/findFirst/findMany methods exist on this mock --
  // no create/update/upsert/delete/$transaction of any kind (Section 10/25:
  // "no mutation during public GET"). If `PublicMenuService` ever called a
  // write method, that call would throw "is not a function" and fail every
  // test here, so this mock shape is itself a standing structural guard,
  // not just the individual assertions below.
  return {
    prisma: {
      qrCode: { findUnique: qrCodeFindUnique },
      restaurantLocale: { findMany: restaurantLocaleFindMany },
      menu: { findFirst: menuFindFirst },
      category: { findMany: categoryFindMany },
      branch: { findMany: branchFindMany },
    },
    qrCodeFindUnique,
    restaurantLocaleFindMany,
    menuFindFirst,
    categoryFindMany,
    branchFindMany,
  };
}

function buildService(mock: ReturnType<typeof buildPrismaMock>): PublicMenuService {
  return new PublicMenuService(mock.prisma as never);
}

describe('PublicMenuService.getPublicMenu', () => {
  it('returns qrNotFound for an unknown publicCode', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'unknown',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result).toEqual({ outcome: 'qrNotFound' });
    expect(mock.restaurantLocaleFindMany).not.toHaveBeenCalled();
    expect(mock.menuFindFirst).not.toHaveBeenCalled();
  });

  it('returns qrNotFound for an INACTIVE QR', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({ ...GENERIC_QR_ROW, status: 'INACTIVE' });
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'inactive-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result).toEqual({ outcome: 'qrNotFound' });
  });

  it('returns qrNotFound for a suspended/inactive Restaurant even with an ACTIVE QR', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...GENERIC_QR_ROW,
      restaurant: { ...GENERIC_QR_ROW.restaurant, status: 'SUSPENDED' },
    });
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'qr-of-suspended-restaurant',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result).toEqual({ outcome: 'qrNotFound' });
  });

  it('resolves a TABLE QR with its Branch/Table context', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(TABLE_QR_ROW);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'table-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context).toEqual({
      qrType: 'TABLE',
      restaurant: { name: 'Elmo Bistro', currencyCode: 'EGP' },
      branch: { name: 'Downtown Branch' },
      table: { number: '12' },
      pickupBranches: null,
      deliveryBranches: null,
    });
  });

  it('resolves a GENERIC QR with no Branch/Table context', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context).toEqual({
      qrType: 'GENERIC',
      restaurant: { name: 'Elmo Bistro', currencyCode: 'EGP' },
      branch: null,
      table: null,
      pickupBranches: [
        { id: 'branch-a', name: 'Downtown' },
        { id: 'branch-b', name: 'Uptown' },
      ],
      // FT-8: only Branches with at least one ACTIVE zone, exact money strings.
      deliveryBranches: [
        {
          id: 'branch-b',
          name: 'Uptown',
          zones: [
            { id: 'zone-1', name: 'University District', deliveryFee: '25.00', minimumOrder: '100.00' },
          ],
        },
      ],
    });
    // FT-7: only the Restaurant's ACTIVE Branches, only id + display name.
    expect(mock.branchFindMany.mock.calls[0][0]).toMatchObject({
      where: { restaurantId: 'restaurant-1', status: 'ACTIVE' },
      select: expect.objectContaining({
        id: true,
        name: true,
        deliveryZones: expect.objectContaining({ where: { status: 'ACTIVE' } }),
      }),
    });
  });

  it('a TABLE QR exposes no pickupBranches and never queries Branches (FT-7)', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(TABLE_QR_ROW);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'table-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.pickupBranches).toBeNull();
    expect(result.data.context.deliveryBranches).toBeNull();
    expect(mock.branchFindMany).not.toHaveBeenCalled();
  });

  it('returns menuNotAvailable when there is no ACTIVE primary Menu', async () => {
    const mock = buildPrismaMock();
    mock.menuFindFirst.mockResolvedValue(null);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result).toEqual({ outcome: 'menuNotAvailable' });
    expect(mock.categoryFindMany).not.toHaveBeenCalled();
  });

  it('queries only ACTIVE Categories and, within each, only ACTIVE Products', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    const call = mock.categoryFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: 'ACTIVE', menuId: 'menu-1' });
    expect(call.select.products.where).toEqual({ status: 'ACTIVE' });
  });

  it('preserves displayOrder (then id) ordering for both Categories and Products', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    const call = mock.categoryFindMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ displayOrder: 'asc' }, { id: 'asc' }]);
    expect(call.select.products.orderBy).toEqual([
      { displayOrder: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('keeps a SOLD_OUT Product visible', async () => {
    const mock = buildPrismaMock();
    mock.categoryFindMany.mockResolvedValue([
      buildCategoryRow({
        products: [
          {
            id: 'product-sold-out',
            basePrice: decimal('9.00'),
            primaryImageAssetPath: null,
            availability: 'SOLD_OUT',
            featured: false,
            translations: [{ locale: 'en', name: 'Fries', description: null }],
            modifierGroups: [],
          },
        ],
      }),
    ]);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.menu.categories[0].products).toEqual([
      expect.objectContaining({ id: 'product-sold-out', availability: 'SOLD_OUT' }),
    ]);
  });

  it('resolves an explicit, currently-active Arabic locale', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: 'ar',
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.locale).toEqual({
      requested: 'ar',
      resolved: 'ar',
      default: 'en',
      available: ['en', 'ar'],
    });
    expect(result.data.menu.name).toBe('القائمة الرئيسية');
  });

  it('resolves Arabic from an Accept-Language header when no explicit lang is given', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: 'ar-EG,en;q=0.5',
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.locale.resolved).toBe('ar');
  });

  it('falls back to the Restaurant default locale when nothing else resolves', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleFindMany.mockResolvedValue([{ locale: 'en' }]);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.locale).toEqual({
      requested: null,
      resolved: 'en',
      default: 'en',
      available: ['en'],
    });
  });

  it('falls back safely to the default locale when the explicit lang is not currently active', async () => {
    const mock = buildPrismaMock();
    mock.restaurantLocaleFindMany.mockResolvedValue([{ locale: 'en' }]);
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: 'ar',
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.locale.resolved).toBe('en');
  });

  it('applies field-level fallback: an Arabic Category/Product with no Arabic description falls back to the English description', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: 'ar',
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    const category = result.data.menu.categories[0];
    expect(category.name).toBe('برجر');
    expect(category.description).toBe('Grilled to order.');
    const product = category.products[0];
    expect(product.name).toBe('تشيز برجر');
    expect(product.description).toBe('Beef, cheddar, pickles.');
  });

  it('preserves the exact decimal-string price, never converting through Number', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.menu.categories[0].products[0].basePrice).toBe('12.50');
  });

  it('returns Category/Product image asset paths unchanged', async () => {
    const mock = buildPrismaMock();
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.menu.categories[0].imageAssetPath).toBe('/media/category-1.jpg');
    expect(result.data.menu.categories[0].products[0].primaryImageAssetPath).toBe(
      '/media/product-1.jpg',
    );
  });
});
