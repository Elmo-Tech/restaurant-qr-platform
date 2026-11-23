/**
 * Removing onboarding cases from the outer list (Product Owner request 2026-11-23). Pure functions, no I/O, so the
 * contract tests can run them. The server decides and enforces everything again under the case row lock; this
 * module only explains its decision (`OnboardingCaseSummary.removal`) and maps its errors to messages.
 *
 * Nothing is ever hard-deleted: an open case is cancelled with the existing cancellation rules and hidden from the
 * active list; an already-finished case is only hidden. Hidden cases stay in the "Removed" filter and can be
 * restored.
 */
import type { MessageKey } from "./i18n/messages";

export const REMOVAL_IMPACTS = [
  "LINKED_LEAD",
  "SUBMITTED",
  "MENU_DRAFT",
  "SETUP_FAILED",
  "RESTAURANT_KEPT",
  "DEMO_KEPT",
  "DEMO_PURGED",
  "DELIVERED",
] as const;
export type RemovalImpact = (typeof REMOVAL_IMPACTS)[number];
export type RemovalRefusal = "PROVISIONING_ACTIVE" | "HANDOFF_PENDING" | "ALREADY_ARCHIVED";

export type RemovalSummary =
  | { allowed: true; action: "CANCEL_AND_ARCHIVE" | "ARCHIVE"; impacts: RemovalImpact[]; confirmNotDelivered: boolean }
  | { allowed: false; refusal: RemovalRefusal };

/** A routine removal (an untouched draft, or a cancelled case with nothing attached) needs only a short confirmation. */
export function isRoutineRemoval(removal: RemovalSummary): boolean {
  return removal.allowed && removal.impacts.length === 0 && !removal.confirmNotDelivered;
}

export const IMPACT_MESSAGE: Record<RemovalImpact, MessageKey> = {
  LINKED_LEAD: "onboarding.remove.impact.LINKED_LEAD",
  SUBMITTED: "onboarding.remove.impact.SUBMITTED",
  MENU_DRAFT: "onboarding.remove.impact.MENU_DRAFT",
  SETUP_FAILED: "onboarding.remove.impact.SETUP_FAILED",
  RESTAURANT_KEPT: "onboarding.remove.impact.RESTAURANT_KEPT",
  DEMO_KEPT: "onboarding.remove.impact.DEMO_KEPT",
  DEMO_PURGED: "onboarding.remove.impact.DEMO_PURGED",
  DELIVERED: "onboarding.remove.impact.DELIVERED",
};

export const REFUSAL_MESSAGE: Record<RemovalRefusal, MessageKey> = {
  PROVISIONING_ACTIVE: "onboarding.remove.refused.PROVISIONING_ACTIVE",
  HANDOFF_PENDING: "onboarding.remove.refused.HANDOFF_PENDING",
  ALREADY_ARCHIVED: "onboarding.remove.refused.ALREADY_ARCHIVED",
};

/** What the dialog says and which confirmations it needs before the remove button is enabled. */
export function removalDialog(removal: Extract<RemovalSummary, { allowed: true }>): {
  title: MessageKey;
  intro: MessageKey;
  impacts: MessageKey[];
  needsAcknowledgement: boolean;
  needsNoHandoffConfirmation: boolean;
  confirm: MessageKey;
} {
  const routine = isRoutineRemoval(removal);
  return {
    title: routine ? "onboarding.remove.routineTitle" : "onboarding.remove.title",
    intro: routine
      ? "onboarding.remove.routineBody"
      : removal.action === "ARCHIVE"
        ? "onboarding.remove.archiveIntro"
        : "onboarding.remove.cancelIntro",
    impacts: removal.impacts.map((impact) => IMPACT_MESSAGE[impact]),
    needsAcknowledgement: !routine,
    needsNoHandoffConfirmation: removal.confirmNotDelivered,
    confirm: routine ? "onboarding.remove.confirmRoutine" : "onboarding.remove.confirm",
  };
}

/** The body the remove action sends: exactly the impacts the operator was shown and confirmed. */
export function removalRequest(
  revision: number,
  removal: Extract<RemovalSummary, { allowed: true }>,
  confirmedNoHandoff: boolean,
): { revision: number; acknowledgedImpacts: RemovalImpact[]; confirmNotDelivered?: true } {
  return {
    revision,
    acknowledgedImpacts: [...removal.impacts],
    ...(removal.confirmNotDelivered && confirmedNoHandoff ? { confirmNotDelivered: true as const } : {}),
  };
}

/** Error code (and refusal reason) of a failed removal → message. Unknown codes fall back to the caller's default. */
export function removalErrorKey(code: string | null, reason: unknown): MessageKey | null {
  switch (code) {
    case "ONBOARDING_REVISION_CONFLICT":
    case "ONBOARDING_REMOVE_CONFIRMATION_REQUIRED":
    case "ONBOARDING_INVALID_TRANSITION":
      return "onboarding.remove.error.changed";
    case "ONBOARDING_REMOVE_REFUSED":
      return typeof reason === "string" && reason in REFUSAL_MESSAGE
        ? REFUSAL_MESSAGE[reason as RemovalRefusal]
        : "onboarding.remove.error.changed";
    case "ONBOARDING_CASE_NOT_FOUND":
      return "onboarding.remove.error.gone";
    default:
      return null;
  }
}
