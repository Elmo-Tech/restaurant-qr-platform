"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label, Select } from "@/components/ui";
import { billingErrorMessage } from "@/lib/api/billing-errors";
import {
  createSubscription,
  previewSubscription,
  type BillingPeriod,
  type DiscountType,
  type Subscription,
  type SubscriptionInput,
  type SubscriptionPreview,
} from "@/lib/api/billing";
import type { PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { PriceSummary, ToArrow, useDay } from "./parts";

/** What the form has typed, as the request (empty optional parts are left out). */
function toInput(state: {
  packageId: string;
  period: BillingPeriod;
  startsAt: string;
  discountType: DiscountType | "";
  discountValue: string;
  notes: string;
}): SubscriptionInput {
  const input: SubscriptionInput = { packageId: state.packageId, period: state.period };
  if (state.startsAt) input.startsAt = state.startsAt;
  if (state.discountType && state.discountValue.trim() !== "") {
    input.discount = { type: state.discountType, value: state.discountValue.trim() };
  }
  if (state.notes.trim() !== "") input.notes = state.notes.trim();
  return input;
}

export function NewSubscriptionForm({
  restaurantId,
  packages,
  graceDays,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  packages: PackageSummary[];
  graceDays: number;
  onCreated: (subscription: Subscription) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const day = useDay();
  const [packageId, setPackageId] = useState("");
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
  const [startsAt, setStartsAt] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<SubscriptionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewProblem, setPreviewProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const input = toInput({ packageId, period, startsAt, discountType, discountValue, notes });
  // the preview does not depend on the notes: do not call the Backend again for a typed note
  const previewKey = JSON.stringify({ ...input, notes: undefined });

  useEffect(() => {
    if (!packageId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      setPreviewProblem(null);
      previewSubscription(restaurantId, JSON.parse(previewKey) as SubscriptionInput)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewProblem(billingErrorMessage(caught, t));
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [restaurantId, packageId, previewKey, t]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !packageId || !preview) return;
    setBusy(true);
    setProblem(null);
    try {
      onCreated(await createSubscription(restaurantId, input));
    } catch (caught) {
      setProblem(billingErrorMessage(caught, t));
      setBusy(false);
    }
  }

  const shown = packageId ? preview : null;

  return (
    <Card>
      <CardHeader title={t("subForm.title")} description={t("subForm.hint")} />
      <form onSubmit={(event) => void submit(event)} className="grid gap-6 p-5 lg:grid-cols-2" noValidate>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sub-package">{t("subForm.package")}</Label>
            <Select id="sub-package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
              <option value="">{t("subForm.pickPackage")}</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sub-period">{t("subForm.period")}</Label>
              <Select id="sub-period" value={period} onChange={(event) => setPeriod(event.target.value as BillingPeriod)}>
                <option value="MONTHLY">{t("sub.period.MONTHLY")}</option>
                <option value="YEARLY">{t("sub.period.YEARLY")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="sub-start">{t("subForm.start")}</Label>
              <Input
                id="sub-start"
                type="date"
                dir="ltr"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="text-start"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("subForm.startHint")}</p>

          <div>
            <Label htmlFor="sub-discount-type">{t("subForm.discount")}</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                id="sub-discount-type"
                value={discountType}
                onChange={(event) => {
                  setDiscountType(event.target.value as DiscountType | "");
                  if (event.target.value === "") setDiscountValue("");
                }}
              >
                <option value="">{t("subForm.discount.none")}</option>
                <option value="PERCENT">{t("subForm.discount.PERCENT")}</option>
                <option value="AMOUNT">{t("subForm.discount.AMOUNT")}</option>
              </Select>
              {discountType ? (
                <Input
                  aria-label={t("subForm.discountValue")}
                  dir="ltr"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  placeholder={discountType === "PERCENT" ? "10" : "0.00"}
                  className="text-start"
                />
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("subForm.discountHint")}</p>
          </div>

          <div>
            <Label htmlFor="sub-notes">{t("subForm.notes")}</Label>
            <textarea
              id="sub-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2/60 p-4" aria-live="polite">
            <p className="mb-3 text-[13px] font-semibold text-foreground">{t("subForm.preview")}</p>
            {!packageId ? (
              <p className="text-[13px] text-muted-foreground">{t("subForm.pickToPreview")}</p>
            ) : previewProblem ? (
              <Alert tone="danger">{previewProblem}</Alert>
            ) : shown ? (
              <div className={previewing ? "space-y-3 opacity-60" : "space-y-3"}>
                <p className="text-[13px] text-muted-foreground">
                  <bdi>{shown.packageName}</bdi> · {t(`sub.period.${shown.period}`)} · {day(shown.startsAt)}
                  <ToArrow />
                  {day(shown.endsAt)}
                </p>
                <PriceSummary price={shown} />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("subForm.previewLoading")}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("billing.graceNote", { days: graceDays })}</p>
        </div>

        {problem ? <Alert tone="danger" className="lg:col-span-2">{problem}</Alert> : null}

        <div className="flex gap-3 lg:col-span-2">
          <Button type="submit" variant="primary" disabled={busy || !preview || previewing || previewProblem !== null || !packageId}>
            {busy ? t("subForm.creating") : t("subForm.create")}
          </Button>
          <Button type="button" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
