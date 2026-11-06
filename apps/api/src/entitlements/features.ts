/**
 * Feature entitlements (DEC-043): what the PLATFORM allows a Restaurant to use. This is separate
 * from the Restaurant's own switches (pickup, delivery, table ordering, WhatsApp ordering, the
 * suggestions mode, the chosen menu template): a feature takes effect only when the platform
 * allows it AND the Restaurant has it switched on.
 *
 * Until the platform control dashboard exists nothing writes an override, so every Restaurant
 * has every feature and nothing behaves differently. When packages arrive they only decide the
 * overrides (or change `DEFAULT_ENTITLEMENT`); no feature code has to change.
 */
export const FEATURE_KEYS = [
  /** Orders sent to the Restaurant's WhatsApp instead of the dashboard. */
  'WHATSAPP_ORDERING',
  /** The Guest "track my order" status screens. */
  'ORDER_TRACKING',
  /** "Complete your meal" in the Guest cart. */
  'SMART_SUGGESTIONS',
  /** Menu templates other than the classic one. */
  'MENU_TEMPLATES',
  /** Pickup and Delivery orders that arrive in the dashboard (orders, kitchen). */
  'DASHBOARD_ORDERING',
  /** Dine-in orders from a Table QR (orders, kitchen, table sessions). */
  'TABLE_ORDERING',
  /** The kitchen screen: accepted orders as tickets to prepare (DEC-054). Orders still need one of the two above. */
  'KITCHEN',
  /** AI menu import from photos, a PDF or an Excel file (DEC-057). OFF unless the platform turns it on. */
  'MENU_IMPORT',
  /** Offers / Bundles: fixed-price packages with choices in the Guest menu and the dashboard (DEC-069). */
  'OFFERS',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureMap = Record<FeatureKey, boolean>;

/** What a Restaurant gets for a feature it has no override for. The ONE place this default lives. */
export const DEFAULT_ENTITLEMENT = true;

/**
 * Features that are OFF until the platform turns them on, because each use spends a metered resource
 * (DEC-057: model requests). A Package includes one only if it lists it, and a Restaurant with no Package
 * does not have it. They are a platform tool, so customers never see them in packages, My subscription,
 * upgrade options or contracts (`CUSTOMER_FEATURE_KEYS`).
 */
export const OPT_IN_FEATURES: readonly FeatureKey[] = ['MENU_IMPORT'];

/** The features customers see: every feature except the opt-in ones. */
export const CUSTOMER_FEATURE_KEYS: readonly FeatureKey[] = FEATURE_KEYS.filter(
  (key) => !OPT_IN_FEATURES.includes(key),
);

/** Where a feature's effective value comes from (the order of precedence, strongest first). */
export type FeatureSource = 'override' | 'package' | 'default';

/**
 * The features a Restaurant has (DEC-043, DEC-046), strongest rule first: its own override, then its
 * package (a package INCLUDES the features it lists; the rest are not included), then the default.
 * `packageFeatures` is null/undefined for a Restaurant without a package. Unknown keys are ignored.
 */
export function resolveFeatures(
  overrides: ReadonlyArray<{ feature: string; enabled: boolean }>,
  packageFeatures?: ReadonlyArray<string> | null,
): FeatureMap {
  const map = Object.fromEntries(
    FEATURE_KEYS.map((key) => [
      key,
      packageFeatures
        ? packageFeatures.includes(key)
        : DEFAULT_ENTITLEMENT && !OPT_IN_FEATURES.includes(key),
    ]),
  ) as FeatureMap;
  for (const override of overrides) {
    if ((FEATURE_KEYS as readonly string[]).includes(override.feature)) {
      map[override.feature as FeatureKey] = override.enabled;
    }
  }
  return map;
}

/** Every feature on, opt-in ones included: what a test or a caller without a Restaurant context assumes. */
export const ALL_FEATURES: FeatureMap = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, true]),
) as FeatureMap;

/** Thrown when a Staff action needs a feature the platform has not allowed this Restaurant. */
export class FeatureNotAvailableError extends Error {
  constructor(readonly feature: FeatureKey) {
    super(`FEATURE_NOT_AVAILABLE:${feature}`);
    this.name = 'FeatureNotAvailableError';
  }
}
