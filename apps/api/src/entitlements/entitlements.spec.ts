import { effectiveOrdering } from './effective-ordering';
import {
  ALL_FEATURES,
  FEATURE_KEYS,
  resolveFeatures,
  type FeatureMap,
} from './features';

const SWITCHES = {
  pickupEnabled: true,
  deliveryEnabled: true,
  tableOrderingEnabled: true,
  whatsappOrderingEnabled: false,
  whatsappNumber: '+201012345678',
};

const without = (...keys: (typeof FEATURE_KEYS)[number][]): FeatureMap => ({
  ...ALL_FEATURES,
  ...Object.fromEntries(keys.map((key) => [key, false])),
});

describe('feature entitlements', () => {
  it('gives every feature when there is no override', () => {
    expect(resolveFeatures([])).toEqual(ALL_FEATURES);
    expect(Object.values(ALL_FEATURES).every(Boolean)).toBe(true);
    expect(Object.keys(ALL_FEATURES)).toEqual([...FEATURE_KEYS]);
  });

  it('applies overrides both ways and ignores unknown keys', () => {
    const features = resolveFeatures([
      { feature: 'WHATSAPP_ORDERING', enabled: false },
      { feature: 'MENU_TEMPLATES', enabled: true },
      { feature: 'SOMETHING_NEW', enabled: false },
    ]);
    expect(features.WHATSAPP_ORDERING).toBe(false);
    expect(features.MENU_TEMPLATES).toBe(true);
    expect(features.ORDER_TRACKING).toBe(true);
    expect(Object.keys(features)).toHaveLength(FEATURE_KEYS.length);
  });
});

describe('effective ordering (switch AND entitlement)', () => {
  it('changes nothing for a Restaurant that has every feature', () => {
    expect(effectiveOrdering(SWITCHES, ALL_FEATURES)).toEqual({
      whatsapp: false,
      dashboardOrders: true,
      pickup: true,
      delivery: true,
      table: true,
    });
    expect(
      effectiveOrdering(
        { ...SWITCHES, whatsappOrderingEnabled: true },
        ALL_FEATURES,
      ).whatsapp,
    ).toBe(true);
  });

  it('WhatsApp needs the feature, the switch and a number', () => {
    const on = { ...SWITCHES, whatsappOrderingEnabled: true };
    expect(effectiveOrdering(on, without('WHATSAPP_ORDERING')).whatsapp).toBe(
      false,
    );
    expect(
      effectiveOrdering({ ...on, whatsappNumber: null }, ALL_FEATURES).whatsapp,
    ).toBe(false);
  });

  it('without dashboard ordering, pickup and delivery are offered only through WhatsApp', () => {
    const noDashboard = without('DASHBOARD_ORDERING');
    expect(effectiveOrdering(SWITCHES, noDashboard)).toMatchObject({
      pickup: false,
      delivery: false,
      table: true,
    });
    const viaWhatsapp = effectiveOrdering(
      { ...SWITCHES, whatsappOrderingEnabled: true },
      noDashboard,
    );
    expect(viaWhatsapp).toMatchObject({
      whatsapp: true,
      pickup: true,
      delivery: true,
    });
    // the Restaurant's own switch still decides which kinds
    expect(
      effectiveOrdering(
        { ...SWITCHES, whatsappOrderingEnabled: true, pickupEnabled: false },
        noDashboard,
      ),
    ).toMatchObject({ pickup: false, delivery: true });
  });

  it('table ordering needs the feature and the switch', () => {
    expect(effectiveOrdering(SWITCHES, without('TABLE_ORDERING')).table).toBe(
      false,
    );
    expect(
      effectiveOrdering(
        { ...SWITCHES, tableOrderingEnabled: false },
        ALL_FEATURES,
      ).table,
    ).toBe(false);
  });
});
