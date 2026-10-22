"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { billingErrorMessage } from "@/lib/api/billing-errors";
import {
  cancelSubscription,
  PAYMENT_METHODS,
  recordPayment,
  voidPayment,
  type PaymentMethod,
  type Subscription,
} from "@/lib/api/billing";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Money, PaymentBadge, PhaseBadge, PriceSummary, ToArrow, useDay } from "./parts";

const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

type NoticeKey = "pay.recorded" | "pay.voidedNotice" | "sub.cancelled";

/**
 * One subscription: its dates and phase, the price that was fixed on it, the payment ledger (a payment
 * is voided, never deleted) and the contract. Every change goes through the Backend; `onChanged` hands
 * the updated subscription back, and `onSynced` asks the page to reload the restaurant (a change can
 * move its package or suspend / reactivate it).
 */
export function SubscriptionCard({
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
  onNotice: (key: NoticeKey) => void;
}) {
  const { t, fmt } = useI18n();
  const day = useDay();
  const sub = subscription;
  const cancelled = sub.status === "CANCELLED";

  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidAt, setPaidAt] = useState(todayLocal());
  const [reference, setReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(action: () => Promise<Subscription>, notice: NoticeKey, afterSuccess?: () => void) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await action());
      onNotice(notice);
      afterSuccess?.();
      onSynced();
    } catch (caught) {
      setProblem(billingErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  }

  function submitPayment(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        recordPayment(sub.id, {
          amount: amount.trim(),
          method,
          paidAt,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(payNotes.trim() ? { notes: payNotes.trim() } : {}),
        }),
      "pay.recorded",
      () => {
        setPaying(false);
        setAmount("");
        setReference("");
        setPayNotes("");
      },
    );
  }

  function submitVoid(event: FormEvent) {
    event.preventDefault();
    if (!voidingId) return;
    void run(() => voidPayment(sub.id, voidingId, voidReason.trim()), "pay.voidedNotice", () => {
      setVoidingId(null);
      setVoidReason("");
    });
  }

  const finalNumber = Number(sub.finalPrice);
  const progress = finalNumber > 0 ? Math.min(100, Math.max(0, (Number(sub.paid) / finalNumber) * 100)) : 100;
  const running = sub.phase === "ACTIVE" || sub.phase === "UPCOMING";

  return (
    <Card className={cn(highlight && "ring-1 ring-primary/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">
              <bdi>{sub.packageName}</bdi>
            </h3>
            {sub.period ? <Badge>{t(`sub.period.${sub.period}`)}</Badge> : null}
            <PhaseBadge phase={sub.phase} />
            <PaymentBadge status={sub.paymentStatus} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {day(sub.startsAt)}
            <ToArrow />
            {day(sub.endsAt)}
            {sub.phase === "ACTIVE" ? (
              <>
                {" · "}
                {t("sub.daysLeft")}: <span className="tabular font-medium text-foreground">{fmt.number(sub.daysLeft)}</span>
              </>
            ) : null}
            {sub.phase === "GRACE" ? (
              <>
                {" · "}
                {t("sub.graceLeft")}: <span className="tabular font-medium text-warning">{fmt.number(sub.graceDaysLeft)}</span>
              </>
            ) : null}
          </p>
        </div>
        {sub.contractNumber ? (
          <a
            href={`/contracts/${sub.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border-strong px-3 text-[13px] font-medium text-foreground hover:bg-surface-2"
          >
            {t("sub.openContract")}
            <bdi dir="ltr" className="text-muted-foreground">{sub.contractNumber}</bdi>
          </a>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <PriceSummary price={sub} />
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-muted-foreground">
                {t("sub.paid")}: <Money value={sub.paid} currency={sub.currencyCode} />
              </span>
              <span className={cn("font-medium", Number(sub.balance) > 0 ? "text-warning" : "text-success")}>
                {t("sub.balance")}: <Money value={sub.balance} currency={sub.currencyCode} />
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label={t("sub.paid")}
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          {sub.notes ? (
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">{t("sub.notes")}:</span> {sub.notes}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("sub.recordedBy")} <bdi dir="ltr">{sub.createdByEmail}</bdi> · {fmt.dateTime(sub.createdAt)}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-[13px] font-semibold text-foreground">{t("pay.title")}</h4>
            {!cancelled && !paying ? (
              <Button size="sm" onClick={() => setPaying(true)} disabled={busy}>
                {t("pay.add")}
              </Button>
            ) : null}
          </div>

          {paying ? (
            <form onSubmit={submitPayment} className="mb-4 space-y-3 rounded-lg border border-border bg-surface-2/60 p-4" noValidate>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`pay-amount-${sub.id}`}>{t("pay.amount")}</Label>
                  <Input
                    id={`pay-amount-${sub.id}`}
                    dir="ltr"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className="text-start"
                  />
                </div>
                <div>
                  <Label htmlFor={`pay-method-${sub.id}`}>{t("pay.method")}</Label>
                  <Select id={`pay-method-${sub.id}`} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map((value) => (
                      <option key={value} value={value}>
                        {t(`pay.method.${value}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`pay-date-${sub.id}`}>{t("pay.date")}</Label>
                  <Input
                    id={`pay-date-${sub.id}`}
                    type="date"
                    dir="ltr"
                    value={paidAt}
                    onChange={(event) => setPaidAt(event.target.value)}
                    className="text-start"
                  />
                </div>
                <div>
                  <Label htmlFor={`pay-ref-${sub.id}`}>{t("pay.reference")}</Label>
                  <Input
                    id={`pay-ref-${sub.id}`}
                    dir="ltr"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={t("pay.referencePlaceholder")}
                    maxLength={120}
                    className="text-start"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={`pay-notes-${sub.id}`}>{t("pay.notes")}</Label>
                <Input
                  id={`pay-notes-${sub.id}`}
                  value={payNotes}
                  onChange={(event) => setPayNotes(event.target.value)}
                  maxLength={500}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={busy || amount.trim() === "" || paidAt === ""}>
                  {busy ? t("pay.saving") : t("pay.save")}
                </Button>
                <Button type="button" size="sm" onClick={() => setPaying(false)} disabled={busy}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}

          {sub.payments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("pay.none")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sub.payments.map((payment) => (
                <li key={payment.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className={cn("text-sm font-medium", payment.voided && "text-muted-foreground line-through")}>
                      <Money value={payment.amount} currency={sub.currencyCode} />
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {t(`pay.method.${payment.method}`)} · {day(payment.paidAt)}
                    </span>
                  </div>
                  {payment.reference || payment.notes ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {payment.reference ? <bdi dir="ltr">{payment.reference}</bdi> : null}
                      {payment.reference && payment.notes ? " · " : null}
                      {payment.notes}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("pay.by")} <bdi dir="ltr">{payment.recordedByEmail}</bdi>
                  </p>
                  {payment.voided ? (
                    <p className="mt-1 text-xs text-danger">
                      <Badge tone="danger">{t("pay.voidedTag")}</Badge> {payment.voidReason}
                    </p>
                  ) : !cancelled ? (
                    voidingId === payment.id ? (
                      <form onSubmit={submitVoid} className="mt-2 space-y-2" noValidate>
                        <Label htmlFor={`void-${payment.id}`}>{t("pay.voidReason")}</Label>
                        <Input
                          id={`void-${payment.id}`}
                          value={voidReason}
                          onChange={(event) => setVoidReason(event.target.value)}
                          maxLength={300}
                        />
                        <p className="text-xs text-muted-foreground">{t("pay.voidHint")}</p>
                        <div className="flex gap-2">
                          <Button type="submit" variant="danger" size="sm" disabled={busy || voidReason.trim().length < 3}>
                            {t("pay.voidConfirm")}
                          </Button>
                          <Button type="button" size="sm" onClick={() => setVoidingId(null)} disabled={busy}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setVoidingId(payment.id);
                          setVoidReason("");
                        }}
                        className="mt-1 text-xs font-medium text-danger hover:underline"
                      >
                        {t("pay.void")}
                      </button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {problem ? <Alert tone="danger" className="mx-5 mb-5">{problem}</Alert> : null}

      {running ? (
        <div className="border-t border-border px-5 py-3">
          {confirmingCancel ? (
            <div className="space-y-3">
              <Alert tone="warning">{t("sub.cancelConfirm")}</Alert>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => cancelSubscription(sub.id), "sub.cancelled", () => setConfirmingCancel(false))}
                >
                  {t("detail.confirm")}
                </Button>
                <Button size="sm" onClick={() => setConfirmingCancel(false)} disabled={busy}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingCancel(true)} disabled={busy}>
              {t("sub.cancel")}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
