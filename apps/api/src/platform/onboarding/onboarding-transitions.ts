/** A1/A2 draft lifecycle and the A3 REAL/TRIAL provisioning saga. Delivery is deferred to A4. */
export const ONBOARDING_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PROVISIONING',
  'MENU_SETUP',
  'READY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
export type OnboardingStatusKey = (typeof ONBOARDING_STATUSES)[number];

/** Reachable now. */
export const IMPLEMENTED_TRANSITIONS: Readonly<
  Record<OnboardingStatusKey, readonly OnboardingStatusKey[]>
> = {
  DRAFT: ['READY_FOR_REVIEW', 'CANCELLED'],
  // Any edit of a case under review sends it back to DRAFT.
  READY_FOR_REVIEW: ['DRAFT', 'CANCELLED', 'PROVISIONING'],
  PROVISIONING: ['MENU_SETUP', 'FAILED'],
  MENU_SETUP: ['READY', 'FAILED'],
  READY: [],
  DELIVERED: [],
  FAILED: ['PROVISIONING', 'MENU_SETUP', 'CANCELLED'],
  CANCELLED: [],
};

/** Terminal for the "one open case per lead" rule. FAILED is recoverable, so it stays open. */
export const TERMINAL_STATUSES: readonly OnboardingStatusKey[] = [
  'CANCELLED',
  'DELIVERED',
];

/** Statuses whose details / mode may still be edited. */
export const EDITABLE_STATUSES: readonly OnboardingStatusKey[] = [
  'DRAFT',
  'READY_FOR_REVIEW',
];

export function canTransition(
  from: OnboardingStatusKey,
  to: OnboardingStatusKey,
): boolean {
  return IMPLEMENTED_TRANSITIONS[from].includes(to);
}

export const isEditable = (status: OnboardingStatusKey): boolean =>
  EDITABLE_STATUSES.includes(status);

/** The status a case has after a successful edit: a case under review goes back to DRAFT. */
export function statusAfterEdit(
  status: OnboardingStatusKey,
): OnboardingStatusKey {
  return status === 'READY_FOR_REVIEW' ? 'DRAFT' : status;
}

export type SubmitDecision =
  | { ok: true }
  | { ok: false; refusal: 'INVALID_TRANSITION' }
  | { ok: false; refusal: 'INCOMPLETE' };

/** Submitting for review needs a DRAFT with steps 1 and 2 complete (recomputed by the server). */
export function decideSubmit(
  status: OnboardingStatusKey,
  completedSteps: readonly string[],
): SubmitDecision {
  if (!canTransition(status, 'READY_FOR_REVIEW')) {
    return { ok: false, refusal: 'INVALID_TRANSITION' };
  }
  if (
    !completedSteps.includes('customer') ||
    !completedSteps.includes('mode')
  ) {
    return { ok: false, refusal: 'INCOMPLETE' };
  }
  return { ok: true };
}
