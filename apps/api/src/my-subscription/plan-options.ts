import { FEATURE_KEYS, type FeatureKey } from '../entitlements/features';

/**
 * Which packages are worth offering a Restaurant as an upgrade (DEC-050): every ACTIVE package other than
 * the one it is on that includes at least one feature the Restaurant does not effectively have. Each
 * option says what it would ADD. Pure, so the rule is easy to test.
 */
export interface PackageForOptions {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  features: readonly FeatureKey[];
  /** How many Guest menu templates the package gives (Classic counts, DEC-051). */
  templateCount: number;
}

export interface UpgradeCandidate<P extends PackageForOptions> {
  pkg: P;
  /** Features this package would give that the Restaurant does not have now, in the documented order. */
  adds: FeatureKey[];
  /** The package gives more templates than the Restaurant has now. */
  moreTemplates: boolean;
}

export function upgradeCandidates<P extends PackageForOptions>(input: {
  currentPackageId: string | null;
  /** The features the Restaurant effectively has today (package, overrides and defaults applied). */
  effective: Readonly<Record<FeatureKey, boolean>>;
  /** How many templates the Restaurant may use now. */
  currentTemplateCount: number;
  packages: readonly P[];
}): UpgradeCandidate<P>[] {
  return (
    input.packages
      .filter(
        (pkg) => pkg.status === 'ACTIVE' && pkg.id !== input.currentPackageId,
      )
      .map((pkg) => ({
        pkg,
        adds: FEATURE_KEYS.filter(
          (key) => pkg.features.includes(key) && !input.effective[key],
        ),
        moreTemplates: pkg.templateCount > input.currentTemplateCount,
      }))
      // a package is worth offering when it adds a feature or more templates
      .filter(
        (candidate) => candidate.adds.length > 0 || candidate.moreTemplates,
      )
      .sort(
        (a, b) =>
          a.adds.length - b.adds.length || a.pkg.name.localeCompare(b.pkg.name),
      )
  );
}
