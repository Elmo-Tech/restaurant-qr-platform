import { Badge } from "@/components/ui";
import type { SubscriptionBrief } from "@/lib/api/platform";
import type { createFormatters, Translate } from "@/lib/i18n/translate";

type Formatters = ReturnType<typeof createFormatters>;

/**
 * Where a restaurant's subscription stands, in one badge and one quiet line (DEC-049): days left (amber at
 * a week or less), the grace period, expired, or none; and what is still owed, if anything.
 */
export function SubscriptionChip({
  brief,
  t,
  fmt,
}: {
  brief: SubscriptionBrief | null;
  t: Translate;
  fmt: Formatters;
}) {
  if (!brief) return <span className="text-muted-foreground">{t("subChip.none")}</span>;

  let tone: "success" | "warning" | "danger" | "primary" | "neutral";
  let label: string;
  switch (brief.phase) {
    case "ACTIVE":
      tone = brief.daysLeft <= 7 ? "warning" : "success";
      label = brief.daysLeft <= 0 ? t("subChip.endsToday") : t("subChip.daysLeft", { count: fmt.number(brief.daysLeft) });
      break;
    case "GRACE":
      tone = "warning";
      label = t("subChip.grace", { count: fmt.number(brief.graceDaysLeft) });
      break;
    case "EXPIRED":
      tone = "danger";
      label = t("subChip.expired");
      break;
    case "UPCOMING":
      tone = "primary";
      label = t("subChip.upcoming");
      break;
    default:
      tone = "neutral";
      label = t("subChip.cancelled");
  }
  const owes = Number(brief.balance) > 0 && brief.phase !== "CANCELLED";

  return (
    <div className="min-w-[130px]">
      <Badge tone={tone} dot>
        {label}
      </Badge>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(`sub.period.${brief.period}`)} · {fmt.date(`${brief.endsAt}T12:00:00`)}
      </p>
      {owes ? (
        <p dir="ltr" className="tabular mt-0.5 text-start text-xs font-medium text-warning">
          {t("subChip.owes", { amount: `${fmt.money(brief.balance)} ${brief.currencyCode}` })}
        </p>
      ) : null}
    </div>
  );
}
