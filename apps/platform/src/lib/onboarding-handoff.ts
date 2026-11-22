import type { OnboardingCase, OnboardingHandoff } from "./api/onboarding";
import { createTranslate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

/** Use the backend string verbatim for display, copying, and encoding; do not synthesize URLs here. */
export function handoffUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /\s/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : value;
  } catch {
    return null;
  }
}

export function isHandoffStepOpen(data: Pick<OnboardingCase, "status">) {
  return data.status === "READY" || data.status === "DELIVERED";
}

export function restaurantHandoff(data: Pick<OnboardingCase, "status" | "mode" | "handoff">): OnboardingHandoff | null {
  if (!isHandoffStepOpen(data) || (data.mode !== "REAL" && data.mode !== "TRIAL")) return null;
  const guestMenuUrl = handoffUrl(data.handoff?.guestMenuUrl);
  const staffLoginUrl = handoffUrl(data.handoff?.staffLoginUrl);
  return guestMenuUrl && staffLoginUrl ? { guestMenuUrl, staffLoginUrl } : null;
}

export function demoAccessStatus(data: Pick<OnboardingCase, "demoState" | "demoExpiresAt">, now: number): "missing" | "removed" | "expired" | "active" {
  if (data.demoState === "PURGED") return "removed";
  if (data.demoState === "EXPIRED") return "expired";
  const expires = data.demoExpiresAt ? Date.parse(data.demoExpiresAt) : NaN;
  if (data.demoState !== "ACTIVE" || !Number.isFinite(expires)) return "missing";
  return expires <= now ? "expired" : "active";
}

type ShareDetails = OnboardingHandoff | { demoLink: string; expiresAt: string };

export function handoffMessage(locale: Locale, details: ShareDetails): string {
  const t = createTranslate(locale);
  if ("demoLink" in details) {
    // The recipient may be in a different time zone from the operator.
    const expires = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
    }).format(new Date(details.expiresAt));
    return t("onboarding.handoff.demoMessage", { link: details.demoLink, expires });
  }
  return t("onboarding.handoff.restaurantMessage", { guest: details.guestMenuUrl, staff: details.staffLoginUrl });
}
