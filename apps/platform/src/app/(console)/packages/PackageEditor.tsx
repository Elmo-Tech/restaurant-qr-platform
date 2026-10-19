"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { StatusBadge } from "@/components/activity";
import { IconArrowLeft } from "@/components/icons";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { packageErrorKey } from "@/lib/api/package-errors";
import {
  createPackage,
  deletePackage,
  FEATURE_KEYS,
  getPackage,
  isDisplayOnly,
  ORDERING_FEATURES,
  updatePackage,
  type FeatureKey,
  type PackageDetail,
  type PackageInput,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";

/** A price the Backend accepts: digits with at most two decimals. */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
/** An offer percentage: above 0, up to 100, at most two decimals. */
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type PriceField = "egpMonthly" | "egpYearly" | "usdMonthly" | "usdYearly";

interface FormState {
  name: string;
  description: string;
  prices: Record<PriceField, string>;
  offerOn: boolean;
  offerPercent: string;
  offerLabel: string;
  offerEndsAt: string;
  features: FeatureKey[];
}

const EMPTY: FormState = {
  name: "",
  description: "",
  prices: { egpMonthly: "", egpYearly: "", usdMonthly: "", usdYearly: "" },
  offerOn: false,
  offerPercent: "",
  offerLabel: "",
  offerEndsAt: "",
  features: [],
};

const formFrom = (pkg: PackageDetail): FormState => ({
  name: pkg.name,
  description: pkg.description ?? "",
  prices: {
    egpMonthly: pkg.prices.egpMonthly ?? "",
    egpYearly: pkg.prices.egpYearly ?? "",
    usdMonthly: pkg.prices.usdMonthly ?? "",
    usdYearly: pkg.prices.usdYearly ?? "",
  },
  offerOn: pkg.offer !== null,
  offerPercent: pkg.offer?.percent ?? "",
  offerLabel: pkg.offer?.label ?? "",
  offerEndsAt: pkg.offer?.endsAt ?? "",
  features: pkg.features,
});

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** The form's text as the API's input: empty prices, description and offer parts are `null`. */
function toInput(form: FormState): PackageInput {
  return {
    name: form.name.trim(),
    description: orNull(form.description),
    prices: {
      egpMonthly: orNull(form.prices.egpMonthly),
      egpYearly: orNull(form.prices.egpYearly),
      usdMonthly: orNull(form.prices.usdMonthly),
      usdYearly: orNull(form.prices.usdYearly),
    },
    offer: form.offerOn
      ? { percent: form.offerPercent.trim(), label: orNull(form.offerLabel), endsAt: orNull(form.offerEndsAt) }
      : null,
    features: FEATURE_KEYS.filter((key) => form.features.includes(key)),
  };
}

export function PackageEditor({ packageId }: { packageId: string | null }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const creating = packageId === null;

  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [failure, setFailure] = useState<"notFound" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"package.saved" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (packageId === null) return;
    let cancelled = false;
    getPackage(packageId)
      .then((loaded) => {
        if (cancelled) return;
        setPkg(loaded);
        setForm(formFrom(loaded));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailure(caught instanceof ApiError && caught.status === 404 ? "notFound" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  const describe = (caught: unknown): string => {
    const key = packageErrorKey(caught);
    if (key) return t(key);
    return isNetworkFailure(caught)
      ? t("common.unreachable")
      : caught instanceof ApiError && caught.status === 401
        ? t("common.sessionExpired")
        : t("common.error");
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };
  const setPrice = (field: PriceField, value: string) => {
    setForm((current) => ({ ...current, prices: { ...current.prices, [field]: value } }));
    setNotice(null);
  };
  const toggleFeature = (key: FeatureKey) =>
    set("features", form.features.includes(key) ? form.features.filter((f) => f !== key) : [...form.features, key]);

  /** The first thing wrong with the form, as a message, or null. */
  function validate(): string | null {
    const input = toInput(form);
    if (input.name === "") return t("package.err.invalid");
    for (const price of Object.values(input.prices)) {
      if (price !== null && !MONEY.test(price)) return t("package.err.invalid");
    }
    if (input.offer) {
      const percent = Number(input.offer.percent);
      if (!PERCENT.test(input.offer.percent) || !(percent > 0 && percent <= 100)) return t("package.err.offerInvalid");
      if (input.offer.endsAt !== null && !DATE_ONLY.test(input.offer.endsAt)) return t("package.err.offerInvalid");
    }
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validate();
    setNotice(null);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (creating) {
        await createPackage(toInput(form));
        router.push("/packages");
        return;
      }
      const saved = await updatePackage(packageId, toInput(form));
      setPkg((current) => (current ? { ...current, ...saved } : current));
      setForm((current) => ({
        ...current,
        prices: {
          egpMonthly: saved.prices.egpMonthly ?? "",
          egpYearly: saved.prices.egpYearly ?? "",
          usdMonthly: saved.prices.usdMonthly ?? "",
          usdYearly: saved.prices.usdYearly ?? "",
        },
        offerPercent: saved.offer?.percent ?? current.offerPercent,
      }));
      setNotice("package.saved");
    } catch (caught) {
      setProblem(describe(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus() {
    if (!pkg || busy) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const saved = await updatePackage(pkg.id, { status: pkg.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" });
      setPkg({ ...pkg, ...saved });
    } catch (caught) {
      setProblem(describe(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!pkg || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await deletePackage(pkg.id);
      router.push("/packages");
    } catch (caught) {
      setProblem(describe(caught));
      setConfirmingDelete(false);
      setBusy(false);
    }
  }

  const renderFeatureGroup = (title: string, keys: FeatureKey[], hint?: string) => (
    <div key={title} className="border-t border-border first:border-t-0">
      <div className="bg-surface-2/60 px-5 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <ul className="divide-y divide-border">
        {keys.map((key) => (
          <li key={key}>
            <label className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-surface-2/60">
              <input
                type="checkbox"
                checked={form.features.includes(key)}
                onChange={() => toggleFeature(key)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t(`feature.${key}`)}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">{t(`feature.${key}.hint`)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );

  const back = (
    <Link href="/packages" className="mb-4 inline-flex items-center gap-2 text-sm text-primary-text hover:underline">
      <IconArrowLeft className="rtl:rotate-180" width={16} height={16} />
      {t("package.back")}
    </Link>
  );

  if (failure === "notFound") {
    return (
      <>
        {back}
        <Alert tone="warning">{t("package.notFound")}</Alert>
      </>
    );
  }
  if (failure === "error") return <Alert tone="danger">{t("common.error")}</Alert>;
  if (!creating && !pkg) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const inUse = (pkg?.restaurantCount ?? 0) > 0;

  return (
    <>
      {back}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">
          {creating ? t("package.newTitle") : <bdi>{pkg?.name}</bdi>}
        </h1>
        {pkg?.status === "ARCHIVED" ? <Badge tone="warning">{t("packages.status.ARCHIVED")}</Badge> : null}
      </div>

      {notice ? <Alert tone="success" className="mb-4">{t(notice)}</Alert> : null}
      {problem ? <Alert tone="danger" className="mb-4">{problem}</Alert> : null}
      {!creating && inUse ? (
        <Alert tone="info" className="mb-4">
          {t("package.editingLive", { count: fmt.number(pkg?.restaurantCount ?? 0) })}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={(event) => void submit(event)} className="space-y-6 xl:col-span-2" noValidate>
          <Card>
            <CardHeader title={t("package.details")} />
            <div className="space-y-4 p-5">
              <div>
                <Label htmlFor="package-name">{t("package.name")}</Label>
                <Input
                  id="package-name"
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder={t("package.namePlaceholder")}
                  maxLength={80}
                  required
                />
              </div>
              <div>
                <Label htmlFor="package-description">{t("package.description")}</Label>
                <textarea
                  id="package-description"
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("package.descriptionHint")}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t("package.prices")} description={t("package.pricesHint")} />
            <div className="space-y-5 p-5">
              {(
                [
                  ["package.priceEgp", "egpMonthly", "egpYearly", "EGP"],
                  ["package.priceUsd", "usdMonthly", "usdYearly", "USD"],
                ] as const
              ).map(([title, monthly, yearly, currency]) => (
                <div key={currency}>
                  <p className="mb-2 text-[13px] font-semibold text-foreground">{t(title)}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([[monthly, "package.monthly"], [yearly, "package.yearly"]] as const).map(([field, label]) => (
                      <div key={field}>
                        <Label htmlFor={`package-${field}`}>{t(label)}</Label>
                        <div className="relative">
                          <Input
                            id={`package-${field}`}
                            dir="ltr"
                            inputMode="decimal"
                            value={form.prices[field]}
                            onChange={(event) => setPrice(field, event.target.value)}
                            placeholder="0.00"
                            className="pe-14 text-start"
                          />
                          <span
                            dir="ltr"
                            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                          >
                            {currency}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("package.offer")} description={t("package.offerHint")} />
            <div className="space-y-4 p-5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.offerOn}
                  onChange={(event) => set("offerOn", event.target.checked)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="text-sm font-medium text-foreground">{t("package.offerOn")}</span>
                {pkg?.offer && !pkg.offer.active ? <Badge tone="neutral">{t("package.offerEnded")}</Badge> : null}
              </label>
              {form.offerOn ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="package-offer-percent">{t("package.offerPercent")}</Label>
                    <Input
                      id="package-offer-percent"
                      dir="ltr"
                      inputMode="decimal"
                      value={form.offerPercent}
                      onChange={(event) => set("offerPercent", event.target.value)}
                      placeholder="20"
                      className="text-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="package-offer-label">{t("package.offerLabel")}</Label>
                    <Input
                      id="package-offer-label"
                      value={form.offerLabel}
                      onChange={(event) => set("offerLabel", event.target.value)}
                      placeholder={t("package.offerLabelPlaceholder")}
                      maxLength={60}
                    />
                  </div>
                  <div>
                    <Label htmlFor="package-offer-ends">{t("package.offerEnds")}</Label>
                    <Input
                      id="package-offer-ends"
                      type="date"
                      dir="ltr"
                      value={form.offerEndsAt}
                      onChange={(event) => set("offerEndsAt", event.target.value)}
                      className="text-start"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{t("package.offerEndsHint")}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("package.features")}
              description={t("package.featuresHint")}
              action={
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" onClick={() => set("features", [...FEATURE_KEYS])}>
                    {t("package.selectAll")}
                  </Button>
                  <Button type="button" size="sm" onClick={() => set("features", [])}>
                    {t("package.clearAll")}
                  </Button>
                </div>
              }
            />
            {renderFeatureGroup(t("package.group.menu"), FEATURE_KEYS.filter((key) => !ORDERING_FEATURES.includes(key)))}
            {renderFeatureGroup(
              t("package.group.ordering"),
              FEATURE_KEYS.filter((key) => ORDERING_FEATURES.includes(key)),
              t("package.orderingHint"),
            )}
            {isDisplayOnly(form.features) ? (
              <p className="border-t border-border bg-success-soft px-5 py-3 text-[13px] font-medium text-success">
                {t("package.displayOnlyNote")}
              </p>
            ) : null}
          </Card>

          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("package.saving") : creating ? t("package.create") : t("package.save")}
            </Button>
            <Button type="button" onClick={() => router.push("/packages")} disabled={busy}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>

        {pkg ? (
          <div className="space-y-6">
            <Card>
              <CardHeader title={t("package.status")} description={t("package.statusHint")} />
              <div className="p-5">
                <Button className="w-full" onClick={() => void changeStatus()} disabled={busy}>
                  {pkg.status === "ACTIVE" ? t("package.archive") : t("package.unarchive")}
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader title={t("package.restaurantsOn")} />
              {pkg.restaurants.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{t("package.noRestaurants")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {pkg.restaurants.map((restaurant) => (
                    <li key={restaurant.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/restaurants/${restaurant.id}`} className="min-w-0 truncate text-sm text-primary-text hover:underline">
                        <bdi>{restaurant.name}</bdi>
                      </Link>
                      <StatusBadge status={restaurant.status} t={t} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title={t("package.delete")} description={t("package.deleteHint")} />
              <div className="space-y-3 p-5">
                {confirmingDelete ? (
                  <>
                    <Alert tone="warning">{t("package.deleteConfirm", { name: pkg.name })}</Alert>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                        {t("detail.confirm")}
                      </Button>
                      <Button onClick={() => setConfirmingDelete(false)} disabled={busy}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button className="w-full" onClick={() => setConfirmingDelete(true)} disabled={busy || inUse}>
                    {t("package.delete")}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
