import { Badge } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import type { OnboardingStatus } from "@/lib/api/onboarding";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Translate } from "@/lib/i18n/translate";

const STATUS_TONE: Record<OnboardingStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  READY_FOR_REVIEW: "primary",
  PROVISIONING: "warning",
  MENU_SETUP: "warning",
  READY: "success",
  DELIVERED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function OnboardingStatusBadge({ status, t }: { status: OnboardingStatus; t: Translate }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {t(`onboarding.status.${status}`)}
    </Badge>
  );
}

/** A transport / session failure as a message key (kept as a key so a language switch re-translates it). */
export function transportErrorKey(caught: unknown): MessageKey {
  if (isNetworkFailure(caught)) return "common.unreachable";
  if (caught instanceof ApiError && caught.status === 401) return "common.sessionExpired";
  return "common.error";
}
