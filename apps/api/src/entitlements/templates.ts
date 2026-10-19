/**
 * Which Guest menu templates a Restaurant may use (DEC-051). Classic is always allowed. The rest depend
 * on the Package: one that includes the Menu designs feature (`MENU_TEMPLATES`, DEC-043) allows either every
 * template (also ones added later) or a chosen list. Pure, so the rules are easy to test.
 */
export const MENU_TEMPLATE_KEYS = [
  'CLASSIC',
  'LIST',
  'GALLERY',
  'MENU',
  'FLOATING',
  'CENTERED',
  'COMPACT',
] as const;

export type MenuTemplateKey = (typeof MENU_TEMPLATE_KEYS)[number];

/** What a Package says about templates. */
export interface PackageTemplateRule {
  /** The Package includes the Menu designs feature. */
  includesFeature: boolean;
  /** Every template, including ones added later. */
  all: boolean;
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
    (key) => key === 'CLASSIC' || rule.selected.includes(key),
  );
}

/** How many templates a Package gives (Classic counts). Used to compare plans. */
export function templateCountOf(rule: PackageTemplateRule): number {
  return allowedTemplates({ featureEnabled: rule.includesFeature, rule })
    .length;
}
