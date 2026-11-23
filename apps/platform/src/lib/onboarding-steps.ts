/**
 * Onboarding wizard step path (Product Owner request 2026-11-23, "choose mode first"). Pure functions, no I/O, so
 * the contract tests in `tests/contract` can run them; mirrors `stepsForMode` / `stepsRequiredForReview` in
 * `apps/api/src/platform/onboarding/onboarding-details.ts`, which stays authoritative for completion.
 *
 * - The operator first chooses REAL / TRIAL / DEMO.
 * - REAL / TRIAL (and a case with no mode yet): mode → customer → menu → review → handoff.
 * - DEMO: mode (label, kind, duration, optional package) → review → handoff. No customer or menu step.
 */
export const ONBOARDING_STEPS = ["mode", "customer", "menu", "review", "handoff"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type StepMode = "REAL" | "TRIAL" | "DEMO";

export function stepsForMode(mode: StepMode | null): OnboardingStep[] {
  return mode === "DEMO" ? ["mode", "review", "handoff"] : [...ONBOARDING_STEPS];
}

/** The steps the server requires before submit-for-review (and before the first provisioning call). */
export function stepsRequiredForReview(mode: StepMode | null): OnboardingStep[] {
  return mode === "DEMO" ? ["mode"] : ["mode", "customer"];
}

export function hasRequiredSteps(mode: StepMode | null, completedSteps: readonly string[]): boolean {
  return mode !== null && stepsRequiredForReview(mode).every((step) => completedSteps.includes(step));
}

export function nextStep(mode: StepMode | null, current: OnboardingStep): OnboardingStep | null {
  const path = stepsForMode(mode);
  const index = path.indexOf(current);
  return index < 0 ? path[0] : (path[index + 1] ?? null);
}

export function previousStep(mode: StepMode | null, current: OnboardingStep): OnboardingStep | null {
  const path = stepsForMode(mode);
  const index = path.indexOf(current);
  return index <= 0 ? null : path[index - 1];
}

/** A step that is not on the current path (e.g. "menu" after switching to DEMO) falls back to the mode step. */
export function visibleStep(mode: StepMode | null, step: OnboardingStep): OnboardingStep {
  return stepsForMode(mode).includes(step) ? step : "mode";
}

/** Progress counts only the steps of the case's own path (a stored "customer" never counts for a DEMO). */
export function stepProgress(mode: StepMode | null, completedSteps: readonly string[]): { done: number; total: number } {
  const path = stepsForMode(mode);
  return { done: path.filter((step) => completedSteps.includes(step)).length, total: path.length };
}

export interface FirstOpenState {
  status: string;
  mode: StepMode | null;
  completedSteps: readonly string[];
  /** `isHandoffStepOpen(case)` from `onboarding-handoff.ts`. */
  handoffOpen: boolean;
}

/** Where a resumed case opens: the first incomplete step of its path. */
export function firstOpenStep(state: FirstOpenState): OnboardingStep {
  if (state.handoffOpen) return "handoff";
  if (state.status !== "DRAFT") return "review";
  for (const step of stepsForMode(state.mode)) {
    if (step === "review" || step === "handoff") break;
    if (step === "mode" && state.mode === null) return "mode";
    if (!state.completedSteps.includes(step)) return step;
  }
  return "review";
}

export function canSubmitForReview(state: { status: string; mode: StepMode | null; completedSteps: readonly string[] }): boolean {
  return state.status === "DRAFT" && hasRequiredSteps(state.mode, state.completedSteps);
}
