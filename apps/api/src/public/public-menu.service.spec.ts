import { EMPTY_CONTACT } from '../restaurants/restaurant-contact';
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
    logoAssetPath: null,
    coverAssetPath: null,
    contactPhone: null,
    whatsappNumber: null,
    hotlineNumber: null,
    facebookUrl: null,
    instagramUrl: null,
    tiktokUrl: null,
    telegramUrl: null,
    youtubeUrl: null,
    xUrl: null,
    snapchatUrl: null,
    mapsUrl: null,
    websiteUrl: null,
  },
  branch: null,
  table: null,
};

const TABLE_QR_ROW = {
  ...GENERIC_QR_ROW,
  type: 'TABLE' as const,
  branch: { name: 'Downtown Branch', translations: [] },
  tableId: 'table-1',
  table: { tableNumber: '12', status: 'ACTIVE' as const, staffOpenRequired: false },
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
        variants: [] as unknown[],
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
  const tableSessionFindFirst = jest.fn().mockResolvedValue(null);
  const categoryFindMany = jest.fn().mockResolvedValue([buildCategoryRow()]);
  const branchFindMany = jest.fn().mockResolvedValue([
    {
      id: 'branch-a',
      name: 'Downtown',
      timezone: 'Africa/Cairo',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      translations: [],
      deliveryZones: [],
    },
    {
      id: 'branch-b',
      name: 'Uptown',
      timezone: 'Africa/Cairo',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      translations: [],
      deliveryZones: [
        {
          id: 'zone-1',
          name: 'University District',
          translations: [],
          deliveryFee: decimal('25.00'),
          minimumOrder: decimal('100.00'),
        },
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
      qrCode: {
        findUnique: qrCodeFindUnique,
        findFirst: jest.fn().mockResolvedValue({ publicCode: 'generic-qr' }),
      },
      restaurantLocale: { findMany: restaurantLocaleFindMany },
      menu: { findFirst: menuFindFirst },
      category: { findMany: categoryFindMany },
      branch: { findMany: branchFindMany },
      tableSession: { findFirst: tableSessionFindFirst },
    },
    tableSessionFindFirst,
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

  it('passes the Restaurant logoAssetPath through to the Guest context', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...GENERIC_QR_ROW,
      restaurant: { ...GENERIC_QR_ROW.restaurant, logoAssetPath: '/media/logo.png' },
    });
    const service = buildService(mock);

    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.restaurant.logoAssetPath).toBe('/media/logo.png');
  });

  it('passes the Restaurant coverAssetPath through to the Guest context (null keeps the default hero)', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...GENERIC_QR_ROW,
      restaurant: { ...GENERIC_QR_ROW.restaurant, coverAssetPath: '/media/cover.jpg' },
    });
    const withCover = await buildService(mock).getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    const without = await buildService(buildPrismaMock()).getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(withCover.outcome === 'found' && withCover.data.context.restaurant.coverAssetPath).toBe(
      '/media/cover.jpg',
    );
    expect(without.outcome === 'found' && without.data.context.restaurant.coverAssetPath).toBeNull();
  });

  describe('bilingual Branch and Delivery zone names', () => {
    function localizedMock() {
      const mock = buildPrismaMock();
      mock.branchFindMany.mockResolvedValue([
        {
          id: 'branch-a',
          name: 'Downtown',
          timezone: 'Africa/Cairo',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          translations: [
            { locale: 'en', name: 'Downtown' },
            { locale: 'ar', name: 'وسط البلد' },
          ],
          deliveryZones: [
            {
              id: 'zone-1',
              name: 'University District',
              translations: [
                { locale: 'en', name: 'University District' },
                { locale: 'ar', name: 'حي الجامعة' },
              ],
              deliveryFee: decimal('25.00'),
              minimumOrder: decimal('100.00'),
            },
          ],
        },
        // legacy single-language data: no translation rows at all
        {
          id: 'branch-b',
          name: 'Uptown',
          timezone: 'Africa/Cairo',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          translations: [],
          deliveryZones: [],
        },
        // only the default locale translated: the Arabic Guest falls back to it
        {
          id: 'branch-c',
          name: 'Heliopolis',
          timezone: 'Africa/Cairo',
          createdAt: new Date('2026-01-03T00:00:00Z'),
          translations: [{ locale: 'en', name: 'Heliopolis' }],
          deliveryZones: [],
        },
      ]);
      return mock;
    }

    it('returns the Arabic names to an Arabic Guest', async () => {
      const result = await buildService(localizedMock()).getPublicMenu({
        publicCode: 'generic-qr',
        explicitLang: 'ar',
        acceptLanguageHeader: null,
      });

      expect(result.outcome).toBe('found');
      if (result.outcome !== 'found') return;
      expect(result.data.context.pickupBranches).toEqual([
        { id: 'branch-a', name: 'وسط البلد', hours: null },
        { id: 'branch-b', name: 'Uptown', hours: null },
        { id: 'branch-c', name: 'Heliopolis', hours: null },
      ]);
      expect(result.data.context.deliveryBranches?.[0]).toMatchObject({
        name: 'وسط البلد',
        zones: [expect.objectContaining({ id: 'zone-1', name: 'حي الجامعة' })],
      });
    });

    it('returns the English names to an English Guest', async () => {
      const result = await buildService(localizedMock()).getPublicMenu({
        publicCode: 'generic-qr',
        explicitLang: 'en',
        acceptLanguageHeader: null,
      });

      expect(result.outcome).toBe('found');
      if (result.outcome !== 'found') return;
      expect(result.data.context.pickupBranches?.map((b) => b.name)).toEqual([
        'Downtown',
        'Uptown',
        'Heliopolis',
      ]);
    });

    it('localizes the TABLE QR Branch name too, with the legacy name as the last fallback', async () => {
      const mock = buildPrismaMock();
      mock.qrCodeFindUnique.mockResolvedValue({
        ...TABLE_QR_ROW,
        branch: {
          name: 'Downtown Branch',
          translations: [{ locale: 'ar', name: 'فرع وسط البلد' }],
        },
      });

      const arabic = await buildService(mock).getPublicMenu({
        publicCode: 'table-qr',
        explicitLang: 'ar',
        acceptLanguageHeader: null,
      });
      const english = await buildService(mock).getPublicMenu({
        publicCode: 'table-qr',
        explicitLang: 'en',
        acceptLanguageHeader: null,
      });

      expect(arabic.outcome === 'found' && arabic.data.context.branch).toEqual({
        name: 'فرع وسط البلد',
      });
      expect(english.outcome === 'found' && english.data.context.branch).toEqual({
        name: 'Downtown Branch',
      });
    });
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
      restaurant: {
        name: 'Elmo Bistro',
        currencyCode: 'EGP',
        logoAssetPath: null,
        coverAssetPath: null,
        contact: EMPTY_CONTACT,
        shareCode: 'generic-qr',
        hours: null,
      },
      tableOrdering: 'AVAILABLE',
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
      tableOrdering: null,
      restaurant: {
        name: 'Elmo Bistro',
        currencyCode: 'EGP',
        logoAssetPath: null,
        coverAssetPath: null,
        contact: EMPTY_CONTACT,
        shareCode: 'generic-qr',
        hours: null,
      },
      branch: null,
      table: null,
      pickupBranches: [
        { id: 'branch-a', name: 'Downtown', hours: null },
        { id: 'branch-b', name: 'Uptown', hours: null },
      ],
      // FT-8: only Branches with at least one ACTIVE zone, exact money strings.
      deliveryBranches: [
        {
          id: 'branch-b',
          name: 'Uptown',
          hours: null,
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
            variants: [] as unknown[],
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

describe('PublicMenuService Table QR ordering availability (Table Sessions)', () => {
  const lockedTable = { ...TABLE_QR_ROW, table: { ...TABLE_QR_ROW.table, staffOpenRequired: true } };

  async function menuTableOrdering(mock: ReturnType<typeof buildPrismaMock>) {
    const result = await buildService(mock).getPublicMenu({
      publicCode: 'table-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    expect(result.outcome).toBe('found');
    return result.outcome === 'found' ? result.data.context.tableOrdering : undefined;
  }

  it('reports AVAILABLE for an unlocked table without any session query', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(TABLE_QR_ROW);

    expect(await menuTableOrdering(mock)).toBe('AVAILABLE');
    expect(mock.tableSessionFindFirst).not.toHaveBeenCalled();
  });

  it('reports CLOSED for a locked table with no OPEN session', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(lockedTable);

    expect(await menuTableOrdering(mock)).toBe('CLOSED');
    expect(mock.tableSessionFindFirst).toHaveBeenCalledWith({
      where: { tableId: 'table-1', status: 'OPEN' },
      select: { id: true },
    });
  });

  it('an OPEN session wins over a stale lock flag', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(lockedTable);
    mock.tableSessionFindFirst.mockResolvedValue({ id: 'session-1' });

    expect(await menuTableOrdering(mock)).toBe('AVAILABLE');
  });

  it('a GENERIC QR never carries the field', async () => {
    const mock = buildPrismaMock();

    expect(await menuTableOrdering(mock)).toBeNull();
    expect(mock.tableSessionFindFirst).not.toHaveBeenCalled();
  });

  describe('getTableOrdering (Check again)', () => {
    it('returns the advisory value for an ACTIVE table QR', async () => {
      const mock = buildPrismaMock();
      mock.qrCodeFindUnique.mockResolvedValue(lockedTable);

      expect(await buildService(mock).getTableOrdering('table-qr')).toEqual({
        outcome: 'found',
        tableOrdering: 'CLOSED',
      });
    });

    it.each([
      ['unknown QR', null],
      ['INACTIVE QR', { ...TABLE_QR_ROW, status: 'INACTIVE' }],
      ['GENERIC QR', { ...TABLE_QR_ROW, type: 'GENERIC', tableId: null }],
      ['INACTIVE table', { ...TABLE_QR_ROW, table: { ...TABLE_QR_ROW.table, status: 'INACTIVE' } }],
      ['suspended restaurant', { ...TABLE_QR_ROW, restaurant: { ...TABLE_QR_ROW.restaurant, status: 'SUSPENDED' } }],
    ])('%s -> qrNotFound (never a distinguishable reason)', async (_name, row) => {
      const mock = buildPrismaMock();
      mock.qrCodeFindUnique.mockResolvedValue(row);

      expect(await buildService(mock).getTableOrdering('x')).toEqual({ outcome: 'qrNotFound' });
    });
  });
});

describe('PublicMenuService -- restaurant ordering options', () => {
  async function menuFor(flags: { pickupEnabled?: boolean; deliveryEnabled?: boolean }) {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...GENERIC_QR_ROW,
      restaurant: { ...GENERIC_QR_ROW.restaurant, ...flags },
    });
    const result = await buildService(mock).getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    if (result.outcome !== 'found') throw new Error('expected found');
    return result.data.context;
  }

  it('offers both types by default', async () => {
    const context = await menuFor({});
    expect(context.pickupBranches?.length).toBeGreaterThan(0);
    expect(context.deliveryBranches?.length).toBeGreaterThan(0);
  });

  it('offers no Pickup branch while Pickup is switched off (Delivery stays)', async () => {
    const context = await menuFor({ pickupEnabled: false });
    expect(context.pickupBranches).toEqual([]);
    expect(context.deliveryBranches?.length).toBeGreaterThan(0);
  });

  it('offers no Delivery branch while Delivery is switched off (Pickup stays)', async () => {
    const context = await menuFor({ deliveryEnabled: false });
    expect(context.deliveryBranches).toEqual([]);
    expect(context.pickupBranches?.length).toBeGreaterThan(0);
  });

  it('offers nothing when both are switched off: the menu is browse-only', async () => {
    const context = await menuFor({ pickupEnabled: false, deliveryEnabled: false });
    expect(context.pickupBranches).toEqual([]);
    expect(context.deliveryBranches).toEqual([]);
  });
});

describe('PublicMenuService -- Table channel view-only (DEC-038)', () => {
  async function tableMenu(restaurantFlags: { tableOrderingEnabled?: boolean }) {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      restaurant: { ...TABLE_QR_ROW.restaurant, ...restaurantFlags },
    });
    const result = await buildService(mock).getPublicMenu({
      publicCode: 'table-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    if (result.outcome !== 'found') throw new Error('expected found');
    return result.data.context;
  }

  it('reports DISABLED for a TABLE QR while Table ordering is switched off', async () => {
    const context = await tableMenu({ tableOrderingEnabled: false });
    expect(context.tableOrdering).toBe('DISABLED');
  });

  it('keeps the normal availability state while Table ordering is on', async () => {
    const context = await tableMenu({ tableOrderingEnabled: true });
    expect(context.tableOrdering).not.toBe('DISABLED');
  });

  it('the advisory re-check also reports DISABLED, without touching sessions', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      restaurant: { ...TABLE_QR_ROW.restaurant, tableOrderingEnabled: false },
    });

    const result = await buildService(mock).getTableOrdering('table-qr');

    expect(result).toEqual({ outcome: 'found', tableOrdering: 'DISABLED' });
  });
});
