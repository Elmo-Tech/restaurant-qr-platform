import { EMPTY_CONTACT } from '../restaurants/restaurant-contact';
import { PublicMenuService } from './public-menu.service';
import { ALL_FEATURES } from '../entitlements/features';
import { MENU_TEMPLATE_KEYS } from '../entitlements/templates';
import { DEFAULT_EMBER_SETTINGS } from '../restaurants/ember-template-config';
import { DEFAULT_BLOOM_SETTINGS } from '../restaurants/bloom-template-config';
import { DEFAULT_BREW_SETTINGS } from '../restaurants/brew-template-config';
import { DEFAULT_EDITORIAL_SETTINGS } from '../restaurants/editorial-template-config';

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
    menuTemplate: 'CLASSIC' as const,
    suggestionsMode: 'OFF' as const,
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
  // Readable links (DEC-066): by default the Restaurant has no slug yet and the URL segment is a QR code.
  const slugFindUnique = jest.fn().mockResolvedValue(null);
  const slugFindFirst = jest.fn().mockResolvedValue(null);
  const qrCodeFindFirst = jest.fn().mockResolvedValue({ publicCode: 'generic-qr' });
  const restaurantLocaleFindMany = jest
    .fn()
    .mockResolvedValue([{ locale: 'en' }, { locale: 'ar' }]);
  const menuFindFirst = jest.fn().mockResolvedValue(MENU_ROW);
  const tableSessionFindFirst = jest.fn().mockResolvedValue(null);
  const templateConfigFindUnique = jest.fn().mockResolvedValue(null);
  const platformPublicSettingsFindUnique = jest
    .fn()
    .mockResolvedValue({ poweredByUrl: 'https://menu.elmotechsoft.online/' });
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
      restaurantAnnouncement: { findMany: jest.fn().mockResolvedValue([]) },
      qrCode: {
        findUnique: qrCodeFindUnique,
        findFirst: qrCodeFindFirst,
      },
      restaurantSlug: { findUnique: slugFindUnique, findFirst: slugFindFirst },
      restaurantLocale: { findMany: restaurantLocaleFindMany },
      menu: { findFirst: menuFindFirst },
      category: { findMany: categoryFindMany },
      branch: { findMany: branchFindMany },
      tableSession: { findFirst: tableSessionFindFirst },
      platformPublicSettings: { findUnique: platformPublicSettingsFindUnique },
      restaurantTemplateConfig: { findUnique: templateConfigFindUnique },
    },
    tableSessionFindFirst,
    qrCodeFindUnique,
    qrCodeFindFirst,
    slugFindUnique,
    slugFindFirst,
    restaurantLocaleFindMany,
    menuFindFirst,
    categoryFindMany,
    branchFindMany,
    platformPublicSettingsFindUnique,
    templateConfigFindUnique,
  };
}

/** Every feature allowed (DEC-043): the default for a Restaurant without overrides. */
const ENTITLEMENTS = {
  forRestaurant: () => Promise.resolve(ALL_FEATURES),
  detailsFor: () => Promise.resolve({ features: ALL_FEATURES, templates: [...MENU_TEMPLATE_KEYS] }),
};

