/**
 * Onboarding step 2 — package choice (Product Owner decision 2026-11-22, explicit package confirmation).
 *
 * The global trial default package is only a RECOMMENDATION: it is marked in the list and offered through
 * a "Use recommended package" action, but it never counts as the operator's selection until the operator
 * picks it (the server never fills `modeConfig.packageId` from it either). Pure functions, no I/O, so the
 * contract tests in `tests/contract` can run them.
 */

export type PackageChoiceMode = "REAL" | "TRIAL" | "DEMO";

/**
 * The package to recommend: the trial default, for TRIAL only, and only while it is one of the ACTIVE
 * packages the console can offer (an archived default is never recommended).
 */
export function recommendedPackageId(
  mode: PackageChoiceMode | null,
  defaultPackageId: string | null,
  activePackages: readonly { id: string }[] | null,
): string | null {
  if (mode !== "TRIAL" || defaultPackageId === null || activePackages === null) return null;
  return activePackages.some((pkg) => pkg.id === defaultPackageId) ? defaultPackageId : null;
}

/** Offer "Use recommended package" while a recommendation exists and nothing was chosen yet. */
export function offerRecommendation(selectedPackageId: string | null, recommendedId: string | null): boolean {
  return recommendedId !== null && selectedPackageId === null;
}

/** The recommended package first, the rest in their original order. */
export function recommendedFirst<T extends { id: string }>(packages: readonly T[], recommendedId: string | null): T[] {
  if (recommendedId === null) return [...packages];
  return [...packages.filter((pkg) => pkg.id === recommendedId), ...packages.filter((pkg) => pkg.id !== recommendedId)];
}

/** The mode-config fields of step 2 (the same shape as `ModeConfig` in `lib/api/onboarding.ts`). */
export interface ModeConfigFields {
  packageId: string | null;
  trialDays: number | null;
  demoKind: string | null;
  demoHours: number | null;
}

/**
 * Pending (unsaved) mode-config edits after the operator switches mode: a package picked for the previous
 * mode is dropped, so the server clears the selection (a mode change never keeps a package unless the same
 * PATCH supplies it on purpose).
 */
export function pendingConfigAfterModeChange(pending: Partial<ModeConfigFields>): Partial<ModeConfigFields> {
  const next = { ...pending };
  delete next.packageId;
  return next;
}

/** What the form shows right after a mode switch, before the save answers: no package selected. */
export function formConfigAfterModeChange(config: ModeConfigFields): ModeConfigFields {
  return { ...config, packageId: null };
}
