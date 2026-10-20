import Link from "next/link";
import { Badge } from "@/components/ui";
import type { AuditEntry, FeatureKey } from "@/lib/api/platform";
import { FEATURE_KEYS } from "@/lib/api/platform";
import type { MessageKey } from "@/lib/i18n/messages";
import type { createFormatters, Translate } from "@/lib/i18n/translate";

type Formatters = ReturnType<typeof createFormatters>;

const ACTION_LABEL: Record<string, MessageKey> = {
  "admin.login": "action.admin.login",
  "admin.created": "action.admin.created",
  "admin.status_changed": "action.admin.status_changed",
  "admin.password_reset": "action.admin.password_reset",
  "admin.password_changed": "action.admin.password_changed",
  "restaurant.created": "action.restaurant.created",
  "restaurant.status_changed": "action.restaurant.status_changed",
  "restaurant.feature_changed": "action.restaurant.feature_changed",
  "restaurant.package_changed": "action.restaurant.package_changed",
  "package.created": "action.package.created",
  "package.updated": "action.package.updated",
  "package.deleted": "action.package.deleted",
  "platform.public_settings_updated": "action.platform.public_settings_updated",
  "restaurant.country_changed": "action.restaurant.country_changed",
  "restaurant.auto_suspended": "action.restaurant.auto_suspended",
  "restaurant.auto_reactivated": "action.restaurant.auto_reactivated",
  "subscription.created": "action.subscription.created",
  "subscription.cancelled": "action.subscription.cancelled",
  "payment.recorded": "action.payment.recorded",
  "payment.voided": "action.payment.voided",
  "subscription_request.created": "action.subscription_request.created",
  "subscription_request.status_changed": "action.subscription_request.status_changed",
};

const PACKAGE_PARTS = ["name", "description", "status", "prices", "offer", "templates", "features"] as const;