function buildService(mock: ReturnType<typeof buildPrismaMock>): PublicMenuService {
  return new PublicMenuService(mock.prisma as never, ENTITLEMENTS as never);
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

  it('returns the Platform-controlled Powered by destination with a safe default', async () => {
    const configured = buildPrismaMock();
    configured.platformPublicSettingsFindUnique.mockResolvedValue({
      poweredByUrl: 'https://wayta.example/pricing',
    });
    const configuredResult = await buildService(configured).getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    const missing = buildPrismaMock();
    missing.platformPublicSettingsFindUnique.mockResolvedValue(null);
    const defaultResult = await buildService(missing).getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });

    expect(
      configuredResult.outcome === 'found'
        ? configuredResult.data.context.platform.poweredByUrl
        : null,
    ).toBe('https://wayta.example/pricing');
    expect(
      defaultResult.outcome === 'found'
        ? defaultResult.data.context.platform.poweredByUrl
        : null,
    ).toBe('https://menu.elmotechsoft.online/');
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

  it('exposes only the saved Editorial price mode, never an unpublished draft', async () => {
    const mock = buildPrismaMock();
    mock.templateConfigFindUnique.mockImplementation(({ where }: {
      where: { restaurantId_template: { restaurantId: string; template: string } }
    }) => {
      if (where.restaurantId_template.template === 'EDITORIAL') {
        return Promise.resolve({
          publishedSettings: { priceDisplay: 'FROM' },
          draftSettings: { priceDisplay: 'ALL_VARIANTS' },
        });
      }
      return Promise.resolve(null);
    });
    const service = buildService(mock);
    const result = await service.getPublicMenu({
      publicCode: 'generic-qr',
      explicitLang: 'ar',
      acceptLanguageHeader: null,
    });
    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.restaurant.editorialSettings).toEqual({ priceDisplay: 'FROM' });
    expect(mock.templateConfigFindUnique).toHaveBeenCalledWith({
      where: { restaurantId_template: { restaurantId: 'restaurant-1', template: 'EDITORIAL' } },
      select: { publishedSettings: true },
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
      entry: { publicCode: 'table-qr', redirectToSlug: null },
      platform: { poweredByUrl: 'https://menu.elmotechsoft.online/' },
      qrType: 'TABLE',
      restaurant: {
        name: 'Elmo Bistro',
        currencyCode: 'EGP',
        logoAssetPath: null,
        coverAssetPath: null,
        menuTemplate: 'CLASSIC',
        emberSettings: DEFAULT_EMBER_SETTINGS,
        bloomSettings: DEFAULT_BLOOM_SETTINGS,
        brewSettings: DEFAULT_BREW_SETTINGS,
        editorialSettings: DEFAULT_EDITORIAL_SETTINGS,
        contact: EMPTY_CONTACT,
        shareCode: 'generic-qr',
        hours: null,
      },
      tableOrdering: 'AVAILABLE',
      branch: { name: 'Downtown Branch' },
      table: { number: '12' },
      announcements: [],
      suggestions: false,
      tracking: true,
      templatesAllowed: true,
      allowedTemplates: [...MENU_TEMPLATE_KEYS],
      ordering: null,
      pickupBranches: null,
      deliveryBranches: null,
      locations: [],
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
      entry: { publicCode: 'generic-qr', redirectToSlug: null },
      platform: { poweredByUrl: 'https://menu.elmotechsoft.online/' },
      qrType: 'GENERIC',
      tableOrdering: null,
      restaurant: {
        name: 'Elmo Bistro',
        currencyCode: 'EGP',
        logoAssetPath: null,
        coverAssetPath: null,
        menuTemplate: 'CLASSIC',
        emberSettings: DEFAULT_EMBER_SETTINGS,
        bloomSettings: DEFAULT_BLOOM_SETTINGS,
        brewSettings: DEFAULT_BREW_SETTINGS,
        editorialSettings: DEFAULT_EDITORIAL_SETTINGS,
        contact: EMPTY_CONTACT,
        shareCode: 'generic-qr',
        hours: null,
      },
      branch: null,
      table: null,
      announcements: [],
      suggestions: false,
      tracking: true,
      templatesAllowed: true,
      allowedTemplates: [...MENU_TEMPLATE_KEYS],
      ordering: { pickup: true, delivery: true, whatsapp: false },
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
      locations: [],
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

describe('Exclusive Menu Design tenant-only base reservation', () => {
  const limitedEntitlements = {
    forRestaurant: () => Promise.resolve(ALL_FEATURES),
    detailsFor: () =>
      Promise.resolve({ features: ALL_FEATURES, templates: ['CLASSIC'] }),
  };

  function menuFor(
    row: object,
    qrType: 'GENERIC' | 'TABLE' = 'GENERIC',
  ) {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...(qrType === 'TABLE' ? TABLE_QR_ROW : GENERIC_QR_ROW),
      restaurant: { ...GENERIC_QR_ROW.restaurant, ...row },
    });
    const svc = new PublicMenuService(
      mock.prisma as never,
      limitedEntitlements as never,
    );
    return svc.getPublicMenu({
      publicCode: qrType === 'TABLE' ? 'table-qr' : 'generic-qr',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
  }

  it('a Restaurant whose exclusive design is in use gets branding on the "menu unavailable" outcome; no other Restaurant does', async () => {
    const unavailable = async (exclusiveDesign: object | null) => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue(null);
      mock.qrCodeFindUnique.mockResolvedValue({
        ...GENERIC_QR_ROW,
        restaurant: { ...GENERIC_QR_ROW.restaurant, exclusiveDesign },
      });
      return new PublicMenuService(mock.prisma as never, limitedEntitlements as never).getPublicMenu({
        publicCode: 'generic-qr',
        explicitLang: null,
        acceptLanguageHeader: null,
      });
    };
    const branded = await unavailable({ baseTemplate: 'CLASSIC', status: 'ACTIVE_CUSTOM', rendererKey: 'SHERBINY_FIRE_DOUGH_V1' });
    expect(branded).toMatchObject({
      outcome: 'menuNotAvailable',
      branding: { exclusiveRendererKey: 'SHERBINY_FIRE_DOUGH_V1', restaurantName: GENERIC_QR_ROW.restaurant.name },
    });
    // The Restaurant chose a stock template, has none, or the design is only a base: the generic page stays.
    expect(await unavailable({ baseTemplate: 'CLASSIC', status: 'ACTIVE_CUSTOM', rendererKey: 'SHERBINY_FIRE_DOUGH_V1', useExclusive: false })).toEqual({ outcome: 'menuNotAvailable' });
    expect(await unavailable(null)).toEqual({ outcome: 'menuNotAvailable' });
    expect(JSON.stringify(branded)).not.toMatch(/draft|publishedSettings/i);
  });

  it('resolves the compiled VERDE renderer only for its assigned Restaurant without unlocking stock templates', async () => {
    const assigned = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'VERDE_NAPOLI_V1',
      },
    });
    expect(assigned.outcome).toBe('found');
    if (assigned.outcome !== 'found') return;
    expect(assigned.data.context.restaurant.exclusiveRendererKey).toBe('VERDE_NAPOLI_V1');
    expect(assigned.data.context.restaurant.menuTemplate).toBe('CLASSIC');
    expect(assigned.data.context.allowedTemplates).toEqual(['CLASSIC']);
    expect(JSON.stringify(assigned.data)).not.toContain('exclusiveDesign');

    const otherRestaurant = await menuFor({ exclusiveDesign: null });
    expect(otherRestaurant.outcome).toBe('found');
    if (otherRestaurant.outcome !== 'found') return;
    expect(otherRestaurant.data.context.restaurant.exclusiveRendererKey).toBeUndefined();
    expect(otherRestaurant.data.context.allowedTemplates).toEqual(['CLASSIC']);
  });

  it('returns only the PUBLISHED VERDE appearance, never the draft, and nothing for other tenants', async () => {
    const heroPath = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
    const assigned = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'VERDE_NAPOLI_V1',
        draftSettings: { headlineLineEn: 'DRAFT ONLY COPY' },
        publishedSettings: { headlineLineEn: 'Published copy', heroImageAssetPath: heroPath },
      },
    });
    expect(assigned.outcome).toBe('found');
    if (assigned.outcome !== 'found') return;
    expect(assigned.data.context.restaurant.verdeSettings?.headlineLineEn).toBe('Published copy');
    expect(assigned.data.context.restaurant.verdeSettings?.heroImageAssetPath).toBe(heroPath);
    expect(JSON.stringify(assigned.data)).not.toContain('DRAFT ONLY COPY');

    expect(assigned.data.context.restaurant.exclusiveInUse).toBe(true);
    const chosenStock = await menuFor({
      exclusiveDesign: { baseTemplate: 'CLASSIC', status: 'ACTIVE_CUSTOM', rendererKey: 'VERDE_NAPOLI_V1', useExclusive: false },
    });
    expect(chosenStock.outcome).toBe('found');
    if (chosenStock.outcome !== 'found') return;
    expect(chosenStock.data.context.restaurant.exclusiveInUse).toBe(false);

    const other = await menuFor({ exclusiveDesign: null });
    expect(other.outcome).toBe('found');
    if (other.outcome !== 'found') return;
    expect(other.data.context.restaurant.verdeSettings).toBeUndefined();

    const inactive = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'DISABLED',
        rendererKey: 'VERDE_NAPOLI_V1',
        publishedSettings: { headlineLineEn: 'Should stay private' },
      },
    });
    expect(inactive.outcome).toBe('found');
    if (inactive.outcome !== 'found') return;
    expect(inactive.data.context.restaurant.verdeSettings).toBeUndefined();
  });

  it('returns only the PUBLISHED El Sherbiny appearance under its own key, never the draft nor the VERDE settings', async () => {
    const heroPath = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.webp';
    const assigned = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'SHERBINY_FIRE_DOUGH_V1',
        draftSettings: { heroTitleEn: 'DRAFT ONLY COPY' },
        publishedSettings: { heroTitleEn: 'Published copy', heroImageAssetPath: heroPath },
      },
    });
    expect(assigned.outcome).toBe('found');
    if (assigned.outcome !== 'found') return;
    const restaurant = assigned.data.context.restaurant;
    expect(restaurant.exclusiveRendererKey).toBe('SHERBINY_FIRE_DOUGH_V1');
    expect(restaurant.sherbinySettings?.heroTitleEn).toBe('Published copy');
    expect(restaurant.sherbinySettings?.heroImageAssetPath).toBe(heroPath);
    expect(restaurant.verdeSettings).toBeUndefined();
    expect(JSON.stringify(assigned.data)).not.toContain('DRAFT ONLY COPY');
    expect(assigned.data.context.allowedTemplates).toEqual(['CLASSIC']);

    const other = await menuFor({ exclusiveDesign: null });
    expect(other.outcome).toBe('found');
    if (other.outcome !== 'found') return;
    expect(other.data.context.restaurant.exclusiveRendererKey).toBeUndefined();
    expect(other.data.context.restaurant.sherbinySettings).toBeUndefined();

    const unknownKey = await menuFor({
      exclusiveDesign: { baseTemplate: 'CLASSIC', status: 'ACTIVE_CUSTOM', rendererKey: 'SOMEONE_ELSE_V1' },
    });
    expect(unknownKey.outcome).toBe('found');
    if (unknownKey.outcome !== 'found') return;
    expect(unknownKey.data.context.restaurant.exclusiveRendererKey).toBeUndefined();
  });

  it('returns only the PUBLISHED Makkboz appearance under its own key, never the draft nor other designs', async () => {
    const assigned = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'MAKKBOZ_HERITAGE_V1',
        draftSettings: { heroTitleEn: 'DRAFT ONLY COPY' },
        publishedSettings: { heroTitleEn: 'Published copy', defaultView: 'LIST' },
      },
    });
    expect(assigned.outcome).toBe('found');
    if (assigned.outcome !== 'found') return;
    const restaurant = assigned.data.context.restaurant;
    expect(restaurant.exclusiveRendererKey).toBe('MAKKBOZ_HERITAGE_V1');
    expect(restaurant.makkbozSettings?.heroTitleEn).toBe('Published copy');
    expect(restaurant.makkbozSettings?.defaultView).toBe('LIST');
    expect(restaurant.sherbinySettings).toBeUndefined();
    expect(restaurant.verdeSettings).toBeUndefined();
    expect(JSON.stringify(assigned.data)).not.toContain('DRAFT ONLY COPY');

    const other = await menuFor({ exclusiveDesign: null });
    expect(other.outcome).toBe('found');
    if (other.outcome !== 'found') return;
    expect(other.data.context.restaurant.makkbozSettings).toBeUndefined();
  });

  it('returns only the PUBLISHED Meat Lovers appearance under its own key, never the draft nor other designs', async () => {
    const assigned = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'MEAT_LOVERS_BUTCHER_V1',
        draftSettings: { heroTitleEn: 'DRAFT ONLY COPY' },
        publishedSettings: { heroTitleEn: 'Published copy', theme: 'LIGHT', defaultView: 'LIST' },
      },
    });
    expect(assigned.outcome).toBe('found');
    if (assigned.outcome !== 'found') return;
    const restaurant = assigned.data.context.restaurant;
    expect(restaurant.exclusiveRendererKey).toBe('MEAT_LOVERS_BUTCHER_V1');
    expect(restaurant.meatLoversSettings?.heroTitleEn).toBe('Published copy');
    expect(restaurant.meatLoversSettings?.theme).toBe('LIGHT');
    expect(restaurant.meatLoversSettings?.defaultView).toBe('LIST');
    expect(restaurant.makkbozSettings).toBeUndefined();
    expect(restaurant.sherbinySettings).toBeUndefined();
    expect(restaurant.verdeSettings).toBeUndefined();
    expect(JSON.stringify(assigned.data)).not.toContain('DRAFT ONLY COPY');

    const other = await menuFor({ exclusiveDesign: null });
    expect(other.outcome).toBe('found');
    if (other.outcome !== 'found') return;
    expect(other.data.context.restaurant.meatLoversSettings).toBeUndefined();
    expect(other.data.context.restaurant.exclusiveRendererKey).toBeUndefined();
  });

  it('lists the Branch address and phone only for display, leaving out Branches with neither', async () => {
    const result = await menuFor({}, 'TABLE');
    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.locations).toEqual([]);

    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue({
      ...TABLE_QR_ROW,
      branch: { ...TABLE_QR_ROW.branch, address: ' Aswan ', phone: null },
    });
    const svc = new PublicMenuService(mock.prisma as never, limitedEntitlements as never);
    const withAddress = await svc.getPublicMenu({ publicCode: 'table-qr', explicitLang: null, acceptLanguageHeader: null });
    expect(withAddress.outcome).toBe('found');
    if (withAddress.outcome !== 'found') return;
    expect(withAddress.data.context.locations).toEqual([
      { name: 'Downtown Branch', address: 'Aswan', phone: null },
    ]);
  });

  it.each(['RESERVED', 'ACTIVE_BASE', 'DISABLED'])(
    'does not expose a stored bespoke renderer while its status is %s',
    async (status) => {
      const result = await menuFor({
        exclusiveDesign: {
          baseTemplate: 'CLASSIC',
          status,
          rendererKey: 'VERDE_NAPOLI_V1',
        },
      });
      expect(result.outcome).toBe('found');
      if (result.outcome !== 'found') return;
      expect(result.data.context.restaurant.exclusiveRendererKey).toBeUndefined();
    },
  );

  it('resolves the VERDE renderer for the authorized Table QR path too', async () => {
    const result = await menuFor({
      exclusiveDesign: {
        baseTemplate: 'CLASSIC',
        status: 'ACTIVE_CUSTOM',
        rendererKey: 'VERDE_NAPOLI_V1',
      },
    }, 'TABLE');
    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.qrType).toBe('TABLE');
    expect(result.data.context.restaurant.exclusiveRendererKey).toBe('VERDE_NAPOLI_V1');
  });

  it('activates a stock BLOOM base only for the QR-resolved assigned Restaurant, even with Classic-only package', async () => {
    const exclusive = await menuFor({
      exclusiveDesign: { baseTemplate: 'BLOOM', status: 'ACTIVE_BASE' },
    });
    expect(exclusive.outcome).toBe('found');
    if (exclusive.outcome !== 'found') return;
    expect(exclusive.data.context.restaurant.menuTemplate).toBe('BLOOM');
    expect(exclusive.data.context.allowedTemplates).toEqual(['CLASSIC', 'BLOOM']);
    expect(exclusive.data.context.restaurant.bloomSettings).toEqual(DEFAULT_BLOOM_SETTINGS);

    const otherTenant = await menuFor({ exclusiveDesign: null });
    expect(otherTenant.outcome).toBe('found');
    if (otherTenant.outcome !== 'found') return;
    expect(otherTenant.data.context.restaurant.menuTemplate).toBe('CLASSIC');
    expect(otherTenant.data.context.allowedTemplates).toEqual(['CLASSIC']);
    expect(otherTenant.data.context.restaurant.bloomSettings).toBeUndefined();
  });

  it.each(['RESERVED', 'DISABLED'])(
    '%s reservation does not change the public Menu or unlock stock templates',
    async (status) => {
      const result = await menuFor({
        exclusiveDesign: { baseTemplate: 'EMBER', status },
      });
      expect(result.outcome).toBe('found');
      if (result.outcome !== 'found') return;
      expect(result.data.context.restaurant.menuTemplate).toBe('CLASSIC');
      expect(result.data.context.allowedTemplates).toEqual(['CLASSIC']);
      expect(result.data.context.restaurant.emberSettings).toBeUndefined();
    },
  );

  it('supports an exclusive base on the same Table QR path without exposing assignment metadata', async () => {
    const result = await menuFor(
      { exclusiveDesign: { baseTemplate: 'BREW', status: 'ACTIVE_BASE' } },
      'TABLE',
    );
    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.restaurant.menuTemplate).toBe('BREW');
    expect(result.data.context.qrType).toBe('TABLE');
    expect(JSON.stringify(result.data)).not.toContain('exclusiveDesign');
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

describe('PublicMenuService readable menu links (DEC-066)', () => {
  const input = (publicCode: string) => ({
    publicCode,
    explicitLang: null,
    acceptLanguageHeader: null,
  });

  it("opens the restaurant menu from its slug through the restaurant's own generic QR", async () => {
    const mock = buildPrismaMock();
    mock.slugFindUnique.mockResolvedValue({ restaurantId: 'restaurant-1', isCurrent: true });
    mock.qrCodeFindFirst.mockResolvedValue({ publicCode: 'GENERIC-CODE-OF-RESTAURANT-1' });
    mock.slugFindFirst.mockResolvedValue({ slug: 'elmo-bistro' });

    const result = await buildService(mock).getPublicMenu(input('elmo-bistro'));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    // The generic QR code the Guest app uses for orders and storage; no redirect (already the readable URL).
    expect(result.data.context.entry).toEqual({
      publicCode: 'GENERIC-CODE-OF-RESTAURANT-1',
      redirectToSlug: null,
    });
    expect(result.data.context.restaurant.shareCode).toBe('elmo-bistro');
    expect(mock.qrCodeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicCode: 'GENERIC-CODE-OF-RESTAURANT-1' } }),
    );
    // The generic QR is looked up by the slug's own restaurant only.
    expect(mock.qrCodeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'restaurant-1', type: 'GENERIC' } }),
    );
  });

  it('redirects a renamed (former) slug to the current one', async () => {
    const mock = buildPrismaMock();
    mock.slugFindUnique.mockResolvedValue({ restaurantId: 'restaurant-1', isCurrent: false });
    mock.slugFindFirst.mockResolvedValue({ slug: 'new-name' });

    const result = await buildService(mock).getPublicMenu(input('old-name'));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.entry.redirectToSlug).toBe('new-name');
  });

  it('redirects a legacy /q/{opaque generic code} link to the readable slug', async () => {
    const mock = buildPrismaMock();
    mock.slugFindFirst.mockResolvedValue({ slug: 'elmo-bistro' });
    const legacy = 'L'.repeat(43);

    const result = await buildService(mock).getPublicMenu(input(legacy));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.entry).toEqual({ publicCode: legacy, redirectToSlug: 'elmo-bistro' });
    // A 43-character code can never be a slug, so no slug lookup is made for it.
    expect(mock.slugFindUnique).not.toHaveBeenCalled();
  });

  it('keeps serving a legacy generic code without a redirect while the restaurant has no slug yet', async () => {
    const mock = buildPrismaMock();

    const result = await buildService(mock).getPublicMenu(input('short-legacy-code'));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.entry.redirectToSlug).toBeNull();
    expect(result.data.context.restaurant.shareCode).toBe('short-legacy-code');
  });

  it('never redirects a Table QR: its opaque URL stays, and its page shares the readable restaurant link', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(TABLE_QR_ROW);
    mock.slugFindFirst.mockResolvedValue({ slug: 'elmo-bistro' });
    const tableCode = 'T'.repeat(43);

    const result = await buildService(mock).getPublicMenu(input(tableCode));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.qrType).toBe('TABLE');
    expect(result.data.context.entry).toEqual({ publicCode: tableCode, redirectToSlug: null });
    expect(result.data.context.restaurant.shareCode).toBe('elmo-bistro');
  });

  it('a slug can never reach a Table QR: it resolves to the generic QR of its restaurant only', async () => {
    const mock = buildPrismaMock();
    mock.slugFindUnique.mockResolvedValue({ restaurantId: 'restaurant-1', isCurrent: true });
    mock.qrCodeFindFirst.mockResolvedValue({ publicCode: 'G'.repeat(43) });

    await buildService(mock).getPublicMenu(input('elmo-bistro'));

    const lookups = mock.qrCodeFindFirst.mock.calls.map((call) => call[0].where);
    expect(lookups[0]).toEqual({ restaurantId: 'restaurant-1', type: 'GENERIC' });
  });

  it('an unknown slug converges on qrNotFound', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(null);

    expect(await buildService(mock).getPublicMenu(input('no-such-place'))).toEqual({
      outcome: 'qrNotFound',
    });
  });

  it('a slug whose restaurant is suspended or whose generic QR is INACTIVE converges on qrNotFound', async () => {
    for (const row of [
      { ...GENERIC_QR_ROW, status: 'INACTIVE' },
      { ...GENERIC_QR_ROW, restaurant: { ...GENERIC_QR_ROW.restaurant, status: 'SUSPENDED' } },
    ]) {
      const mock = buildPrismaMock();
      mock.slugFindUnique.mockResolvedValue({ restaurantId: 'restaurant-1', isCurrent: true });
      mock.qrCodeFindUnique.mockResolvedValue(row);
      expect(await buildService(mock).getPublicMenu(input('elmo-bistro'))).toEqual({
        outcome: 'qrNotFound',
      });
    }
  });

  it('does not share the readable link when the generic QR is not active', async () => {
    const mock = buildPrismaMock();
    mock.qrCodeFindUnique.mockResolvedValue(TABLE_QR_ROW);
    mock.slugFindFirst.mockResolvedValue({ slug: 'elmo-bistro' });
    mock.qrCodeFindFirst.mockResolvedValue(null);

    const result = await buildService(mock).getPublicMenu(input('T'.repeat(43)));

    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;
    expect(result.data.context.restaurant.shareCode).toBeNull();
  });
});
