import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityFeed, StatusBadge } from "@/components/activity";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { MoneyTotal, Overview } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

type Fmt = ReturnType<typeof createFormatters>;

/** One headline figure: a label, the figure(s) and a quiet hint; a link when it leads somewhere. */
function Kpi({
  label,
  hint,
  href,
  tone = "neutral",
  children,
}: {
  label: string;
  hint?: string;
  href?: string;
  tone?: "neutral" | "success" | "warning" | "primary";
  children: ReactNode;
}) {
  const accent =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary-text" : "text-foreground";
  const body = (
    <Card className={cn("h-full p-5", href && "transition-shadow hover:shadow-pop")}>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className={cn("tabular mt-2 space-y-0.5 text-[26px] font-semibold leading-tight tracking-tight", accent)}>{children}</div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Money per currency, one line each; a dash when there is none. */
function MoneyLines({ totals, fmt }: { totals: MoneyTotal[]; fmt: Fmt }) {
  if (totals.length === 0) return <p className="text-muted-foreground">—</p>;
  return (
    <>
      {totals.map((total) => (
        <p key={total.currencyCode}>
          <bdi dir="ltr">
            {fmt.money(total.amount)} <span className="text-sm font-medium opacity-70">{total.currencyCode}</span>
          </bdi>
        </p>
      ))}
    </>
  );
}

function AttentionColumn({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {count > 0 ? <Badge tone="warning">{count}</Badge> : null}
      </div>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="space-y-1">{children}</ul>}
    </div>
  );
}

function RowLink({ href, title, meta, end }: { href: string; title: ReactNode; meta?: ReactNode; end?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
        </span>
        {end ? <span className="shrink-0 text-end text-[13px] font-medium">{end}</span> : null}
      </Link>
    </li>
  );
}

export default async function OverviewPage() {
  const { t, locale } = await getI18n();
  const fmt = createFormatters(locale);
  const result = await platformServerGet<Overview>("/overview");

  return (
    <>
      <PageHeader title={t("overview.title")} description={t("overview.subtitle")} />
      {!result.ok ? (
        <Alert tone="danger">{t("common.error")}</Alert>
      ) : (
        (() => {
          const d = result.data;
          const b = d.billing;
          const attention = b.ending.length + b.unpaidCount + d.openRequests + d.openLeads + d.restaurants.suspended;
          return (
            <div className="space-y-6">
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label={t("overview.activeRestaurants")} hint={t("overview.ofTotal", { total: fmt.number(d.restaurants.total) })} href="/restaurants" tone="success">
                  <p>{fmt.number(d.restaurants.active)}</p>
                </Kpi>
                <Kpi label={t("overview.received30d")} hint={t("overview.received30dHint")} tone="primary">
                  <MoneyLines totals={b.received30d} fmt={fmt} />
                </Kpi>
                <Kpi
                  label={t("overview.outstanding")}
                  hint={t("overview.outstandingHint", { count: fmt.number(b.unpaidCount) })}
                  tone={b.outstanding.length > 0 ? "warning" : "neutral"}
                >
                  <MoneyLines totals={b.outstanding} fmt={fmt} />
                </Kpi>
                <Kpi
                  label={t("overview.openRequests")}
                  hint={t("overview.openRequestsHint")}
                  href="/requests"
                  tone={d.openRequests > 0 ? "warning" : "neutral"}
                >
                  <p>{fmt.number(d.openRequests)}</p>
                </Kpi>
              </section>

              <Card>
                <CardHeader
                  title={t("overview.attention")}
                  description={t("overview.attentionHint")}
                  action={attention > 0 ? <Badge tone="warning">{fmt.number(attention)}</Badge> : <Badge tone="success" dot>{t("overview.allClear")}</Badge>}
                />
                <div className="grid divide-border md:grid-cols-3 md:divide-x rtl:md:divide-x-reverse">
                  <AttentionColumn title={t("overview.ending")} count={b.ending.length} empty={t("overview.endingEmpty")}>
                    {b.ending.map((item) => (
                      <RowLink
                        key={item.restaurantId}
                        href={`/restaurants/${item.restaurantId}`}
                        title={<bdi>{item.restaurantName}</bdi>}
                        meta={<bdi>{item.packageName}</bdi>}
                        end={
                          item.phase === "GRACE" ? (
                            <span className="text-danger">{t("subChip.grace", { count: fmt.number(item.graceDaysLeft) })}</span>
                          ) : (
                            <span className={item.daysLeft <= 7 ? "text-warning" : "text-foreground"}>
                              {item.daysLeft <= 0 ? t("subChip.endsToday") : t("subChip.daysLeft", { count: fmt.number(item.daysLeft) })}
                            </span>
                          )
                        }
                      />
                    ))}
                  </AttentionColumn>

                  <AttentionColumn title={t("overview.unpaid")} count={b.unpaidCount} empty={t("overview.unpaidEmpty")}>
                    {b.unpaid.map((item) => (
                      <RowLink
                        key={item.restaurantId}
                        href={`/restaurants/${item.restaurantId}`}
                        title={<bdi>{item.restaurantName}</bdi>}
                        meta={<bdi>{item.packageName}</bdi>}
                        end={
                          <bdi dir="ltr" className="tabular text-warning">
                            {fmt.money(item.balance)} {item.currencyCode}
                          </bdi>
                        }
                      />
                    ))}
                    {b.unpaidCount > b.unpaid.length ? (
                      <li className="px-0 pt-1 text-xs text-muted-foreground">{t("overview.more", { count: fmt.number(b.unpaidCount - b.unpaid.length) })}</li>
                    ) : null}
                  </AttentionColumn>

                  <AttentionColumn
                    title={t("overview.followUp")}
                    count={d.openRequests + d.openLeads + d.restaurants.suspended}
                    empty={t("overview.followUpEmpty")}
                  >
                    {d.openLeads > 0 ? (
                      <RowLink href="/leads" title={t("overview.openLeads")} meta={t("overview.openLeadsHint")} end={fmt.number(d.openLeads)} />
                    ) : null}
                    {d.openRequests > 0 ? (
                      <RowLink href="/requests" title={t("overview.openRequests")} meta={t("overview.openRequestsHint")} end={fmt.number(d.openRequests)} />
                    ) : null}
                    {d.restaurants.suspended > 0 ? (
                      <RowLink href="/restaurants" title={t("overview.suspended")} meta={t("overview.suspendedHint")} end={fmt.number(d.restaurants.suspended)} />
                    ) : null}
                  </AttentionColumn>
                </div>
              </Card>

              <section className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-3">
                  <CardHeader
                    title={t("overview.recentRestaurants")}
                    action={
                      <Link href="/restaurants" className="text-[13px] font-medium text-primary-text hover:underline">
                        {t("common.viewAll")}
                      </Link>
                    }
                  />
                  {d.recentRestaurants.length === 0 ? (
                    <EmptyState title={t("overview.noRestaurants")} />
                  ) : (
                    <ul className="divide-y divide-border">
                      {d.recentRestaurants.map((restaurant) => (
                        <li key={restaurant.id}>
                          <Link
                            href={`/restaurants/${restaurant.id}`}
                            className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                <bdi>{restaurant.name}</bdi>
                              </p>
                              <p className="text-xs text-muted-foreground">{fmt.date(restaurant.createdAt)}</p>
                            </div>
                            <StatusBadge status={restaurant.status} t={t} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="xl:col-span-2">
                  <CardHeader
                    title={t("overview.recentActivity")}
                    action={
                      <Link href="/activity" className="text-[13px] font-medium text-primary-text hover:underline">
                        {t("common.viewAll")}
                      </Link>
                    }
                  />
                  <ActivityFeed entries={d.recentActivity} t={t} fmt={fmt} empty={t("overview.noActivity")} />
                </Card>
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatTile label={t("overview.newRestaurants")} value={fmt.number(d.last30Days.newRestaurants)} tone="primary" />
                <StatTile label={t("overview.orders30d")} value={fmt.number(d.last30Days.orders)} tone="primary" />
                <StatTile label={t("overview.totalBranches")} value={fmt.number(d.totals.branches)} />
                <StatTile label={t("overview.totalProducts")} value={fmt.number(d.totals.products)} />
                <StatTile label={t("overview.restricted")} value={fmt.number(d.restrictedRestaurants)} />
              </section>
            </div>
          );
        })()
      )}
    </>
  );
}
