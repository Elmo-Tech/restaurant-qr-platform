"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Select, Skeleton } from "@/components/ui";
import { billingErrorMessage } from "@/lib/api/billing-errors";
import { getBilling, setBillingCountry, type RestaurantBilling, type Subscription } from "@/lib/api/billing";
import type { PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { NewSubscriptionForm } from "./NewSubscriptionForm";
import { NewTrialForm } from "./NewTrialForm";
import { SubscriptionCard } from "./SubscriptionCard";
import { TrialCard } from "./TrialCard";

/** The countries the team usually bills; anything else is typed as a two-letter code. */
const COUNTRIES = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "IQ", "LY", "SD", "MA", "DZ", "TN", "US", "GB"] as const;
const OTHER = "__other";

type Notice = "pay.recorded" | "pay.voidedNotice" | "sub.cancelled" | "subForm.created" | "trialForm.created" | "trial.updated" | "billing.countrySaved";

/**
 * A restaurant's subscription, payments and contract (DEC-049). The Backend decides every price, date and
 * status; this shows them and records what the team does. `onSynced` tells the page to reload the
 * restaurant: a subscription change can move its package or suspend / reactivate it.
 */
export function BillingSection({
  restaurantId,
  packages,
  onSynced,
  onCoverageChange,
}: {
  restaurantId: string;
  packages: PackageSummary[];
  onSynced: () => void;
  /** Whether a subscription covers today (then the subscription decides the package). */
  onCoverageChange: (covered: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [billing, setBilling] = useState<RestaurantBilling | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState<"PAID" | "TRIAL" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [countryChoice, setCountryChoice] = useState("");
  const [otherCode, setOtherCode] = useState("");
  const [countryBusy, setCountryBusy] = useState(false);

  const load = useCallback(() => {
    return getBilling(restaurantId)
      .then((loaded) => {
        setBilling(loaded);
        setFailed(false);
        onCoverageChange(loaded.subscriptions.some((s) => s.phase === "ACTIVE"));
        const code = loaded.restaurant.countryCode;
        setCountryChoice((COUNTRIES as readonly string[]).includes(code) ? code : OTHER);
        setOtherCode((COUNTRIES as readonly string[]).includes(code) ? "" : code);
      })
      .catch(() => setFailed(true));
  }, [restaurantId, onCoverageChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const regionNames = useMemo(() => new Intl.DisplayNames(locale === "ar" ? "ar" : "en", { type: "region" }), [locale]);

  const replace = (next: Subscription) =>
    setBilling((current) =>
      current ? { ...current, subscriptions: current.subscriptions.map((s) => (s.id === next.id ? next : s)) } : current,
    );

  async function saveCountry() {
    if (!billing || countryBusy) return;
    const code = (countryChoice === OTHER ? otherCode : countryChoice).trim().toUpperCase();
    setCountryBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await setBillingCountry(restaurantId, code);
      await load();
      setNotice("billing.countrySaved");
      onSynced();
    } catch (caught) {
      setProblem(billingErrorMessage(caught, t));
    } finally {
      setCountryBusy(false);
    }
  }

  if (failed) return <Alert tone="danger">{t("billing.loadFailed")}</Alert>;
  if (!billing) return <Skeleton className="h-56 w-full" />;

  const current = billing.subscriptions.find((s) => s.id === billing.currentId) ?? null;
  const earlier = billing.subscriptions.filter((s) => s.id !== billing.currentId);
  const selectable = packages.filter(
    (pkg) => pkg.status === "ACTIVE" || billing.subscriptions.some((s) => s.packageId === pkg.id),
  );
  const savedCode = billing.restaurant.countryCode;
  const draftCode = (countryChoice === OTHER ? otherCode : countryChoice).trim().toUpperCase();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("billing.title")}
          description={t("billing.hint")}
          action={
            !creating ? (
              <div className="flex flex-wrap gap-2">
                {billing.trial.enabled ? (
                  <Button size="sm" onClick={() => setCreating("TRIAL")}>
                    {t("billing.startTrial")}
                  </Button>
                ) : null}
                <Button variant="primary" size="sm" onClick={() => setCreating("PAID")}>
                  {current ? t("billing.renew") : t("billing.new")}
                </Button>
              </div>
            ) : null
          }
        />
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[200px] flex-1 sm:max-w-xs">
            <label htmlFor="billing-country" className="mb-1.5 block text-[13px] font-medium text-foreground">
              {t("billing.country")}
            </label>
            <Select id="billing-country" value={countryChoice} onChange={(event) => setCountryChoice(event.target.value)} disabled={countryBusy}>
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {regionNames.of(code) ?? code}
                </option>
              ))}
              <option value={OTHER}>{t("billing.countryOther")}</option>
            </Select>
          </div>
          {countryChoice === OTHER ? (
            <div className="w-32">
              <label htmlFor="billing-country-code" className="mb-1.5 block text-[13px] font-medium text-foreground">
                {t("billing.countryCode")}
              </label>
              <Input
                id="billing-country-code"
                dir="ltr"
                value={otherCode}
                onChange={(event) => setOtherCode(event.target.value.toUpperCase())}
                maxLength={2}
                className="text-start uppercase"
              />
            </div>
          ) : null}
          <Button onClick={() => void saveCountry()} disabled={countryBusy || draftCode === savedCode || draftCode.length !== 2}>
            {t("billing.countrySave")}
          </Button>
          <Badge tone="primary">
            {t("billing.currency")}: <bdi dir="ltr">{billing.restaurant.billingCurrency}</bdi>
          </Badge>
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{t("billing.countryHint")}</p>
      </Card>

      {notice ? <Alert tone="success">{t(notice)}</Alert> : null}
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {creating === "PAID" ? (
        <NewSubscriptionForm
          restaurantId={restaurantId}
          packages={selectable}
          graceDays={billing.graceDays}
          onCancel={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            setNotice("subForm.created");
            void load();
            onSynced();
          }}
        />
      ) : null}

      {creating === "TRIAL" ? (
        <NewTrialForm
          restaurantId={restaurantId}
          packages={selectable.filter((pkg) => pkg.status === "ACTIVE")}
          defaultDays={billing.trial.defaultDays}
          defaultPackageId={billing.trial.defaultPackageId}
          onCancel={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
            setNotice("trialForm.created");
            void load();
            onSynced();
          }}
        />
      ) : null}

      {billing.subscriptions.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{t("billing.none")}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">{t("billing.noneHint")}</p>
        </Card>
      ) : null}

      {current ? (
        current.kind === "TRIAL" ? (
          <TrialCard
            subscription={current}
            highlight
            onChanged={replace}
            onSynced={onSynced}
            onNotice={() => setNotice("trial.updated")}
          />
        ) : (
          <SubscriptionCard subscription={current} highlight onChanged={replace} onSynced={onSynced} onNotice={setNotice} />
        )
      ) : null}

      {earlier.length > 0 ? (
        <section aria-label={t("billing.history")} className="space-y-4">
          <h2 className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{t("billing.history")}</h2>
          {earlier.map((sub) => sub.kind === "TRIAL" ? (
            <TrialCard key={sub.id} subscription={sub} highlight={false} onChanged={replace} onSynced={onSynced} onNotice={() => setNotice("trial.updated")} />
          ) : (
            <SubscriptionCard key={sub.id} subscription={sub} highlight={false} onChanged={replace} onSynced={onSynced} onNotice={setNotice} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
