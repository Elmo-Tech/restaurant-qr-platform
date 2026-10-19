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

interface FormState {
  name: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  currencyCode: string;
  features: FeatureKey[];
}

const EMPTY: FormState = {
  name: "",
  description: "",
  monthlyPrice: "",
  yearlyPrice: "",
  // The platform's usual currency; editable.
  currencyCode: "EGP",
  features: [],
};

const formFrom = (pkg: PackageDetail): FormState => ({
  name: pkg.name,
  description: pkg.description ?? "",
  monthlyPrice: pkg.monthlyPrice ?? "",
  yearlyPrice: pkg.yearlyPrice ?? "",
  currencyCode: pkg.currencyCode ?? "EGP",
  features: pkg.features,
});

/** The form's text as the API's input: empty prices and description are `null`. */
function toInput(form: FormState): PackageInput {
  const priced = form.monthlyPrice.trim() !== "" || form.yearlyPrice.trim() !== "";
  return {
    name: form.name.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    monthlyPrice: form.monthlyPrice.trim() === "" ? null : form.monthlyPrice.trim(),
    yearlyPrice: form.yearlyPrice.trim() === "" ? null : form.yearlyPrice.trim(),
    currencyCode: priced && form.currencyCode.trim() !== "" ? form.currencyCode.trim().toUpperCase() : null,
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
  const toggleFeature = (key: FeatureKey) =>
    set("features", form.features.includes(key) ? form.features.filter((f) => f !== key) : [...form.features, key]);

  /** The first thing wrong with the form, as a message, or null. */
  function validate(): string | null {
    const input = toInput(form);
    if (input.name === "") return t("package.err.invalid");
    for (const price of [input.monthlyPrice, input.yearlyPrice]) {
      if (price !== null && !MONEY.test(price)) return t("package.err.invalid");
    }
    const priced = input.monthlyPrice !== null || input.yearlyPrice !== null;
    if (priced && !/^[A-Za-z]{3}$/.test(form.currencyCode.trim())) return t("package.err.currencyRequired");
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
      setForm((current) => ({ ...current, monthlyPrice: saved.monthlyPrice ?? "", yearlyPrice: saved.yearlyPrice ?? "" }));
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
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <div>
                <Label htmlFor="package-monthly">{t("package.monthly")}</Label>
                <Input
                  id="package-monthly"
                  dir="ltr"
                  inputMode="decimal"
                  value={form.monthlyPrice}
                  onChange={(event) => set("monthlyPrice", event.target.value)}
                  placeholder="0.00"
                  className="text-start"
                />
              </div>
              <div>
                <Label htmlFor="package-yearly">{t("package.yearly")}</Label>
                <Input
                  id="package-yearly"
                  dir="ltr"
                  inputMode="decimal"
                  value={form.yearlyPrice}
                  onChange={(event) => set("yearlyPrice", event.target.value)}
                  placeholder="0.00"
                  className="text-start"
                />
              </div>
              <div>
                <Label htmlFor="package-currency">{t("package.currency")}</Label>
                <Input
                  id="package-currency"
                  dir="ltr"
                  value={form.currencyCode}
                  onChange={(event) => set("currencyCode", event.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="EGP"
                  className="text-start uppercase"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("package.currencyHint")}</p>
              </div>
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
