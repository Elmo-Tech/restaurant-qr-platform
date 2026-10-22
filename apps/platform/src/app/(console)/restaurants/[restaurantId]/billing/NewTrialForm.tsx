"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Select } from "@/components/ui";
import { billingErrorMessage } from "@/lib/api/billing-errors";
import { createTrial, type Subscription } from "@/lib/api/billing";
import type { PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { ToArrow, useDay } from "./parts";

const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

function addDays(value: string, days: number): string | null {
  if (!value || !Number.isInteger(days) || days < 1) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NewTrialForm({
  restaurantId,
  packages,
  defaultDays,
  defaultPackageId,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  packages: PackageSummary[];
  defaultDays: number;
  defaultPackageId: string | null;
  onCreated: (subscription: Subscription) => void;
  onCancel: () => void;
}) {
  const { t, fmt } = useI18n();
  const day = useDay();
  const initialPackage = packages.some((pkg) => pkg.id === defaultPackageId) ? defaultPackageId ?? "" : "";
  const [packageId, setPackageId] = useState(initialPackage);
  const [startsAt, setStartsAt] = useState(todayLocal());
  const [duration, setDuration] = useState(String(defaultDays));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const durationDays = Number(duration);
  const endsAt = useMemo(() => addDays(startsAt, durationDays), [startsAt, durationDays]);
  const selected = packages.find((pkg) => pkg.id === packageId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !packageId || !endsAt || durationDays < 1 || durationDays > 365) return;
    setBusy(true);
    setProblem(null);
    try {
      onCreated(
        await createTrial(restaurantId, {
          packageId,
          startsAt,
          durationDays,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      );
    } catch (caught) {
      setProblem(billingErrorMessage(caught, t));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("trialForm.title")} description={t("trialForm.hint")} />
      <form onSubmit={(event) => void submit(event)} className="grid gap-6 p-5 lg:grid-cols-2" noValidate>
        <div className="space-y-4">
          <div>
            <Label htmlFor="trial-package">{t("trialForm.package")}</Label>
            <Select id="trial-package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
              <option value="">{t("subForm.pickPackage")}</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="trial-start">{t("trialForm.start")}</Label>
              <Input id="trial-start" type="date" dir="ltr" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="text-start" />
            </div>
            <div>
              <Label htmlFor="trial-duration">{t("trialForm.duration")}</Label>
              <Input id="trial-duration" type="number" min={1} max={365} dir="ltr" value={duration} onChange={(event) => setDuration(event.target.value)} className="text-start" />
              <p className="mt-1 text-xs text-muted-foreground">{t("trialForm.durationHint")}</p>
            </div>
          </div>
          <div>
            <Label htmlFor="trial-notes">{t("subForm.notes")}</Label>
            <textarea id="trial-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25" />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{t("sub.kind.TRIAL")}</Badge>
            <span className="text-sm font-semibold text-foreground">{selected?.name ?? t("trialForm.pickPackage")}</span>
          </div>
          {endsAt ? (
            <p className="text-[13px] text-muted-foreground">
              {day(startsAt)} <ToArrow /> {day(endsAt)} · {t("trialForm.days", { count: fmt.number(durationDays) })}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("trialForm.noBilling")}</p>
          {selected ? (
            <div>
              <p className="mb-2 text-[13px] font-semibold text-foreground">{t("trialForm.features")}</p>
              {selected.features.length ? (
                <ul className="grid gap-1.5 text-[13px] text-muted-foreground sm:grid-cols-2">
                  {selected.features.map((feature) => <li key={feature}>✓ {t(`feature.${feature}`)}</li>)}
                </ul>
              ) : <p className="text-[13px] text-muted-foreground">{t("trialForm.noFeatures")}</p>}
            </div>
          ) : null}
        </div>

        {problem ? <Alert tone="danger" className="lg:col-span-2">{problem}</Alert> : null}
        <div className="flex gap-3 lg:col-span-2">
          <Button type="submit" variant="primary" disabled={busy || !packageId || !endsAt || durationDays < 1 || durationDays > 365}>
            {busy ? t("trialForm.creating") : t("trialForm.create")}
          </Button>
          <Button type="button" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </form>
    </Card>
  );
}
