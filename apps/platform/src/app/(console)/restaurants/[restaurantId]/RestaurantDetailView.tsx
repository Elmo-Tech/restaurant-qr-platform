"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityFeed, StatusBadge } from "@/components/activity";
import { SubscriptionChip } from "@/components/subscription-chip";
import { IconArrowLeft } from "@/components/icons";
import { Alert, Badge, Button, Card, CardHeader, Select, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { packageErrorKey } from "@/lib/api/package-errors";
import {
  assignRestaurantPackage,
  getAudit,
  getRestaurant,
  listPackages,
  setRestaurantFeature,
  setRestaurantStatus,
  type AuditEntry,
  type FeatureKey,
  type FeatureState,
  type PackageSummary,
  type RestaurantDetail,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { BillingSection } from "./billing/BillingSection";

type FeatureChoice = "default" | "allowed" | "notAllowed";

const choiceOf = (feature: FeatureState): FeatureChoice =>
  !feature.overridden ? "default" : feature.enabled ? "allowed" : "notAllowed";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function RestaurantDetailView({ restaurantId }: { restaurantId: string }) {
  const { t, fmt } = useI18n();
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [failure, setFailure] = useState<"notFound" | "error" | null>(null);
  // The banner is kept as a message key, so it is translated when shown (a language switch updates it).
  const [notice, setNotice] = useState<"features.updated" | "detail.statusUpdated" | "detail.packageUpdated" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busyFeature, setBusyFeature] = useState<FeatureKey | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  // "" = no package; otherwise a package id. Null until the restaurant has loaded.
  const [chosenPackage, setChosenPackage] = useState<string | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  // True while a subscription covers today: then the subscription decides the package (DEC-049).
  const [coveredBySubscription, setCoveredBySubscription] = useState(false);

  const reloadAudit = useCallback(() => {
    getAudit(restaurantId)
      .then(setAudit)
      .catch(() => undefined);
  }, [restaurantId]);

  /** A subscription change can move the package or the status: read the restaurant and its activity again. */
  const refreshAfterBilling = useCallback(() => {
    getRestaurant(restaurantId)
      .then((reloaded) => {
        setRestaurant(reloaded);
        setChosenPackage(reloaded.package?.id ?? "");
      })
      .catch(() => undefined);
    reloadAudit();
  }, [restaurantId, reloadAudit]);

  useEffect(() => {
    let cancelled = false;
    getRestaurant(restaurantId)
      .then((loaded) => {
        if (cancelled) return;
        setRestaurant(loaded);
        setChosenPackage(loaded.package?.id ?? "");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailure(caught instanceof ApiError && caught.status === 404 ? "notFound" : "error");
      });
    listPackages()
      .then((loaded) => {
        if (!cancelled) setPackages(loaded);
      })
      .catch(() => undefined);
    reloadAudit();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, reloadAudit]);

  const describe = (caught: unknown): string =>
    isNetworkFailure(caught) ? t("common.unreachable") : caught instanceof ApiError && caught.status === 401 ? t("common.sessionExpired") : t("common.error");

  async function changeFeature(feature: FeatureKey, choice: FeatureChoice) {
    if (busyFeature || !restaurant) return;
    setBusyFeature(feature);
    setProblem(null);
    setNotice(null);
    try {
      const updated = await setRestaurantFeature(restaurantId, feature, choice === "default" ? null : choice === "allowed");
      setRestaurant({
        ...restaurant,
        features: restaurant.features.map((existing) => (existing.key === feature ? updated : existing)),
        disabledFeatures: updated.enabled
          ? restaurant.disabledFeatures.filter((key) => key !== feature)
          : [...restaurant.disabledFeatures.filter((key) => key !== feature), feature],
      });
      setNotice("features.updated");
      reloadAudit();
    } catch (caught) {
      setProblem(describe(caught));
    } finally {
      setBusyFeature(null);
    }
  }

  async function applyPackage() {
    if (!restaurant || packageBusy || chosenPackage === null) return;
    setPackageBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await assignRestaurantPackage(restaurantId, chosenPackage === "" ? null : chosenPackage);
      // The package changes what every feature resolves to, so read the restaurant again.
      const reloaded = await getRestaurant(restaurantId);
      setRestaurant(reloaded);
      setChosenPackage(reloaded.package?.id ?? "");
      setNotice("detail.packageUpdated");
      reloadAudit();
    } catch (caught) {
      const key = packageErrorKey(caught);
      setProblem(key ? t(key) : describe(caught));
    } finally {
      setPackageBusy(false);
    }
  }

  async function changeStatus() {
    if (!restaurant || statusBusy) return;
    setStatusBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const next = restaurant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      const result = await setRestaurantStatus(restaurantId, next);
      setRestaurant({ ...restaurant, status: result.status });
      setConfirmingStatus(false);
      setNotice("detail.statusUpdated");
      reloadAudit();
    } catch (caught) {
      setProblem(describe(caught));
    } finally {
      setStatusBusy(false);
    }
  }

  if (failure === "notFound") {
    return (
      <>
        <Link href="/restaurants" className="mb-4 inline-flex items-center gap-2 text-sm text-primary-text hover:underline">
          <IconArrowLeft className="rtl:rotate-180" width={16} height={16} />
          {t("detail.back")}
        </Link>
        <Alert tone="warning">{t("detail.notFound")}</Alert>
      </>
    );
  }
  if (failure === "error") return <Alert tone="danger">{t("common.error")}</Alert>;
  if (!restaurant) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const suspending = restaurant.status === "ACTIVE";
  const on = (value: boolean) => (value ? t("detail.on") : t("detail.off"));

  return (
    <>
      <Link href="/restaurants" className="mb-4 inline-flex items-center gap-2 text-sm text-primary-text hover:underline">
        <IconArrowLeft className="rtl:rotate-180" width={16} height={16} />
        {t("detail.back")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">
              <bdi>{restaurant.name}</bdi>
            </h1>
            <StatusBadge status={restaurant.status} t={t} />
          </div>
          <p dir="ltr" className="mt-1 text-start text-[13px] text-muted-foreground">
            {restaurant.publicId}
          </p>
        </div>
        <SubscriptionChip brief={restaurant.subscription} t={t} fmt={fmt} />
      </div>

      {notice ? <Alert tone="success" className="mb-4">{t(notice)}</Alert> : null}
      {problem ? <Alert tone="danger" className="mb-4">{problem}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BillingSection
            restaurantId={restaurantId}
            packages={packages}
            onSynced={refreshAfterBilling}
            onCoverageChange={setCoveredBySubscription}
          />

          <Card>
            <CardHeader title={t("detail.package")} description={t("detail.packageHint")} />
            <div className="flex flex-wrap items-center gap-3 p-5">
              <Select
                value={chosenPackage ?? ""}
                onChange={(event) => setChosenPackage(event.target.value)}
                disabled={packageBusy || chosenPackage === null || coveredBySubscription}
                aria-label={t("detail.package")}
                className="min-w-[220px] flex-1 sm:max-w-sm"
              >
                <option value="">{t("detail.noPackage")}</option>
                {packages
                  // an archived package is listed only while this restaurant is still on it
                  .filter((pkg) => pkg.status === "ACTIVE" || pkg.id === restaurant.package?.id)
                  .map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                      {pkg.status === "ARCHIVED" ? ` (${t("detail.packageArchivedTag")})` : ""}
                    </option>
                  ))}
              </Select>
              <Button
                variant="primary"
                onClick={() => void applyPackage()}
                disabled={
                  packageBusy ||
                  coveredBySubscription ||
                  chosenPackage === null ||
                  chosenPackage === (restaurant.package?.id ?? "")
                }
              >
                {t("detail.packageSave")}
              </Button>
            </div>
            {coveredBySubscription ? (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{t("package.err.bySubscription")}</p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t("features.title")} description={t("features.hint")} />
            <ul className="divide-y divide-border">
              {restaurant.features.map((feature) => {
                const choice = choiceOf(feature);
                const options: { value: FeatureChoice; label: string }[] = [
                  { value: "default", label: restaurant.package ? t("features.fromPackage") : t("features.default") },
                  { value: "allowed", label: t("features.allowed") },
                  { value: "notAllowed", label: t("features.notAllowed") },
                ];
                return (
                  <li key={feature.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{t(`feature.${feature.key}`)}</p>
                        <Badge tone={feature.enabled ? "success" : "danger"} dot>
                          {feature.enabled ? t("features.allowed") : t("features.notAllowed")}
                        </Badge>
                        {feature.overridden ? <Badge tone="primary">{t(restaurant.package ? "features.exception" : "features.custom")}</Badge> : null}
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">{t(`feature.${feature.key}.hint`)}</p>
                      {restaurant.package ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <bdi>{restaurant.package.name}</bdi>: {t(feature.baseEnabled ? "features.inPackage" : "features.notInPackage")}
                        </p>
                      ) : null}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t(`feature.${feature.key}`)}
                      className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
                    >
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={choice === option.value}
                          disabled={busyFeature !== null}
                          onClick={() => choice !== option.value && void changeFeature(feature.key, option.value)}
                          className={cn(
                            "h-8 rounded-md px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            choice === option.value
                              ? option.value === "notAllowed"
                                ? "bg-danger-soft text-danger shadow-card"
                                : option.value === "allowed"
                                  ? "bg-success-soft text-success shadow-card"
                                  : "bg-surface text-foreground shadow-card"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("detail.activity")} />
            <ActivityFeed
              entries={audit}
              t={t}
              fmt={fmt}
              showRestaurant={false}
              empty={t("detail.noActivity")}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("detail.account")} description={t("detail.accountHint")} />
            <div className="space-y-3 p-5">
              {confirmingStatus ? (
                <>
                  <Alert tone={suspending ? "warning" : "info"}>
                    {t(suspending ? "detail.suspendConfirm" : "detail.activateConfirm", { name: restaurant.name })}
                  </Alert>
                  <div className="flex gap-2">
                    <Button
                      variant={suspending ? "danger" : "primary"}
                      onClick={() => void changeStatus()}
                      disabled={statusBusy}
                    >
                      {t("detail.confirm")}
                    </Button>
                    <Button onClick={() => setConfirmingStatus(false)} disabled={statusBusy}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant={suspending ? "secondary" : "primary"}
                  className="w-full"
                  onClick={() => setConfirmingStatus(true)}
                  disabled={restaurant.status === "INACTIVE"}
                >
                  {suspending ? t("detail.suspend") : t("detail.activate")}
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("detail.usage")} />
            <dl className="divide-y divide-border px-5">
              <Fact label={t("detail.branches")}><span className="tabular">{fmt.number(restaurant.counts.branches)}</span></Fact>
              <Fact label={t("detail.activeBranches")}><span className="tabular">{fmt.number(restaurant.totals.activeBranches)}</span></Fact>
              <Fact label={t("detail.tables")}><span className="tabular">{fmt.number(restaurant.totals.tables)}</span></Fact>
              <Fact label={t("detail.products")}><span className="tabular">{fmt.number(restaurant.counts.products)}</span></Fact>
              <Fact label={t("detail.team")}><span className="tabular">{fmt.number(restaurant.counts.staff)}</span></Fact>
              <Fact label={t("detail.orders30d")}><span className="tabular">{fmt.number(restaurant.counts.orders30d)}</span></Fact>
              <Fact label={t("detail.ordersTotal")}><span className="tabular">{fmt.number(restaurant.totals.orders)}</span></Fact>
            </dl>
          </Card>

          <Card>
            <CardHeader title={t("detail.owners")} />
            {restaurant.owners.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">{t("detail.noOwners")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {restaurant.owners.map((owner) => (
                  <li key={owner.email} className="flex items-center justify-between gap-3 px-5 py-3">
                    <bdi dir="ltr" className="truncate text-sm">{owner.email}</bdi>
                    {owner.status !== "ACTIVE" ? <Badge tone="warning">{t("detail.ownerInvited")}</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("detail.settings")} description={t("detail.settingsHint")} />
            <dl className="divide-y divide-border px-5">
              <Fact label={t("detail.pickup")}>{on(restaurant.settings.pickupEnabled)}</Fact>
              <Fact label={t("detail.delivery")}>{on(restaurant.settings.deliveryEnabled)}</Fact>
              <Fact label={t("detail.tableOrdering")}>{on(restaurant.settings.tableOrderingEnabled)}</Fact>
              <Fact label={t("detail.whatsapp")}>{on(restaurant.settings.whatsappOrderingEnabled)}</Fact>
              <Fact label={t("detail.template")}><bdi dir="ltr">{restaurant.settings.menuTemplate}</bdi></Fact>
              <Fact label={t("detail.suggestions")}><bdi dir="ltr">{restaurant.settings.suggestionsMode}</bdi></Fact>
              <Fact label={t("detail.locale")}><bdi dir="ltr">{restaurant.defaultLocale}</bdi></Fact>
              <Fact label={t("detail.currency")}><bdi dir="ltr">{restaurant.currencyCode}</bdi></Fact>
              <Fact label={t("detail.created")}>{fmt.date(restaurant.createdAt)}</Fact>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
