import Link from "next/link";
import { Badge } from "@/components/ui";
import type { AuditEntry, FeatureKey } from "@/lib/api/platform";
import { FEATURE_KEYS } from "@/lib/api/platform";
import type { MessageKey } from "@/lib/i18n/messages";
import type { createFormatters, Translate } from "@/lib/i18n/translate";

type Formatters = ReturnType<typeof createFormatters>;

const ACTION_LABEL: Record<string, MessageKey> = {
  "admin.login": "action.admin.login",
  "restaurant.status_changed": "action.restaurant.status_changed",
  "restaurant.feature_changed": "action.restaurant.feature_changed",
  "restaurant.package_changed": "action.restaurant.package_changed",
  "package.created": "action.package.created",
  "package.updated": "action.package.updated",
  "package.deleted": "action.package.deleted",
};

const PACKAGE_PARTS = ["name", "description", "status", "prices", "features"] as const;

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
  if (entry.action === "restaurant.package_changed") {
    const name = (value: unknown) => (typeof value === "string" ? value : t("activity.noPackage"));
    return t("activity.detailPackage", { from: name(details.from), to: name(details.to) });
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
