/**
 * Which Guest menu templates a Restaurant may use (DEC-051, DEC-052). Classic is always allowed. The rest
 * depend on the Package: one that includes the Menu designs feature (`MENU_TEMPLATES`, DEC-043) allows every
 * template (also ones added later), every STANDARD template (no premium one), or a chosen list. Pure, so the
 * rules are easy to test.
 */
export const MENU_TEMPLATE_KEYS = [
  'CLASSIC',
  'LIST',
  'GALLERY',
  'MENU',
  'FLOATING',
  'CENTERED',
  'COMPACT',
  'EDITORIAL',
  'EMBER',
] as const;

export type MenuTemplateKey = (typeof MENU_TEMPLATE_KEYS)[number];

export type TemplateTier = 'STANDARD' | 'PREMIUM';

/** The tier of each template (DEC-052). The visually richest designs are premium. */
export const TEMPLATE_TIERS: Record<MenuTemplateKey, TemplateTier> = {
  CLASSIC: 'STANDARD',
  LIST: 'STANDARD',
  COMPACT: 'STANDARD',
  CENTERED: 'STANDARD',
  EDITORIAL: 'STANDARD',
  GALLERY: 'PREMIUM',
  MENU: 'PREMIUM',
  FLOATING: 'PREMIUM',
  EMBER: 'PREMIUM',
};

export const STANDARD_TEMPLATE_KEYS = MENU_TEMPLATE_KEYS.filter(
  (key) => TEMPLATE_TIERS[key] === 'STANDARD',
);
export const PREMIUM_TEMPLATE_KEYS = MENU_TEMPLATE_KEYS.filter(
  (key) => TEMPLATE_TIERS[key] === 'PREMIUM',
);

/** What a Package says about templates. */
export interface PackageTemplateRule {
  /** The Package includes the Menu designs feature. */
  includesFeature: boolean;
  /** Every template, including ones added later. */
  all: boolean;
  /** Every standard template, including ones added later, and no premium one unless it is chosen. */
  allStandard?: boolean;
  /** The chosen templates (Classic is implied and never listed). */
  selected: readonly string[];
}

export function allowedTemplates(input: {
  /** Whether the Restaurant effectively has the Menu designs feature (package, exceptions and defaults applied). */
  featureEnabled: boolean;
  /** The Restaurant's Package rule, or null for a Restaurant without a Package. */
  rule: PackageTemplateRule | null;
}): MenuTemplateKey[] {
  if (!input.featureEnabled) return ['CLASSIC'];
  const { rule } = input;
  // no Package: every feature; a Package that lacks the feature but was given it by an exception: every template
  if (!rule || rule.all || !rule.includesFeature)
    return [...MENU_TEMPLATE_KEYS];
  return MENU_TEMPLATE_KEYS.filter(
    (key) =>
      key === 'CLASSIC' ||
      (rule.allStandard === true && TEMPLATE_TIERS[key] === 'STANDARD') ||
      rule.selected.includes(key),
  );
}

/** How many templates of each tier a list holds (Classic counts as standard). */
export function tierCounts(keys: readonly MenuTemplateKey[]): {
  standard: number;
  premium: number;
} {
  const premium = keys.filter(
    (key) => TEMPLATE_TIERS[key] === 'PREMIUM',
  ).length;
  return { standard: keys.length - premium, premium };
}

/** How many templates a Package gives (Classic counts). Used to compare plans. */
export function templateCountOf(rule: PackageTemplateRule): number {
  return allowedTemplates({ featureEnabled: rule.includesFeature, rule })
    .length;
}

/** The standard / premium split of what a Package gives. */
export function templateTierCountsOf(rule: PackageTemplateRule): {
  standard: number;
  premium: number;
} {
  return tierCounts(
    allowedTemplates({ featureEnabled: rule.includesFeature, rule }),
  );
}
