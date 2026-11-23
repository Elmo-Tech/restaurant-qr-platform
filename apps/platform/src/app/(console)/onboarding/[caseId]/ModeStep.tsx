"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import type { ModeConfig, ModeProblem, OnboardingCase, OnboardingMode } from "@/lib/api/onboarding";
import { listPackages, type PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { offerRecommendation, recommendedFirst, recommendedPackageId } from "@/lib/onboarding-package-choice";
import { cn } from "@/lib/utils";
import { describedBy, Field, TextField } from "./fields";

const MODES: { mode: OnboardingMode; title: MessageKey; body: MessageKey }[] = [
  { mode: "REAL", title: "onboarding.mode.REAL", body: "onboarding.s2.realBody" },
  { mode: "TRIAL", title: "onboarding.mode.TRIAL", body: "onboarding.s2.trialBody" },
  { mode: "DEMO", title: "onboarding.mode.DEMO", body: "onboarding.s2.demoBody" },
];
/** The same choices as the demos page. */
const DEMO_DURATIONS = [1, 4, 24, 72, 168] as const;

/**
 * Step 1 records how this customer starts; provisioning is a separate action. For a DEMO this is the whole short
 * path: an internal label, the kind, the duration and an optional package (no customer, branch or menu details).
 */
export function ModeStep({
  data,
  mode,
  config,
  demoLabel,
  demoLabelError,
  packageCleared,
  disabled,
  problems,
  onMode,
  onConfig,
  onDemoLabel,
  onDemoLabelBlur,
}: {
  data: OnboardingCase;
  mode: OnboardingMode | null;
  config: ModeConfig;
  /** The internal demo label (stored as the case's restaurant name, which is what the demo service receives). */
  demoLabel: string | null;
  demoLabelError: string | null;
  /** The last mode switch dropped the package picked for the previous mode. */
  packageCleared: boolean;
  disabled: boolean;
  /** Server problems to show now (already filtered: touched or after Continue). */
  problems: ModeProblem[];
  onMode: (mode: OnboardingMode) => void;
  onConfig: <K extends keyof ModeConfig>(key: K, value: ModeConfig[K]) => void;
  onDemoLabel: (value: string) => void;
  onDemoLabelBlur: () => void;
}) {
  const { t, locale } = useI18n();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [packagesFailed, setPackagesFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPackages()
      .then((loaded) => {
        if (!cancelled) setPackages(loaded.filter((pkg) => pkg.status === "ACTIVE"));
      })
      .catch(() => {
        if (!cancelled) setPackagesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = (pkg: { name: string; nameEn: string }) => (locale === "ar" ? pkg.name : pkg.nameEn);
  // The trial default package is a recommendation only (PO decision 2026-11-22): the operator still picks it.
  const recommendedId = recommendedPackageId(mode, data.trialSettings.defaultPackageId, packages);
  const recommended = recommendedId ? (packages ?? []).find((pkg) => pkg.id === recommendedId) ?? null : null;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recommendedFirst(
      (packages ?? []).filter(
        (pkg) => !needle || pkg.nameAr.toLowerCase().includes(needle) || pkg.nameEn.toLowerCase().includes(needle),
      ),
      recommendedId,
    );
  }, [packages, query, recommendedId]);
  const problem = (code: ModeProblem) => (problems.includes(code) ? t(`onboarding.problem.${code}`) : null);
  const packageError = problem("PACKAGE_REQUIRED") ?? problem("PACKAGE_NOT_AVAILABLE");
  const packageOptional = mode === "DEMO";

  const packageCard = mode ? (
        <Card>
          <CardHeader
            title={t("onboarding.s2.package")}
            description={t(packageOptional ? "onboarding.s2.packageOptional" : "onboarding.s2.packageRequired")}
          />
          <div className="space-y-3 p-5">
            {packageCleared && config.packageId === null ? (
              <Alert tone="info">{t("onboarding.s2.packageCleared")}</Alert>
            ) : null}
            {data.package && config.packageId === data.package.id && data.package.status !== "ACTIVE" ? (
              <Alert tone="warning">{t("onboarding.problem.PACKAGE_NOT_AVAILABLE")}</Alert>
            ) : null}
            {recommended && offerRecommendation(config.packageId, recommendedId) ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary-soft px-4 py-3">
                <p className="min-w-0 text-sm text-foreground">
                  {t("onboarding.s2.recommendedPrompt")} <bdi className="font-semibold">{nameOf(recommended)}</bdi>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{t("onboarding.s2.recommendedHint")}</span>
                </p>
                <Button size="sm" variant="primary" onClick={() => onConfig("packageId", recommended.id)}>
                  {t("onboarding.s2.useRecommended")}
                </Button>
              </div>
            ) : null}
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("onboarding.s2.packageSearch")}
              aria-label={t("onboarding.s2.packageSearch")}
              maxLength={80}
            />
            {packagesFailed ? <Alert tone="danger">{t("common.error")}</Alert> : null}
            <div
              role="radiogroup"
              aria-label={t("onboarding.s2.package")}
              aria-describedby={packageError ? "ob-package-error" : undefined}
              className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border"
            >
              {packageOptional ? (
                <PackageOption
                  label={t("onboarding.s2.noPackage")}
                  selected={config.packageId === null}
                  onSelect={() => onConfig("packageId", null)}
                />
              ) : null}
              {packages === null && !packagesFailed ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : null}
              {shown.map((pkg) => (
                <PackageOption
                  key={pkg.id}
                  label={nameOf(pkg)}
                  badge={pkg.id === recommendedId ? t("onboarding.s2.recommended") : null}
                  selected={config.packageId === pkg.id}
                  onSelect={() => onConfig("packageId", pkg.id)}
                />
              ))}
              {packages !== null && shown.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">{t("onboarding.s2.noPackages")}</p>
              ) : null}
            </div>
            {packageError ? (
              <p id="ob-package-error" className="text-xs font-medium text-danger">
                {packageError}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null;

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <Alert tone="info">{t("onboarding.s2.nothingCreated")}</Alert>

      <Card>
        <CardHeader title={t("onboarding.s2.chooseMode")} description={t("onboarding.s2.demoVsTrial")} />
        <div role="radiogroup" aria-label={t("onboarding.s2.chooseMode")} className="grid gap-3 p-5 md:grid-cols-3">
          {MODES.map((option) => {
            const selected = mode === option.mode;
            return (
              <label
                key={option.mode}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring/40",
                  selected ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <input
                    type="radio"
                    name="onboarding-mode"
                    value={option.mode}
                    checked={selected}
                    onChange={() => onMode(option.mode)}
                    className="size-4 accent-primary"
                  />
                  {t(option.title)}
                </span>
                <span className="text-[13px] text-muted-foreground">{t(option.body)}</span>
              </label>
            );
          })}
        </div>
        {problem("MODE_REQUIRED") ? <p className="px-5 pb-5 text-xs font-medium text-danger">{problem("MODE_REQUIRED")}</p> : null}
      </Card>

      {mode !== "DEMO" ? packageCard : null}

      {mode === "TRIAL" ? (
        <Card>
          <CardHeader title={t("onboarding.s2.trialSection")} description={t("onboarding.s2.trialHint")} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {!data.trialSettings.enabled || problems.includes("TRIAL_DISABLED") ? (
              <Alert tone="warning" className="sm:col-span-2">
                {t("onboarding.problem.TRIAL_DISABLED")}
              </Alert>
            ) : null}
            <Field
              id="ob-trial-days"
              label={t("onboarding.s2.trialDays")}
              hint={t("onboarding.s2.trialDaysHint", { days: data.trialSettings.defaultDays })}
              error={problem("TRIAL_DAYS_INVALID")}
            >
              <Input
                id="ob-trial-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                dir="ltr"
                className="text-start"
                value={config.trialDays ?? ""}
                onChange={(event) => onConfig("trialDays", event.target.value === "" ? null : Math.trunc(Number(event.target.value)))}
                {...describedBy("ob-trial-days", true, problem("TRIAL_DAYS_INVALID"))}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {mode === "DEMO" ? (
        <Card>
          <CardHeader title={t("onboarding.s2.demoSection")} description={t("onboarding.s2.demoHint")} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              id="ob-demo-label"
              className="sm:col-span-2"
              label={t("onboarding.demo.label")}
              hint={t("onboarding.demo.labelHint")}
              error={demoLabelError}
              value={demoLabel}
              onValue={onDemoLabel}
              onBlur={onDemoLabelBlur}
              maxLength={80}
              autoComplete="off"
            />
            <Field id="ob-demo-kind" label={t("demos.kind")} hint={t("demos.kindHint")} error={problem("DEMO_KIND_INVALID")}>
              <Select
                id="ob-demo-kind"
                value={config.demoKind ?? ""}
                onChange={(event) => onConfig("demoKind", event.target.value || null)}
                {...describedBy("ob-demo-kind", true, problem("DEMO_KIND_INVALID"))}
              >
                <option value="">{t("onboarding.s2.chooseKind")}</option>
                <option value="restaurant">{t("demos.kind.restaurant")}</option>
                <option value="cafe">{t("demos.kind.cafe")}</option>
                <option value="sweets">{t("demos.kind.sweets")}</option>
              </Select>
            </Field>
            <Field id="ob-demo-hours" label={t("demos.duration")} error={problem("DEMO_HOURS_INVALID")}>
              <Select
                id="ob-demo-hours"
                value={config.demoHours === null ? "" : String(config.demoHours)}
                onChange={(event) => onConfig("demoHours", event.target.value === "" ? null : Number(event.target.value))}
                {...describedBy("ob-demo-hours", false, problem("DEMO_HOURS_INVALID"))}
              >
                <option value="">{t("onboarding.s2.chooseDuration")}</option>
                {DEMO_DURATIONS.map((hours) => (
                  <option key={hours} value={hours}>
                    {t(`demos.duration.${hours}`)}
                  </option>
                ))}
                {config.demoHours !== null && !(DEMO_DURATIONS as readonly number[]).includes(config.demoHours) ? (
                  <option value={config.demoHours}>{t("onboarding.s2.hours", { hours: config.demoHours })}</option>
                ) : null}
              </Select>
            </Field>
            {data.lead ? (
              <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-muted-foreground sm:col-span-2">
                {t("onboarding.demo.linkedLead")} <bdi className="font-medium text-foreground">{data.lead.name}</bdi>
                {" · "}
                <bdi dir="ltr">{data.lead.email}</bdi>
                <span className="mt-0.5 block">{t("onboarding.demo.linkedLeadHint")}</span>
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {mode === "DEMO" ? packageCard : null}
    </fieldset>
  );
}

function PackageOption({
  label,
  badge = null,
  selected,
  onSelect,
}: {
  label: string;
  /** e.g. "Recommended": a marker only, never a selection. */
  badge?: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm",
        selected ? "bg-primary-soft" : "hover:bg-surface-2",
      )}
    >
      <input type="radio" name="onboarding-package" checked={selected} onChange={onSelect} className="size-4 accent-primary" />
      <bdi className="min-w-0 break-words">{label}</bdi>
      {badge ? <Badge tone="primary">{badge}</Badge> : null}
    </label>
  );
}
