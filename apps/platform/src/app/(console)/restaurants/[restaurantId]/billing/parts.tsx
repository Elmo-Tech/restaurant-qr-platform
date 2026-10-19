"use client";

import { Badge } from "@/components/ui";
import type { PaymentStatus, PriceBreakdown, SubscriptionPhase } from "@/lib/api/billing";
import { useI18n } from "@/lib/i18n/client";

/** An amount with its currency, kept left-to-right inside Arabic text. */
export function Money({ value, currency, minus = false }: { value: string; currency: string; minus?: boolean }) {
  const { fmt } = useI18n();
  return (
    <bdi dir="ltr" className="tabular whitespace-nowrap">
      {minus ? "- " : ""}
      {fmt.money(value)} {currency}
    </bdi>
  );
}

/** An arrow between two dates that points the way the text reads (it turns around in Arabic). */
export function ToArrow() {
  return (
    <span aria-hidden="true" className="mx-1 inline-block rtl:rotate-180">
      →
    </span>
  );
}

/** A calendar date from the API (YYYY-MM-DD) in the console language. */
export function useDay() {
  const { fmt } = useI18n();
  return (value: string) => fmt.date(`${value}T12:00:00`);
}

const PHASE_TONE: Record<SubscriptionPhase, "success" | "primary" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  UPCOMING: "primary",
  GRACE: "warning",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};

export function PhaseBadge({ phase }: { phase: SubscriptionPhase }) {
  const { t } = useI18n();
  return (
    <Badge tone={PHASE_TONE[phase]} dot>
      {t(`sub.phase.${phase}`)}
    </Badge>
  );
}

const PAY_TONE: Record<PaymentStatus, "success" | "primary" | "warning" | "neutral"> = {
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "neutral",
  OVERPAID: "primary",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return <Badge tone={PAY_TONE[status]}>{t(`sub.pay.${status}`)}</Badge>;
}

/** List price, the package offer, the customer's discount and the final price, as the Backend worked them out. */
export function PriceSummary({ price }: { price: PriceBreakdown }) {
  const { t, fmt } = useI18n();
  const row = (label: string, value: string, strong = false, minus = false) => (
    <div className={strong ? "flex items-baseline justify-between gap-4 border-t border-border pt-2.5" : "flex items-baseline justify-between gap-4"}>
      <dt className={strong ? "text-sm font-semibold text-foreground" : "text-[13px] text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "text-base font-semibold text-foreground" : "text-sm text-foreground"}>
        <Money value={value} currency={price.currencyCode} minus={minus} />
      </dd>
    </div>
  );
  return (
    <dl className="space-y-2">
      {row(t("sub.price.list"), price.listPrice)}
      {price.offer
        ? row(
            `${t("sub.price.offer")} (${fmt.number(Number(price.offer.percent))}%${price.offer.label ? `, ${price.offer.label}` : ""})`,
            price.offer.amount,
            false,
            true,
          )
        : null}
      {price.discount
        ? row(
            `${t("sub.price.discount")} (${
              price.discount.type === "PERCENT"
                ? `${fmt.number(Number(price.discount.value))}%`
                : fmt.money(price.discount.value)
            })`,
            price.discount.amount,
            false,
            true,
          )
        : null}
      {row(t("sub.price.final"), price.finalPrice, true)}
    </dl>
  );
}
