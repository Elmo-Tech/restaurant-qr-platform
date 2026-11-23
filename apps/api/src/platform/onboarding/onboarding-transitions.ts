/** Draft lifecycle, provisioning checkpoints and explicit handoff. */
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
  READY: ['DELIVERED'],
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

/**
 * Submitting for review needs a DRAFT whose required steps are complete (recomputed by the server): mode +
 * customer for REAL / TRIAL (and while no mode is chosen), only the mode step (with its demo label) for a DEMO.
 */
export function decideSubmit(
  status: OnboardingStatusKey,
  completedSteps: readonly string[],
  mode: 'REAL' | 'TRIAL' | 'DEMO' | null = null,
): SubmitDecision {
  if (!canTransition(status, 'READY_FOR_REVIEW')) {
    return { ok: false, refusal: 'INVALID_TRANSITION' };
  }
  const required = mode === 'DEMO' ? ['mode'] : ['mode', 'customer'];
  if (!required.every((step) => completedSteps.includes(step))) {
    return { ok: false, refusal: 'INCOMPLETE' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- removal from the active list

/**
 * What removing a case from the outer list would affect (PO request 2026-11-23). Each impact is explained to the
 * operator and must be acknowledged explicitly before the server accepts the removal.
 */
export const REMOVAL_IMPACTS = [
  'LINKED_LEAD',
  'SUBMITTED',
  'MENU_DRAFT',
  'SETUP_FAILED',
  'RESTAURANT_KEPT',
  'DEMO_KEPT',
  'DEMO_PURGED',
  'DELIVERED',
] as const;
export type RemovalImpact = (typeof REMOVAL_IMPACTS)[number];

export type RemovalRefusal =
  'PROVISIONING_ACTIVE' | 'HANDOFF_PENDING' | 'ALREADY_ARCHIVED';

/** The facts the decision reads; every one is a column of the case (no secrets, no customer details). */
export interface RemovalFacts {
  status: OnboardingStatusKey;
  mode: 'REAL' | 'TRIAL' | 'DEMO' | null;
  leadId: string | null;
  restaurantId: string | null;
  restaurantProvisionedAt: Date | string | null;
  demoId: string | null;
  demoHistory: unknown;
  demoRemovedAt: Date | string | null;
  deliveredAt: Date | string | null;
  hasMenuDraft: boolean;
  archivedAt: Date | string | null;
}

export type RemovalDecision =
  | {
      allowed: true;
      /**
       * CANCEL_AND_ARCHIVE reuses the existing cancellation (same guarded statuses, same READY purged-demo rule)
       * and hides the case; ARCHIVE only hides an already-terminal case. Nothing is ever hard-deleted: no case,
       * restaurant, account, subscription, demo, lead or audit row.
       */
      action: 'CANCEL_AND_ARCHIVE' | 'ARCHIVE';
      impacts: RemovalImpact[];
      /** The READY purged-demo cancellation also needs the operator's explicit "never handed off" assertion. */
      confirmNotDelivered: boolean;
    }
  | { allowed: false; refusal: RemovalRefusal };

/** True for the one READY case the existing cancel accepts: a DEMO whose purge committed and was never handed off. */
export function isPurgedUndeliveredDemo(facts: RemovalFacts): boolean {
  return (
    facts.status === 'READY' &&
    facts.mode === 'DEMO' &&
    facts.demoId === null &&
    facts.demoRemovedAt !== null &&
    facts.demoHistory !== null &&
    facts.demoHistory !== undefined &&
    facts.deliveredAt === null
  );
}

/** Pure decision, evaluated by the list (to explain) and again under the row lock by the remove action (to enforce). */
export function decideRemoval(facts: RemovalFacts): RemovalDecision {
  if (facts.archivedAt !== null)
    return { allowed: false, refusal: 'ALREADY_ARCHIVED' };
  const impacts: RemovalImpact[] = [];
  // Cancelling frees the lead for a new case; archiving an already-terminal case changes nothing for it.
  const cancelsLead = () => {
    if (facts.leadId !== null) impacts.push('LINKED_LEAD');
  };
  const hasRestaurant =
    facts.restaurantId !== null || facts.restaurantProvisionedAt !== null;

  switch (facts.status) {
    case 'PROVISIONING':
    case 'MENU_SETUP':
      return { allowed: false, refusal: 'PROVISIONING_ACTIVE' };
    case 'READY':
      if (!isPurgedUndeliveredDemo(facts))
        return { allowed: false, refusal: 'HANDOFF_PENDING' };
      cancelsLead();
      impacts.push('DEMO_PURGED');
      return {
        allowed: true,
        action: 'CANCEL_AND_ARCHIVE',
        impacts,
        confirmNotDelivered: true,
      };
    case 'DRAFT':
    case 'READY_FOR_REVIEW':
      cancelsLead();
      if (facts.status === 'READY_FOR_REVIEW') impacts.push('SUBMITTED');
      if (facts.hasMenuDraft) impacts.push('MENU_DRAFT');
      return {
        allowed: true,
        action: 'CANCEL_AND_ARCHIVE',
        impacts,
        confirmNotDelivered: false,
      };
    case 'FAILED':
      cancelsLead();
      impacts.push('SETUP_FAILED');
      if (hasRestaurant) impacts.push('RESTAURANT_KEPT');
      if (facts.demoId !== null) impacts.push('DEMO_KEPT');
      if (facts.hasMenuDraft) impacts.push('MENU_DRAFT');
      return {
        allowed: true,
        action: 'CANCEL_AND_ARCHIVE',
        impacts,
        confirmNotDelivered: false,
      };
    case 'DELIVERED':
      impacts.push('DELIVERED');
      if (hasRestaurant) impacts.push('RESTAURANT_KEPT');
      if (facts.demoId !== null) impacts.push('DEMO_KEPT');
      return {
        allowed: true,
        action: 'ARCHIVE',
        impacts,
        confirmNotDelivered: false,
      };
    case 'CANCELLED':
      if (hasRestaurant) impacts.push('RESTAURANT_KEPT');
      if (facts.demoId !== null) impacts.push('DEMO_KEPT');
      return {
        allowed: true,
        action: 'ARCHIVE',
        impacts,
        confirmNotDelivered: false,
      };
  }
}

/** Every current impact must be among those the operator saw and confirmed. */
export function impactsAcknowledged(
  impacts: readonly RemovalImpact[],
  acknowledged: readonly string[],
): boolean {
  return impacts.every((impact) => acknowledged.includes(impact));
}
