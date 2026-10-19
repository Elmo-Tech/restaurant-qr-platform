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
}

export interface UpgradeCandidate<P extends PackageForOptions> {
  pkg: P;
  /** Features this package would give that the Restaurant does not have now, in the documented order. */
  adds: FeatureKey[];
}

export function upgradeCandidates<P extends PackageForOptions>(input: {
  currentPackageId: string | null;
  /** The features the Restaurant effectively has today (package, overrides and defaults applied). */
  effective: Readonly<Record<FeatureKey, boolean>>;
  packages: readonly P[];
}): UpgradeCandidate<P>[] {
  return input.packages
    .filter(
      (pkg) => pkg.status === 'ACTIVE' && pkg.id !== input.currentPackageId,
    )
    .map((pkg) => ({
      pkg,
      adds: FEATURE_KEYS.filter(
        (key) => pkg.features.includes(key) && !input.effective[key],
      ),
    }))
    .filter((candidate) => candidate.adds.length > 0)
    .sort(
      (a, b) =>
        a.adds.length - b.adds.length || a.pkg.name.localeCompare(b.pkg.name),
    );
}
