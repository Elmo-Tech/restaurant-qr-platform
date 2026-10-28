"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label, PageHeader, Select, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import {
  getPublicSettings,
  adjustActiveTrials,
  getTrialSettings,
  listPackages,
  updatePublicSettings,
  updateTrialSettings,
  type PackageSummary,
  type PlatformPublicSettings,
  type PlatformTrialSettings,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { AiSettingsSection } from "./AiSettingsSection";

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function SettingsView() {
  const { t, fmt } = useI18n();
  const [settings, setSettings] = useState<PlatformPublicSettings | null>(null);
  const [trialSettings, setTrialSettings] = useState<PlatformTrialSettings | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [trialDays, setTrialDays] = useState("15");
  const [trialPackageId, setTrialPackageId] = useState("");
  const [bulkDays, setBulkDays] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPublicSettings(), getTrialSettings(), listPackages()])
      .then(([loaded, trial, loadedPackages]) => {
        if (cancelled) return;
        setSettings(loaded);
        setUrl(loaded.poweredByUrl);
        setTrialSettings(trial);
        setTrialEnabled(trial.enabled);
        setTrialDays(String(trial.defaultDays));
        setTrialPackageId(trial.defaultPackage?.id ?? "");
        setPackages(loadedPackages.filter((pkg) => pkg.status === "ACTIVE"));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFeedback({
          tone: "danger",
          text: isNetworkFailure(caught)
            ? t("common.unreachable")
            : caught instanceof ApiError && caught.status === 401
              ? t("common.sessionExpired")
              : t("common.error"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = url.trim();
    if (next.length > 2048 || !validHttpsUrl(next)) {
      setUrlError(t("settings.poweredBy.invalid"));
      return;
    }
    setBusy(true);
    setFeedback(null);
    setUrlError(null);
    try {
      const saved = await updatePublicSettings(next);
      setSettings(saved);
      setUrl(saved.poweredByUrl);
      setFeedback({ tone: "success", text: t("settings.saved") });
    } catch (caught) {
      setFeedback({
        tone: "danger",
        text: isNetworkFailure(caught)
          ? t("common.unreachable")
          : caught instanceof ApiError && caught.status === 401
            ? t("common.sessionExpired")
            : t("common.error"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveTrial(event: FormEvent) {
    event.preventDefault();
    if (trialBusy) return;
    const days = Number(trialDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setFeedback({ tone: "danger", text: t("settings.trial.daysInvalid") });
      return;
    }
    setTrialBusy(true);
    setFeedback(null);
    try {
      const saved = await updateTrialSettings({
        enabled: trialEnabled,
        defaultDays: days,
        defaultPackageId: trialPackageId || null,
      });
      setTrialSettings(saved);
      setTrialEnabled(saved.enabled);
      setTrialDays(String(saved.defaultDays));
      setTrialPackageId(saved.defaultPackage?.id ?? "");
      setFeedback({ tone: "success", text: t("settings.trial.saved") });
    } catch (caught) {
      setFeedback({
        tone: "danger",
        text: isNetworkFailure(caught)
          ? t("common.unreachable")
          : caught instanceof ApiError && caught.status === 401
            ? t("common.sessionExpired")
            : t("common.error"),
      });
    } finally {
      setTrialBusy(false);
    }
  }

  async function adjustTrials(event: FormEvent) {
    event.preventDefault();
    if (bulkBusy) return;
    const days = Number(bulkDays);
    if (!Number.isInteger(days) || days === 0 || days < -365 || days > 365) {
      setFeedback({ tone: "danger", text: t("settings.trial.bulkInvalid") });
      return;
    }
    if (!window.confirm(t("settings.trial.bulkConfirm", { days }))) return;
    setBulkBusy(true);
    setFeedback(null);
    try {
      const result = await adjustActiveTrials(days);
      setBulkDays("");
      setFeedback({
        tone: "success",
        text: t("settings.trial.bulkDone", { adjusted: result.adjusted, skipped: result.skipped }),
      });
    } catch (caught) {
      setFeedback({
        tone: "danger",
        text: isNetworkFailure(caught) ? t("common.unreachable") : t("common.error"),
      });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      {feedback ? <Alert tone={feedback.tone} className="mb-4">{feedback.text}</Alert> : null}

      <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader title={t("settings.poweredBy.title")} description={t("settings.poweredBy.description")} />
        {settings ? (
          <form onSubmit={(event) => void save(event)} className="space-y-4 p-5" noValidate>
            <div>
              <Label htmlFor="powered-by-url">{t("settings.poweredBy.label")}</Label>
              <Input
                id="powered-by-url"
                type="url"
                dir="ltr"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError(null);
                  setFeedback(null);
                }}
                placeholder="https://menu.elmotechsoft.online/"
                maxLength={2048}
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? "powered-by-url-error" : "powered-by-url-hint"}
                className={cn(
                  "text-start",
                  urlError && "border-danger focus:border-danger focus:ring-danger/25",
                )}
              />
              {urlError ? (
                <p id="powered-by-url-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
                  {urlError}
                </p>
              ) : (
                <p id="powered-by-url-hint" className="mt-1.5 text-xs text-muted-foreground">
                  {t("settings.poweredBy.hint")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={busy || url.trim() === settings.poweredByUrl}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
              <a
                href={settings.poweredByUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary-text underline-offset-4 hover:underline"
              >
                {t("settings.poweredBy.open")}
              </a>
            </div>

            {settings.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                {t("settings.updatedAt", { date: fmt.date(settings.updatedAt) })}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="space-y-3 p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
        )}
      </Card>
      <Card>
        <CardHeader title={t("settings.trial.title")} description={t("settings.trial.description")} />
        {trialSettings ? (
          <form onSubmit={(event) => void saveTrial(event)} className="space-y-4 p-5" noValidate>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/60 p-4">
              <input type="checkbox" checked={trialEnabled} onChange={(event) => setTrialEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                <span className="block text-sm font-semibold text-foreground">{t("settings.trial.enabled")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t("settings.trial.enabledHint")}</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="trial-default-days">{t("settings.trial.days")}</Label>
                <Input id="trial-default-days" type="number" min={1} max={365} dir="ltr" value={trialDays} onChange={(event) => setTrialDays(event.target.value)} className="text-start" />
              </div>
              <div>
                <Label htmlFor="trial-default-package">{t("settings.trial.package")}</Label>
                <Select id="trial-default-package" value={trialPackageId} onChange={(event) => setTrialPackageId(event.target.value)}>
                  <option value="">{t("settings.trial.noPackage")}</option>
                  {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.trial.futureOnly")}</p>
            <Button type="submit" variant="primary" disabled={trialBusy}>
              {trialBusy ? t("common.saving") : t("common.save")}
            </Button>
          </form>
        ) : (
          <div className="space-y-3 p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
        )}
      </Card>
      <Card>
        <CardHeader title={t("settings.trial.bulkTitle")} description={t("settings.trial.bulkDescription")} />
        <form onSubmit={(event) => void adjustTrials(event)} className="flex flex-wrap items-end gap-3 p-5" noValidate>
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="trial-bulk-days">{t("settings.trial.bulkDays")}</Label>
            <Input id="trial-bulk-days" type="number" min={-365} max={365} dir="ltr" value={bulkDays} onChange={(event) => setBulkDays(event.target.value)} placeholder="+5 / -3" className="text-start" />
          </div>
          <Button type="submit" disabled={bulkBusy || bulkDays.trim() === ""}>{bulkBusy ? t("common.saving") : t("settings.trial.bulkApply")}</Button>
        </form>
      </Card>
      <section aria-labelledby="ai-settings-heading" className="space-y-4 pt-4">
        <div>
          <h2 id="ai-settings-heading" className="text-lg font-semibold tracking-tight text-foreground">{t("ai.section.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ai.section.description")}</p>
        </div>
        <AiSettingsSection />
      </section>
      </div>
    </>
  );
}
