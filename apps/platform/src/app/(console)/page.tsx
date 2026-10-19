import Link from "next/link";
import { ActivityFeed, StatusBadge } from "@/components/activity";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { Overview } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/translate";

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
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile label={t("overview.restaurants")} value={fmt.number(result.data.restaurants.total)} />
            <StatTile label={t("overview.active")} value={fmt.number(result.data.restaurants.active)} tone="success" />
            <StatTile
              label={t("overview.suspended")}
              value={fmt.number(result.data.restaurants.suspended)}
              tone={result.data.restaurants.suspended > 0 ? "warning" : "neutral"}
            />
            <StatTile label={t("overview.newRestaurants")} value={fmt.number(result.data.last30Days.newRestaurants)} tone="primary" />
            <StatTile label={t("overview.orders30d")} value={fmt.number(result.data.last30Days.orders)} tone="primary" />
            <StatTile label={t("overview.restricted")} value={fmt.number(result.data.restrictedRestaurants)} />
          </section>

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
              {result.data.recentRestaurants.length === 0 ? (
                <EmptyState title={t("overview.noRestaurants")} />
              ) : (
                <ul className="divide-y divide-border">
                  {result.data.recentRestaurants.map((restaurant) => (
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
              <ActivityFeed entries={result.data.recentActivity} t={t} fmt={fmt} empty={t("overview.noActivity")} />
            </Card>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <StatTile label={t("overview.totalBranches")} value={fmt.number(result.data.totals.branches)} />
            <StatTile label={t("overview.totalProducts")} value={fmt.number(result.data.totals.products)} />
            <StatTile label={t("overview.totalOrders")} value={fmt.number(result.data.totals.orders)} />
          </section>
        </div>
      )}
    </>
  );
}
