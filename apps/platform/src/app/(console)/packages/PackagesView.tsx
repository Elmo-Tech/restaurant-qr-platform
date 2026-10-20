"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconPackage, IconPlus } from "@/components/icons";
import { Alert, Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { FEATURE_KEYS, isDisplayOnly, listPackages, PREMIUM_TEMPLATES, STANDARD_TEMPLATES, type PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";

/** One price line, "149.50 EGP per month", or nothing when that price is not set. */
export function PriceLine({
  value,
  currency,
  period,
}: {
  value: string | null;
  currency: "EGP" | "USD";
  period: "monthly" | "yearly";
}) {
  const { t, fmt } = useI18n();
  if (value === null) return null;
  return (
    <p className="tabular text-sm text-foreground">
      <bdi>
        <span className="font-semibold">{fmt.money(value)}</span> {currency}
      </bdi>{" "}
      <span className="text-muted-foreground">{t(period === "monthly" ? "packages.perMonth" : "packages.perYear")}</span>
    </p>
  );
}

export function PackagesView() {
  const { t, fmt } = useI18n();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPackages()
      .then((loaded) => {
        if (!cancelled) setPackages(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          isNetworkFailure(caught)
            ? t("common.unreachable")
            : caught instanceof ApiError && caught.status === 401
              ? t("common.sessionExpired")
              : t("packages.loadFailed"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <>
      <PageHeader
        title={t("packages.title")}
        description={t("packages.subtitle")}
        actions={
          <Link
            href="/packages/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <IconPlus width={18} height={18} />
            {t("packages.new")}
          </Link>
        }
      />

      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : packages === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <Card>
          <EmptyState title={t("packages.empty")}>{t("packages.emptyHint")}</EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <Link
                href={`/packages/${pkg.id}`}
                className="group flex h-full flex-col rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-text">
                      <IconPackage />
                    </span>
                    <h2 className="truncate text-[15px] font-semibold text-foreground group-hover:text-primary-text">
                      <bdi>{pkg.name}</bdi>
                    </h2>
                  </div>
                  {pkg.status === "ARCHIVED" ? <Badge tone="warning">{t("packages.status.ARCHIVED")}</Badge> : null}
                </div>
                {isDisplayOnly(pkg.features) ? (
                  <div className="mt-3">
                    <Badge tone="success" dot>
                      {t("packages.displayOnly")}
                    </Badge>
                  </div>
                ) : null}

                {pkg.description ? (
                  <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{pkg.description}</p>
                ) : null}

                <div className="mt-4 space-y-0.5">
                  {Object.values(pkg.prices).every((price) => price === null) ? (
                    <p className="text-sm text-muted-foreground">{t("packages.noPrice")}</p>
                  ) : (
                    <>
                      <PriceLine value={pkg.prices.egpMonthly} currency="EGP" period="monthly" />
                      <PriceLine value={pkg.prices.egpYearly} currency="EGP" period="yearly" />
                      <PriceLine value={pkg.prices.usdMonthly} currency="USD" period="monthly" />
                      <PriceLine value={pkg.prices.usdYearly} currency="USD" period="yearly" />
                    </>
                  )}
                  {pkg.offer ? (
                    <div className="pt-1.5">
                      <Badge tone={pkg.offer.active ? "warning" : "neutral"} dot>
                        {pkg.offer.label ? <bdi>{pkg.offer.label}: </bdi> : null}
                        {t("packages.offerBadge", { percent: fmt.number(Number(pkg.offer.percent)) })}
                      </Badge>
                    </div>
                  ) : null}
                </div>

                {pkg.features.includes("MENU_TEMPLATES") ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    {pkg.templates.all
                      ? t("packages.designsAll")
                      : t("packages.designsTiers", {
                          standard: fmt.number(
                            1 + (pkg.templates.allStandard ? STANDARD_TEMPLATES.length : pkg.templates.selected.filter((key) => (STANDARD_TEMPLATES as readonly string[]).includes(key)).length),
                          ),
                          premium: fmt.number(pkg.templates.selected.filter((key) => (PREMIUM_TEMPLATES as readonly string[]).includes(key)).length),
                        })}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {pkg.features.length === 0 ? (
                    <span className="text-[13px] text-muted-foreground">{t("packages.noFeatures")}</span>
                  ) : (
                    pkg.features.map((key) => (
                      <Badge key={key} tone="primary">
                        {t(`feature.${key}`)}
                      </Badge>
                    ))
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-[13px] text-muted-foreground">
                  <span className="tabular">
                    {t("packages.featuresCount", {
                      count: fmt.number(pkg.features.length),
                      total: fmt.number(FEATURE_KEYS.length),
                    })}
                  </span>
                  <span className="tabular">{t("packages.restaurantCount", { count: fmt.number(pkg.restaurantCount) })}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