const METHODS = ["CASH", "BANK_TRANSFER", "INSTAPAY", "MOBILE_WALLET", "OTHER"] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** "Active to Suspended", "WhatsApp ordering: default to not allowed": the one line that says what changed. */
export function describeChange(entry: AuditEntry, t: Translate): string {
  const details = asRecord(entry.details);
  if (entry.action === "restaurant.status_changed") {
    const name = (value: unknown) =>
      typeof value === "string" && ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(value)
        ? t(`status.${value as "ACTIVE" | "INACTIVE" | "SUSPENDED"}`)
        : String(value ?? "");
    return t("activity.detailStatus", { from: name(details.from), to: name(details.to) });
  }
  if (entry.action === "restaurant.feature_changed") {
    const state = (value: unknown) =>
      value === true ? t("activity.allowedWord") : value === false ? t("activity.notAllowedWord") : t("activity.default");
    const feature = (FEATURE_KEYS as readonly string[]).includes(String(details.feature))
      ? t(`feature.${details.feature as FeatureKey}`)
      : String(details.feature ?? "");
    return t("activity.detailFeature", { feature, from: state(details.from), to: state(details.to) });
  }
  if (entry.action === "admin.created" || entry.action === "admin.password_reset") {
    return String(details.email ?? "");
  }
  if (entry.action === "admin.status_changed") {
    return t("activity.adminStatus", {
      email: String(details.email ?? ""),
      status: t(details.to === "DISABLED" ? "team.status.DISABLED" : "team.status.ACTIVE"),
    });
  }
  if (entry.action === "restaurant.created") {
    return t("activity.createdDetail", {
      email: String(details.ownerEmail ?? ""),
      package: typeof details.package === "string" ? details.package : t("activity.noPackage"),
    });
  }
  if (entry.action === "restaurant.package_changed") {
    const name = (value: unknown) => (typeof value === "string" ? value : t("activity.noPackage"));
    return t("activity.detailPackage", { from: name(details.from), to: name(details.to) });
  }
  if (entry.action === "subscription.created") {
    const period = details.period === "YEARLY" ? t("sub.period.YEARLY") : t("sub.period.MONTHLY");
    return t("activity.subscriptionDetail", {
      package: String(details.package ?? ""),
      period,
      from: String(details.startsAt ?? ""),
      to: String(details.endsAt ?? ""),
      price: `${String(details.finalPrice ?? "")} ${String(details.currency ?? "")}`.trim(),
    });
  }
  if (entry.action === "subscription.cancelled") {
    return String(details.package ?? "");
  }
  if (entry.action === "payment.recorded" || entry.action === "payment.voided") {
    const method = (METHODS as readonly string[]).includes(String(details.method))
      ? t(`pay.method.${details.method as (typeof METHODS)[number]}`)
      : "";
    const amount = `${String(details.amount ?? "")} ${String(details.currency ?? "")}`.trim();
    return entry.action === "payment.voided" ? `${amount}: ${String(details.reason ?? "")}` : t("activity.paymentDetail", { amount, method });
  }
  if (entry.action === "subscription_request.created") {
    const kind = details.kind === "RENEWAL" ? t("requests.kind.RENEWAL") : t("requests.kind.UPGRADE");
    return t("activity.requestCreated", { kind, package: typeof details.package === "string" ? details.package : "-" });
  }
  if (entry.action === "subscription_request.status_changed") {
    const state = (value: unknown) =>
      typeof value === "string" && ["NEW", "CONTACTED", "DONE", "DISMISSED"].includes(value)
        ? t(`requests.status.${value as "NEW" | "CONTACTED" | "DONE" | "DISMISSED"}`)
        : String(value ?? "");
    return t("activity.requestStatus", { from: state(details.from), to: state(details.to) });
  }
  if (entry.action === "restaurant.country_changed") {
    return t("activity.countryDetail", { from: String(details.from ?? ""), to: String(details.to ?? "") });
  }
  if (entry.action === "package.created" || entry.action === "package.deleted") {
    return t("activity.packageName", { name: String(details.name ?? "") });
  }
  if (entry.action === "package.updated") {
    const parts = (Array.isArray(details.changes) ? details.changes : [])
      .filter((part): part is (typeof PACKAGE_PARTS)[number] => PACKAGE_PARTS.includes(part as never))
      .map((part) => t(`activity.part.${part}`))
      .join(", ");
    return t("activity.packageChanged", { name: String(details.name ?? ""), parts });
  }
  if (entry.action === "platform.public_settings_updated") {
    return t("activity.publicSettingsUrl", {
      from: String(details.from ?? ""),
      to: String(details.to ?? ""),
    });
  }
  return "";
}

export function actionLabel(action: string, t: Translate): string {
  const key = ACTION_LABEL[action];
  return key ? t(key) : action;
}

/** A compact feed of platform activity (overview and restaurant pages). */
export function ActivityFeed({
  entries,
  t,
  fmt,
  showRestaurant = true,
  empty,
}: {
  entries: AuditEntry[];
  t: Translate;
  fmt: Formatters;
  showRestaurant?: boolean;
  empty: string;
}) {
  if (entries.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => {
        const change = describeChange(entry, t);
        return (
          <li key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{actionLabel(entry.action, t)}</span>
                {showRestaurant && entry.restaurantId ? (
                  <>
                    {" · "}
                    <Link href={`/restaurants/${entry.restaurantId}`} className="text-primary-text hover:underline">
                      <bdi>{entry.restaurantName ?? entry.restaurantId}</bdi>
                    </Link>
                  </>
                ) : null}
              </p>
              {change ? <p className="mt-0.5 text-[13px] text-muted-foreground">{change}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground">
                <bdi dir="ltr">{entry.adminEmail}</bdi> · {fmt.dateTime(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusBadge({ status, t }: { status: "ACTIVE" | "INACTIVE" | "SUSPENDED"; t: Translate }) {
  return (
    <Badge tone={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral"} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}
