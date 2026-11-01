import {
  deriveSetupStatuses,
  RestaurantSetupService,
} from './restaurant-setup.service';
import { ALL_FEATURES } from '../entitlements/features';

function snapshot(): Parameters<typeof deriveSetupStatuses>[0] {
  return {
    restaurant: {
      logoAssetPath: null,
      coverAssetPath: null,
      contactPhone: null,
      whatsappNumber: null,
      hotlineNumber: null,
      facebookUrl: null,
      instagramUrl: null,
      websiteUrl: null,
      defaultLocale: 'ar',
      pickupEnabled: true,
      deliveryEnabled: true,
      tableOrderingEnabled: true,
      whatsappOrderingEnabled: false,
    },
    activeLocales: ['en', 'ar'],
    features: { ...ALL_FEATURES },
    activeMenuCount: 0,
    liveProductCount: 0,
    activeBranchCount: 1,
    activeZoneCount: 0,
    activeTableCount: 0,
  };
}
function setup(): Parameters<typeof deriveSetupStatuses>[1] {
  return {
    languagesSignature: null,
    orderingSignature: null,
    previewConfirmedAt: null,
    brandingSkippedAt: null,
  };
}

describe('restaurant setup: live truth, not default settings', () => {
  it('does not accept default-true order switches or active default language as reviewed', () => {
    const values = deriveSetupStatuses(snapshot(), setup());
    expect(values.ORDERING).toBe('NEEDS_REVIEW');
    expect(values.LANGUAGES).toBe('NEEDS_REVIEW');
    expect(values.MENU).toBe('NEEDS_ACTION');
    expect(values.PRODUCTS).toBe('NEEDS_ACTION');
    expect(values.PREVIEW).toBe('NEEDS_ACTION');
    expect(values.OPERATIONS).toBe('NEEDS_ACTION');
  });

  it('requires the number used by WhatsApp when the channel is enabled', () => {
    const sample = snapshot();
    sample.restaurant.whatsappOrderingEnabled = true;
    sample.restaurant.contactPhone = '+201011111111';
    expect(deriveSetupStatuses(sample, setup()).CONTACT).toBe('NEEDS_ACTION');
    sample.restaurant.whatsappNumber = '+201022222222';
    expect(deriveSetupStatuses(sample, setup()).CONTACT).toBe('DONE');
  });

  it('does not demand tables/zones when those features are not entitled', () => {
    const sample = snapshot();
    sample.restaurant.pickupEnabled = false;
    sample.restaurant.deliveryEnabled = false;
    sample.restaurant.tableOrderingEnabled = true;
    sample.features.TABLE_ORDERING = false;
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('requires active menu, visible product, active branches and zones only when relevant', () => {
    const sample = snapshot();
    sample.activeMenuCount = 1;
    sample.liveProductCount = 1;
    sample.restaurant.tableOrderingEnabled = false;
    sample.activeZoneCount = 1;
    expect(deriveSetupStatuses(sample, setup()).MENU).toBe('DONE');
    expect(deriveSetupStatuses(sample, setup()).PRODUCTS).toBe('DONE');
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe('DONE');
    expect(deriveSetupStatuses(sample, setup()).PREVIEW).toBe('NEEDS_REVIEW');
  });

  it('completes operations with an active branch and required delivery zone even when there are no tables', () => {
    const sample = snapshot();
    sample.activeZoneCount = 1;
    sample.activeTableCount = 0;
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe('DONE');
  });

  it('does not require a delivery zone or tables when delivery is disabled', () => {
    const sample = snapshot();
    sample.restaurant.deliveryEnabled = false;
    sample.activeZoneCount = 0;
    sample.activeTableCount = 0;
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe('DONE');
  });

  it('keeps operations pending when the active branch or required delivery zone is missing', () => {
    const noBranch = snapshot();
    noBranch.activeBranchCount = 0;
    noBranch.activeZoneCount = 1;
    expect(deriveSetupStatuses(noBranch, setup()).OPERATIONS).toBe(
      'NEEDS_ACTION',
    );

    const noZone = snapshot();
    noZone.activeZoneCount = 0;
    expect(deriveSetupStatuses(noZone, setup()).OPERATIONS).toBe(
      'NEEDS_ACTION',
    );
  });

  it('requires a visible product before preview confirmation and preserves a valid confirmation', () => {
    const sample = snapshot();
    const settings = setup();
    expect(deriveSetupStatuses(sample, settings).PREVIEW).toBe('NEEDS_ACTION');

    sample.liveProductCount = 1;
    expect(deriveSetupStatuses(sample, settings).PREVIEW).toBe('NEEDS_REVIEW');

    settings.previewConfirmedAt = new Date('2026-11-01T00:00:00.000Z');
    expect(deriveSetupStatuses(sample, settings).PREVIEW).toBe('DONE');
    expect(deriveSetupStatuses(sample, settings).PREVIEW).toBe('DONE');

    sample.liveProductCount = 0;
    expect(deriveSetupStatuses(sample, settings).PREVIEW).toBe('NEEDS_ACTION');
  });

  it('branding skip is explicitly different from a fully configured logo/cover', () => {
    const settings = setup();
    settings.brandingSkippedAt = new Date();
    expect(deriveSetupStatuses(snapshot(), settings).BRANDING).toBe(
      'INTENTIONALLY_SKIPPED',
    );
    const sample = snapshot();
    sample.restaurant.logoAssetPath = 'a.svg';
    sample.restaurant.coverAssetPath = 'b.png';
    expect(deriveSetupStatuses(sample, settings).BRANDING).toBe('DONE');
  });
});

describe('restaurant setup: preview confirmation', () => {
  it('persists an explicit preview timestamp only after a visible product exists', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      restaurantSetup: {
        findUnique: jest.fn().mockResolvedValue({
          completedAt: null,
          languagesSignature: null,
          orderingSignature: null,
          previewConfirmedAt: null,
          brandingSkippedAt: null,
        }),
        update,
      },
      restaurant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...snapshot().restaurant,
          locales: [{ locale: 'ar' }],
          features: [],
          package: null,
        }),
      },
      menu: { count: jest.fn().mockResolvedValue(1) },
      product: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValue(1),
      },
      branch: { count: jest.fn().mockResolvedValue(1) },
      deliveryZone: { count: jest.fn().mockResolvedValue(1) },
      table: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new RestaurantSetupService(prisma as never);

    await expect(
      service.review('restaurant-1', 'PREVIEW'),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'SETUP_MENU_EMPTY' },
      },
    });
    expect(update).not.toHaveBeenCalled();

    await service.review('restaurant-1', 'PREVIEW');

    expect(update).toHaveBeenCalledWith({
      where: { restaurantId: 'restaurant-1' },
      data: { previewConfirmedAt: expect.any(Date) as Date },
    });
  });
});
