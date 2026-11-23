"use client";

import type { ReactNode } from "react";
import type { OnboardingCase } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { menuCounts } from "@/lib/onboarding-menu";

const DEMO_DURATIONS = [1, 4, 24, 72, 168] as const;
const DEMO_KINDS = ["restaurant", "cafe", "sweets"] as const;

/**
 * The saved choices of a case, read back before submitting (from the server view, not unsaved edits). A DEMO shows
 * only what creates the demo; REAL / TRIAL show the customer, package and menu summary.
 */
export function ReviewSummary({ data }: { data: OnboardingCase }) {
  const { t, fmt, locale } = useI18n();
  const config = data.modeConfig;
  const packageName = data.package ? (locale === "ar" ? data.package.name : data.package.nameEn) : null;
  const rows: { label: MessageKey; value: ReactNode }[] = [
    { label: "onboarding.summary.mode", value: data.mode ? t(`onboarding.mode.${data.mode}`) : "—" },
  ];

  if (data.mode === "DEMO") {
    const kind = DEMO_KINDS.find((value) => value === config.demoKind);
    const hours = config.demoHours;
    rows.push(
      { label: "onboarding.demo.label", value: data.details.restaurant.name ? <bdi>{data.details.restaurant.name}</bdi> : "—" },
      { label: "demos.kind", value: kind ? t(`demos.kind.${kind}`) : "—" },
      {
        label: "demos.duration",
        value: hours === null ? "—" : (DEMO_DURATIONS as readonly number[]).includes(hours)
          ? t(`demos.duration.${hours as (typeof DEMO_DURATIONS)[number]}`)
          : t("onboarding.s2.hours", { hours: fmt.number(hours) }),
      },
      { label: "onboarding.s2.package", value: packageName ? <bdi>{packageName}</bdi> : t("onboarding.s2.noPackage") },
    );
  } else {
    const { restaurant, owner } = data.details;
    rows.push(
      { label: "onboarding.col.restaurant", value: restaurant.name ? <bdi>{restaurant.name}</bdi> : "—" },
      { label: "onboarding.summary.owner", value: owner.email ? <bdi dir="ltr">{owner.email}</bdi> : "—" },
      { label: "onboarding.s2.package", value: packageName ? <bdi>{packageName}</bdi> : "—" },
    );
    if (data.mode === "TRIAL") {
      rows.push({
        label: "onboarding.s2.trialDays",
        value: config.trialDays === null ? "—" : fmt.number(config.trialDays),
      });
    }
    if (data.menuDraft) {
      const counts = menuCounts(data.menuDraft);
      rows.push({
        label: "onboarding.step.menu",
        value: t("onboarding.summary.menuCounts", { categories: fmt.number(counts.categories), products: fmt.number(counts.products) }),
      });
    }
  }
  if (data.lead) {
    rows.push({ label: "onboarding.summary.lead", value: <bdi>{data.lead.name}</bdi> });
  }

  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-2/60 p-4 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{t(row.label)}</dt>
          <dd className="min-w-0 break-words font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
