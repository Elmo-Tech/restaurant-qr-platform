"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Input, Label } from "@/components/ui";
import { billingErrorMessage } from "@/lib/api/billing-errors";
import { updateTrial, type Subscription } from "@/lib/api/billing";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { PhaseBadge, ToArrow, useDay } from "./parts";

export function TrialCard({
  subscription,
  highlight,
  onChanged,
  onSynced,
  onNotice,
}: {
  subscription: Subscription;
  highlight: boolean;
  onChanged: (next: Subscription) => void;
  onSynced: () => void;
  onNotice: () => void;
}) {
  const { t, fmt } = useI18n();
  const day = useDay();
  const [editing, setEditing] = useState(false);
  const [endsAt, setEndsAt] = useState(subscription.endsAt);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !endsAt || endsAt === subscription.endsAt) return;
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await updateTrial(subscription.id, endsAt));
      setEditing(false);
      onNotice();
      onSynced();
    } catch (caught) {
      setProblem(billingErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn(highlight && "ring-1 ring-success/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground"><bdi>{subscription.packageName}</bdi></h3>
            <Badge tone="success">{t("sub.kind.TRIAL")}</Badge>
            <PhaseBadge phase={subscription.phase} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {day(subscription.startsAt)} <ToArrow /> {day(subscription.endsAt)}
            {subscription.phase === "ACTIVE" ? <> · {t("sub.daysLeft")}: <span className="tabular font-medium text-foreground">{fmt.number(subscription.daysLeft)}</span></> : null}
          </p>
        </div>
        {subscription.status === "ACTIVE" && !editing ? (
          <Button size="sm" onClick={() => { setEndsAt(subscription.endsAt); setEditing(true); }}>{t("trial.editEnd")}</Button>
        ) : null}
      </div>
      <div className="space-y-4 p-5">
        <p className="text-[13px] text-muted-foreground">{t("trial.cardHint")}</p>
        {editing ? (
          <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-3 rounded-lg border border-border bg-surface-2/60 p-4" noValidate>
            <div>
              <Label htmlFor={`trial-end-${subscription.id}`}>{t("trial.endDate")}</Label>
              <Input id={`trial-end-${subscription.id}`} type="date" dir="ltr" min={subscription.startsAt} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="text-start" />
              <p className="mt-1 text-xs text-muted-foreground">{t("trial.endHint")}</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={busy || !endsAt || endsAt === subscription.endsAt}>{busy ? t("common.saving") : t("common.save")}</Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => { setEditing(false); setProblem(null); }}>{t("common.cancel")}</Button>
            </div>
          </form>
        ) : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {subscription.notes ? <p className="text-[13px] text-muted-foreground"><span className="font-medium text-foreground">{t("sub.notes")}:</span> {subscription.notes}</p> : null}
        <p className="text-xs text-muted-foreground">{t("sub.recordedBy")} <bdi dir="ltr">{subscription.createdByEmail}</bdi> · {fmt.dateTime(subscription.createdAt)}</p>
      </div>
    </Card>
  );
}
