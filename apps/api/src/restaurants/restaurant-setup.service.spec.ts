import { deriveSetupStatuses } from './restaurant-setup.service';
import { ALL_FEATURES } from '../entitlements/features';

function snapshot() {
  return {
    restaurant: {
      logoAssetPath: null, coverAssetPath: null, contactPhone: null,
      whatsappNumber: null, hotlineNumber: null, facebookUrl: null,
      instagramUrl: null, websiteUrl: null,
      defaultLocale: 'ar',
      pickupEnabled: true, deliveryEnabled: true, tableOrderingEnabled: true,
      whatsappOrderingEnabled: false,
    },
    activeLocales: ['en', 'ar'],
    features: { ...ALL_FEATURES },
    activeMenuCount: 0, liveProductCount: 0,
    activeBranchCount: 1, activeZoneCount: 0, activeTableCount: 0,
  };
}
function setup() {
  return {
    languagesSignature: null,
    orderingSignature: null,
    operationsSignature: null,
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
    expect(values.PREVIEW).toBe('NEEDS_REVIEW');
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
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe('NOT_APPLICABLE');
  });

  it('requires active menu, visible product, active branches and zones only when relevant', () => {
    const sample = snapshot();
    sample.activeMenuCount = 1;
    sample.liveProductCount = 1;
    sample.restaurant.tableOrderingEnabled = false;
    sample.activeZoneCount = 1;
    expect(deriveSetupStatuses(sample, setup()).MENU).toBe('DONE');
    expect(deriveSetupStatuses(sample, setup()).PRODUCTS).toBe('DONE');
    expect(deriveSetupStatuses(sample, setup()).OPERATIONS).toBe('NEEDS_REVIEW');
    expect(deriveSetupStatuses(sample, setup()).PREVIEW).toBe('NEEDS_REVIEW');
  });

  it('branding skip is explicitly different from a fully configured logo/cover', () => {
    const settings = setup();
    settings.brandingSkippedAt = new Date();
    expect(deriveSetupStatuses(snapshot(), settings).BRANDING).toBe('INTENTIONALLY_SKIPPED');
    const sample = snapshot();
    sample.restaurant.logoAssetPath = 'a.svg';
    sample.restaurant.coverAssetPath = 'b.png';
    expect(deriveSetupStatuses(sample, settings).BRANDING).toBe('DONE');
  });
});
