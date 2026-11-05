import { PublicMenuController } from './public-menu.controller';
import { EMPTY_CONTACT } from '../restaurants/restaurant-contact';
import type { PublicMenuData } from './public-menu.service';

const SAMPLE_DATA: PublicMenuData = {
  context: {
    entry: { publicCode: 'code', redirectToSlug: null },
    platform: { poweredByUrl: 'https://menu.elmotechsoft.online/' },
    qrType: 'GENERIC',
    tableOrdering: null,
    restaurant: {
      name: 'Elmo Bistro',
      currencyCode: 'EGP',
      countryCode: 'EG',
      logoAssetPath: null,
      coverAssetPath: null,
      menuTemplate: 'CLASSIC',
      contact: EMPTY_CONTACT,
      shareCode: null,
      hours: null,
    },
    branch: null,
    table: null,
    announcements: [],
    suggestions: false,
    tracking: true,
    templatesAllowed: true,
    allowedTemplates: [],
    ordering: null,
    pickupBranches: [],
    deliveryBranches: [],
    locations: [],
  },
  locale: { requested: null, resolved: 'en', default: 'en', available: ['en', 'ar'] },
  menu: { id: 'menu-1', name: 'Main Menu', description: null, categories: [] },
};

describe('PublicMenuController', () => {
  let publicMenuService: { getPublicMenu: jest.Mock };
  let controller: PublicMenuController;

  beforeEach(() => {
    publicMenuService = { getPublicMenu: jest.fn() };
    controller = new PublicMenuController(publicMenuService as never);
  });

  it('returns the resolved data on success', async () => {
    publicMenuService.getPublicMenu.mockResolvedValue({
      outcome: 'found',
      data: SAMPLE_DATA,
    });

    const body = await controller.getPublicMenu('code-1', 'ar', 'ar-EG');

    expect(publicMenuService.getPublicMenu).toHaveBeenCalledWith({
      publicCode: 'code-1',
      explicitLang: 'ar',
      acceptLanguageHeader: 'ar-EG',
    });
    expect(body).toEqual({ data: SAMPLE_DATA });
  });

  it('passes null for an omitted ?lang and Accept-Language', async () => {
    publicMenuService.getPublicMenu.mockResolvedValue({
      outcome: 'found',
      data: SAMPLE_DATA,
    });

    await controller.getPublicMenu('code-1', undefined, undefined);

    expect(publicMenuService.getPublicMenu).toHaveBeenCalledWith({
      publicCode: 'code-1',
      explicitLang: null,
      acceptLanguageHeader: null,
    });
  });

  it('maps qrNotFound to a 404 QR_NOT_FOUND envelope', async () => {
    publicMenuService.getPublicMenu.mockResolvedValue({ outcome: 'qrNotFound' });

    await expect(
      controller.getPublicMenu('unknown', undefined, undefined),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'QR_NOT_FOUND', message: 'This QR code is not available.' },
      },
    });
  });

  it('maps menuNotAvailable to a 404 MENU_NOT_AVAILABLE envelope', async () => {
    publicMenuService.getPublicMenu.mockResolvedValue({ outcome: 'menuNotAvailable' });

    await expect(
      controller.getPublicMenu('code-1', undefined, undefined),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'MENU_NOT_AVAILABLE',
          message: 'This restaurant menu is temporarily unavailable.',
        },
      },
    });
  });

  it('adds the branding to the 404 only when the service provides it (exclusive design in use)', async () => {
    const branding = { restaurantName: 'Shop', logoAssetPath: null, exclusiveRendererKey: 'MAKKBOZ_HERITAGE_V1', locale: 'ar' };
    publicMenuService.getPublicMenu.mockResolvedValue({ outcome: 'menuNotAvailable', branding });

    await expect(
      controller.getPublicMenu('code-1', undefined, undefined),
    ).rejects.toMatchObject({
      response: { error: { code: 'MENU_NOT_AVAILABLE', branding } },
    });
  });
});
