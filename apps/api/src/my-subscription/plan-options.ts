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
  /** How many of them are premium (DEC-052); missing = 0. */
  templatePremium?: number;
}

export interface UpgradeCandidate<P extends PackageForOptions> {
  pkg: P;
  /** Features this package would give that the Restaurant does not have now, in the documented order. */
  adds: FeatureKey[];
  /** The package gives more templates than the Restaurant has now. */
  moreTemplates: boolean;
}

export interface CandidateInput<P extends PackageForOptions> {
  currentPackageId: string | null;
  effective: Readonly<Record<FeatureKey, boolean>>;
  currentTemplateCount: number;
  currentPremiumCount?: number;
  packages: readonly P[];
}

/** All ACTIVE packages other than the current one, including less expensive tiers. */
export function comparisonCandidates<P extends PackageForOptions>(
  input: CandidateInput<P>,
): UpgradeCandidate<P>[] {
  return input.packages
    .filter((pkg) => pkg.status === 'ACTIVE' && pkg.id !== input.currentPackageId)
    .map((pkg) => ({
      pkg,
      adds: FEATURE_KEYS.filter((key) =>
        pkg.features.includes(key) && !input.effective[key],
      ),
      moreTemplates:
        pkg.templateCount > input.currentTemplateCount ||
        (pkg.templatePremium ?? 0) > (input.currentPremiumCount ?? 0),
    }))
    .sort((a, b) =>
      a.adds.length - b.adds.length || a.pkg.name.localeCompare(b.pkg.name),
    );
}

/** Upgrade requests, unlike comparisons, must only offer an actual improvement. */
export function upgradeCandidates<P extends PackageForOptions>(
  input: CandidateInput<P>,
): UpgradeCandidate<P>[] {
  return comparisonCandidates(input).filter(
    (candidate) => candidate.adds.length > 0 || candidate.moreTemplates,
  );
}
