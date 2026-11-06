import { effectiveOrdering } from './effective-ordering';
import {
  ALL_FEATURES,
  CUSTOMER_FEATURE_KEYS,
  FEATURE_KEYS,
  OPT_IN_FEATURES,
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

/** What a Restaurant with no package and no override gets: everything except the opt-in features (DEC-057). */
const NO_PACKAGE_DEFAULTS: FeatureMap = { ...ALL_FEATURES, MENU_IMPORT: false };

const without = (...keys: (typeof FEATURE_KEYS)[number][]): FeatureMap => ({
  ...ALL_FEATURES,
  ...Object.fromEntries(keys.map((key) => [key, false])),
});

describe('feature entitlements', () => {
  it('gives every feature except the opt-in ones when there is no override', () => {
    expect(resolveFeatures([])).toEqual(NO_PACKAGE_DEFAULTS);
    expect(Object.values(ALL_FEATURES).every(Boolean)).toBe(true);
    expect(Object.keys(ALL_FEATURES)).toEqual([...FEATURE_KEYS]);
    expect(OPT_IN_FEATURES).toEqual(['MENU_IMPORT']);
  });

  it('Offers (DEC-069) is a customer feature: on without a package, only in a package that lists it, overridable per restaurant', () => {
    expect(FEATURE_KEYS).toContain('OFFERS');
    expect(OPT_IN_FEATURES).not.toContain('OFFERS');
    expect(CUSTOMER_FEATURE_KEYS).toContain('OFFERS');
    expect(resolveFeatures([]).OFFERS).toBe(true);
    // a package includes it only when it lists it (no backfill adds it to existing packages)
    expect(resolveFeatures([], ['KITCHEN']).OFFERS).toBe(false);
    expect(resolveFeatures([], ['OFFERS']).OFFERS).toBe(true);
    // a restaurant override wins in both directions and changes nothing else
    expect(resolveFeatures([{ feature: 'OFFERS', enabled: false }]).OFFERS).toBe(false);
    expect(resolveFeatures([{ feature: 'OFFERS', enabled: true }], []).OFFERS).toBe(true);
    expect(resolveFeatures([{ feature: 'OFFERS', enabled: false }])).toEqual({
      ...NO_PACKAGE_DEFAULTS,
      OFFERS: false,
    });
  });

  it('menu import is off by default and only an override or a package that lists it turns it on (DEC-057)', () => {
    expect(resolveFeatures([]).MENU_IMPORT).toBe(false);
    expect(resolveFeatures([], null).MENU_IMPORT).toBe(false);
    // a package that does not list it does not include it, even a package with every other feature
    expect(resolveFeatures([], CUSTOMER_FEATURE_KEYS).MENU_IMPORT).toBe(false);
    expect(resolveFeatures([], ['MENU_IMPORT']).MENU_IMPORT).toBe(true);
    // the platform switches it on for one Restaurant (no package, or a package without it) and off again
    expect(
      resolveFeatures([{ feature: 'MENU_IMPORT', enabled: true }]).MENU_IMPORT,
    ).toBe(true);
    expect(
      resolveFeatures([{ feature: 'MENU_IMPORT', enabled: true }], [])
        .MENU_IMPORT,
    ).toBe(true);
    expect(
      resolveFeatures(
        [{ feature: 'MENU_IMPORT', enabled: false }],
        ['MENU_IMPORT'],
      ).MENU_IMPORT,
    ).toBe(false);
    // switching it on changes no other feature
    expect({
      ...resolveFeatures([{ feature: 'MENU_IMPORT', enabled: true }]),
    }).toEqual(ALL_FEATURES);
  });

  it('customers never see the opt-in features', () => {
    expect(CUSTOMER_FEATURE_KEYS).not.toContain('MENU_IMPORT');
    expect(CUSTOMER_FEATURE_KEYS).toHaveLength(
      FEATURE_KEYS.length - OPT_IN_FEATURES.length,
    );
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

  it('a package includes only the features it lists; no package means every feature', () => {
    const inPackage = resolveFeatures(
      [],
      ['WHATSAPP_ORDERING', 'MENU_TEMPLATES'],
    );
    expect(inPackage.WHATSAPP_ORDERING).toBe(true);
    expect(inPackage.MENU_TEMPLATES).toBe(true);
    expect(inPackage.ORDER_TRACKING).toBe(false);
    expect(inPackage.TABLE_ORDERING).toBe(false);
    // an empty package gives nothing; no package gives everything
    expect(Object.values(resolveFeatures([], [])).some(Boolean)).toBe(false);
    expect(resolveFeatures([], null)).toEqual(NO_PACKAGE_DEFAULTS);
    expect(resolveFeatures([], undefined)).toEqual(NO_PACKAGE_DEFAULTS);
    // an unknown name in a package changes nothing
    expect(resolveFeatures([], ['SOMETHING_NEW'])).toEqual(
      resolveFeatures([], []),
    );
  });

  it("the Restaurant's own override wins over its package, both ways", () => {
    const features = resolveFeatures(
      [
        { feature: 'WHATSAPP_ORDERING', enabled: false },
        { feature: 'ORDER_TRACKING', enabled: true },
      ],
      ['WHATSAPP_ORDERING', 'MENU_TEMPLATES'],
    );
    expect(features.WHATSAPP_ORDERING).toBe(false); // in the package, removed for this Restaurant
    expect(features.ORDER_TRACKING).toBe(true); // not in the package, granted to this Restaurant
    expect(features.MENU_TEMPLATES).toBe(true);
    expect(features.SMART_SUGGESTIONS).toBe(false);
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
