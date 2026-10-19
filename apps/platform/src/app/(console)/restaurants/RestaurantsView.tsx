"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/activity";
import { IconSearch } from "@/components/icons";
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, TableWrap, Th } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { listRestaurants, type RestaurantPage, type RestaurantStatus } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";

export function RestaurantsView() {
  const { t, fmt } = useI18n();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<RestaurantStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RestaurantPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Typing waits a moment before it asks the server, and a new search starts from page one.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    listRestaurants({ search: debounced, status, page })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          isNetworkFailure(caught)
            ? t("common.unreachable")
            : caught instanceof ApiError && caught.status === 401
              ? t("common.sessionExpired")
              : t("common.error"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, status, page, t]);

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title={t("restaurants.title")} description={t("restaurants.subtitle")} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <IconSearch
              width={16}
              height={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("restaurants.searchPlaceholder")}
              aria-label={t("common.search")}
              className="ps-9"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as RestaurantStatus | "");
              setPage(1);
            }}
            aria-label={t("restaurants.status")}
            className="w-44"
          >
            <option value="">{t("restaurants.status")}: {t("common.all")}</option>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="SUSPENDED">{t("status.SUSPENDED")}</option>
            <option value="INACTIVE">{t("status.INACTIVE")}</option>
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : data === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title={t("restaurants.empty")} />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>{t("restaurants.col.restaurant")}</Th>
                  <Th>{t("restaurants.col.status")}</Th>
                  <Th>{t("restaurants.col.package")}</Th>
                  <Th className="text-end">{t("restaurants.col.branches")}</Th>
                  <Th className="text-end">{t("restaurants.col.products")}</Th>
                  <Th className="text-end">{t("restaurants.col.staff")}</Th>
                  <Th className="text-end">{t("restaurants.col.orders")}</Th>
                  <Th>{t("restaurants.col.restrictions")}</Th>
                  <Th>{t("restaurants.col.created")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((restaurant) => (
                  <tr key={restaurant.id} className="transition-colors hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <Link href={`/restaurants/${restaurant.id}`} className="group block min-w-[190px]">
                        <span className="block font-medium text-foreground group-hover:text-primary-text">
                          <bdi>{restaurant.name}</bdi>
                        </span>
                        <span dir="ltr" className="block max-w-[200px] truncate text-start text-xs text-muted-foreground" title={restaurant.publicId}>
                          {restaurant.publicId}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={restaurant.status} t={t} />
                    </td>
                    <td className="px-4 py-3">
                      {restaurant.package ? (
                        <span className="text-sm text-foreground">
                          <bdi>{restaurant.package.name}</bdi>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("restaurants.noPackage")}</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 text-end">{fmt.number(restaurant.counts.branches)}</td>
                    <td className="tabular px-4 py-3 text-end">{fmt.number(restaurant.counts.products)}</td>
                    <td className="tabular px-4 py-3 text-end">{fmt.number(restaurant.counts.staff)}</td>
                    <td className="tabular px-4 py-3 text-end">{fmt.number(restaurant.counts.orders30d)}</td>
                    <td className="px-4 py-3">
                      {restaurant.disabledFeatures.length === 0 ? (
                        <span className="text-muted-foreground">{t("restaurants.unrestricted")}</span>
                      ) : (
                        <Badge tone="warning">{t("restaurants.restricted", { count: restaurant.disabledFeatures.length })}</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt.date(restaurant.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="tabular text-[13px] text-muted-foreground">
              {t("common.showing", { from: fmt.number(from), to: fmt.number(to), total: fmt.number(data.total) })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                {t("common.previous")}
              </Button>
              <Button size="sm" disabled={page >= lastPage} onClick={() => setPage((current) => current + 1)}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
