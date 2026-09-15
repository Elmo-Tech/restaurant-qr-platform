import { PublicMenuController } from './public-menu.controller';
import type { PublicMenuData } from './public-menu.service';

const SAMPLE_DATA: PublicMenuData = {
  context: {
    qrType: 'GENERIC',
    restaurant: { name: 'Elmo Bistro', currencyCode: 'EGP' },
    branch: null,
    table: null,
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
});
