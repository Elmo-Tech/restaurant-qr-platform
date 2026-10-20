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
  PREMIUM_TEMPLATES,
  STANDARD_TEMPLATES,
  isDisplayOnly,
  ORDERING_GROUP,
  updatePackage,
  type FeatureKey,
  type PackageDetail,
  type PackageInput,
  type PackageTemplate,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** A price as typed in the console: plain digits or correctly grouped thousands, with up to two decimals. */
const MONEY_INPUT = /^(?:\d{1,10}|\d{1,3}(?:,\d{3}){1,3})(?:\.\d{1,2})?$/;
/** An offer percentage: above 0, up to 100, at most two decimals. */
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type PriceField = "egpMonthly" | "egpYearly" | "usdMonthly" | "usdYearly";
type FieldName = "nameAr" | "nameEn" | PriceField | "offerPercent" | "offerEndsAt";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_IDS: Record<FieldName, string> = {
  nameAr: "package-name-ar",
  nameEn: "package-name-en",
  egpMonthly: "package-egpMonthly",
  egpYearly: "package-egpYearly",
  usdMonthly: "package-usdMonthly",
  usdYearly: "package-usdYearly",
  offerPercent: "package-offer-percent",
  offerEndsAt: "package-offer-ends",
};

interface FormState {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  prices: Record<PriceField, string>;
  offerOn: boolean;
  offerPercent: string;
  offerLabel: string;
  offerEndsAt: string;
  /** Menu designs (DEC-051, DEC-052): standard ones (all, or the ticked) and premium ones (none, the ticked, or all). */
  standardAll: boolean;
  standard: PackageTemplate[];
  premiumMode: PremiumMode;
  premium: PackageTemplate[];
  features: FeatureKey[];
}

type PremiumMode = "none" | "choose" | "all";

const EMPTY: FormState = {
  nameAr: "",
  nameEn: "",
  descriptionAr: "",
  descriptionEn: "",
  prices: { egpMonthly: "", egpYearly: "", usdMonthly: "", usdYearly: "" },
  offerOn: false,
  offerPercent: "",
  offerLabel: "",
  offerEndsAt: "",
  standardAll: true,
  standard: [],
  premiumMode: "all",
  premium: [],
  features: [],
};

function templatesFrom(rule: PackageDetail["templates"]) {
  const standardAll = rule.all || rule.allStandard;
  const standard = rule.selected.filter((key) => (STANDARD_TEMPLATES as readonly string[]).includes(key));
  const premium = rule.selected.filter((key) => (PREMIUM_TEMPLATES as readonly string[]).includes(key));
  const premiumMode: PremiumMode =
    rule.all || premium.length === PREMIUM_TEMPLATES.length ? "all" : premium.length > 0 ? "choose" : "none";
  return { standardAll, standard, premiumMode, premium };
}

/** What the form gives: standard (Classic included) and premium design counts. */
function templateCounts(form: FormState) {
  const standard = 1 + (form.standardAll ? STANDARD_TEMPLATES.length : form.standard.length);
  const premium =
    form.premiumMode === "all" ? PREMIUM_TEMPLATES.length : form.premiumMode === "choose" ? form.premium.length : 0;
  return { standard, premium };
}

const formFrom = (pkg: PackageDetail): FormState => ({
  nameAr: pkg.nameAr,
  nameEn: pkg.nameEn,
  descriptionAr: pkg.descriptionAr ?? "",
  descriptionEn: pkg.descriptionEn ?? "",
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
  ...templatesFrom(pkg.templates),
  features: pkg.features,
});

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());
const moneyOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.replaceAll(",", "");
};

function FieldError({ controlId, message }: { controlId: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${controlId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

/** "All" of both tiers is the open-ended rule; anything else lists what is chosen. */
function templatesInput(form: FormState): PackageInput["templates"] {
  if (form.standardAll && form.premiumMode === "all") return { all: true, allStandard: false, selected: [] };
  const premium =
    form.premiumMode === "all" ? [...PREMIUM_TEMPLATES] : form.premiumMode === "choose" ? form.premium : [];
  return {
    all: false,
    allStandard: form.standardAll,
    selected: [
      ...STANDARD_TEMPLATES.filter((key) => !form.standardAll && form.standard.includes(key)),
      ...PREMIUM_TEMPLATES.filter((key) => premium.includes(key)),
    ],
  };
}

/** The form's text as the API's input: empty prices, description and offer parts are `null`. */
function toInput(form: FormState): PackageInput {
  return {
    nameAr: form.nameAr.trim(),
    nameEn: form.nameEn.trim(),
    descriptionAr: orNull(form.descriptionAr),
    descriptionEn: orNull(form.descriptionEn),
    prices: {
      egpMonthly: moneyOrNull(form.prices.egpMonthly),
      egpYearly: moneyOrNull(form.prices.egpYearly),
      usdMonthly: moneyOrNull(form.prices.usdMonthly),
      usdYearly: moneyOrNull(form.prices.usdYearly),
    },
    offer: form.offerOn
      ? { percent: form.offerPercent.trim(), label: orNull(form.offerLabel), endsAt: orNull(form.offerEndsAt) }
      : null,
    templates: templatesInput(form),
    features: FEATURE_KEYS.filter((key) => form.features.includes(key)),
  };
}

export function PackageEditor({ packageId }: { packageId: string | null }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const creating = packageId === null;

  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [failure, setFailure] = useState<"notFound" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"package.saved" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "nameAr" || key === "nameEn" || key === "offerPercent" || key === "offerEndsAt") {
      clearFieldError(key);
    }
    setNotice(null);
  };
  const setPrice = (field: PriceField, value: string) => {
    setForm((current) => ({ ...current, prices: { ...current.prices, [field]: value } }));
    clearFieldError(field);
    setNotice(null);
  };
  const toggleFeature = (key: FeatureKey) =>
    set("features", form.features.includes(key) ? form.features.filter((f) => f !== key) : [...form.features, key]);

  /** Every invalid field, so the form can explain the problem where it occurred. */
  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (form.nameAr.trim() === "") errors.nameAr = t("package.err.nameRequired");
    if (form.nameEn.trim() === "") errors.nameEn = t("package.err.nameRequired");
    for (const [field, price] of Object.entries(form.prices) as [PriceField, string][]) {
      const value = price.trim();
      if (value !== "" && !MONEY_INPUT.test(value)) {
        errors[field] = t("package.err.priceFormat");
      }
    }
    if (form.offerOn) {
      const percentText = form.offerPercent.trim();
      const percent = Number(percentText);
      if (!PERCENT.test(percentText) || !(percent > 0 && percent <= 100)) {
        errors.offerPercent = t("package.err.percentField");
      }
      const endsAt = form.offerEndsAt.trim();
      if (endsAt !== "" && !DATE_ONLY.test(endsAt)) {
        errors.offerEndsAt = t("package.err.dateField");
      }
    }
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const errors = validate();
    setNotice(null);
    setProblem(null);
    setFieldErrors(errors);
    const firstInvalid = Object.keys(errors)[0] as FieldName | undefined;
    if (firstInvalid) {
      requestAnimationFrame(() => document.getElementById(FIELD_IDS[firstInvalid])?.focus());
      return;
    }
    setBusy(true);
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

  const toggleIn = (field: "standard" | "premium", key: PackageTemplate) =>
    set(field, form[field].includes(key) ? form[field].filter((item) => item !== key) : [...form[field], key]);

  const renderTemplatePanel = () => {
    const counts = templateCounts(form);
    const tierBox = (
      title: string,
      hint: string,
      modes: { value: string; label: string; checked: boolean; onSelect: () => void }[],
      keys: readonly PackageTemplate[],
      field: "standard" | "premium",
      showKeys: boolean,
      lead?: string,
    ) => (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
        <div role="radiogroup" aria-label={title} className="mt-3 flex flex-wrap gap-2">
          {modes.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                mode.checked ? "border-primary bg-primary-soft text-primary-text" : "border-border text-foreground hover:bg-surface-2",
              )}
            >
              <input type="radio" name={`tpl-${field}`} checked={mode.checked} onChange={mode.onSelect} className="sr-only" />
              {mode.label}
            </label>
          ))}
        </div>
        {showKeys ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {lead ? (
              <li>
                <label className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-2.5 text-sm text-muted-foreground">
                  <input type="checkbox" checked disabled className="size-4 shrink-0 accent-primary" />
                  {lead}
                </label>
              </li>
            ) : null}
            {keys.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground hover:bg-surface-2/60">
                  <input
                    type="checkbox"
                    checked={form[field].includes(key)}
                    onChange={() => toggleIn(field, key)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  {t(`template.${key}`)}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );

    return (
      <div className="space-y-3 border-t border-dashed border-border bg-surface-2/40 px-5 py-4 ps-12">
        <p className="text-[13px] text-muted-foreground">{t("package.templatesHint")}</p>
        {tierBox(
          t("package.templatesStandard"),
          t("package.templatesStandardHint"),
          [
            { value: "all", label: t("package.tplAllStandard"), checked: form.standardAll, onSelect: () => set("standardAll", true) },
            { value: "choose", label: t("package.tplChoose"), checked: !form.standardAll, onSelect: () => set("standardAll", false) },
          ],
          STANDARD_TEMPLATES,
          "standard",
          !form.standardAll,
          t("package.templatesClassic"),
        )}
        {tierBox(
          t("package.templatesPremium"),
          t("package.templatesPremiumHint"),
          [
            { value: "none", label: t("package.tplNone"), checked: form.premiumMode === "none", onSelect: () => set("premiumMode", "none") },
            { value: "choose", label: t("package.tplChoose"), checked: form.premiumMode === "choose", onSelect: () => set("premiumMode", "choose") },
            { value: "all", label: t("package.tplAllPremium"), checked: form.premiumMode === "all", onSelect: () => set("premiumMode", "all") },
          ],
          PREMIUM_TEMPLATES,
          "premium",
          form.premiumMode === "choose",
        )}
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {t("package.templatesGives")}
          <Badge tone="neutral">{t("package.templatesStandardCount", { count: fmt.number(counts.standard) })}</Badge>
          <Badge tone="primary">{t("package.templatesPremiumCount", { count: fmt.number(counts.premium) })}</Badge>
        </p>
      </div>
    );
  };

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
            {key === "MENU_TEMPLATES" && form.features.includes(key) ? renderTemplatePanel() : null}
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
          {creating ? t("package.newTitle") : <bdi>{locale === "ar" ? pkg?.nameAr : pkg?.nameEn}</bdi>}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="package-name-ar">{t("package.nameAr")}</Label>
                  <Input
                    id="package-name-ar"
                    dir="rtl"
                    value={form.nameAr}
                    onChange={(event) => set("nameAr", event.target.value)}
                    placeholder={t("package.nameArPlaceholder")}
                    maxLength={80}
                    required
                    aria-invalid={Boolean(fieldErrors.nameAr)}
                    aria-describedby={fieldErrors.nameAr ? "package-name-ar-error" : undefined}
                    className={cn(fieldErrors.nameAr && "border-danger focus:border-danger focus:ring-danger/25")}
                  />
                  <FieldError controlId="package-name-ar" message={fieldErrors.nameAr} />
                </div>
                <div>
                  <Label htmlFor="package-name-en">{t("package.nameEn")}</Label>
                  <Input
                    id="package-name-en"
                    dir="ltr"
                    value={form.nameEn}
                    onChange={(event) => set("nameEn", event.target.value)}
                    placeholder={t("package.nameEnPlaceholder")}
                    maxLength={80}
                    required
                    aria-invalid={Boolean(fieldErrors.nameEn)}
                    aria-describedby={fieldErrors.nameEn ? "package-name-en-error" : undefined}
                    className={cn(fieldErrors.nameEn && "border-danger focus:border-danger focus:ring-danger/25")}
                  />
                  <FieldError controlId="package-name-en" message={fieldErrors.nameEn} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="package-description-ar">{t("package.descriptionAr")}</Label>
                  <textarea
                    id="package-description-ar"
                    dir="rtl"
                    value={form.descriptionAr}
                    onChange={(event) => set("descriptionAr", event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("package.descriptionArHint")}</p>
                </div>
                <div>
                  <Label htmlFor="package-description-en">{t("package.descriptionEn")}</Label>
                  <textarea
                    id="package-description-en"
                    dir="ltr"
                    value={form.descriptionEn}
                    onChange={(event) => set("descriptionEn", event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("package.descriptionEnHint")}</p>
                </div>
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
                            aria-invalid={Boolean(fieldErrors[field])}
                            aria-describedby={fieldErrors[field] ? `package-${field}-error` : undefined}
                            className={cn(
                              "pe-14 text-start",
                              fieldErrors[field] && "border-danger focus:border-danger focus:ring-danger/25",
                            )}
                          />
                          <span
                            dir="ltr"
                            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                          >
                            {currency}
                          </span>
                        </div>
                        <FieldError controlId={`package-${field}`} message={fieldErrors[field]} />
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
                      aria-invalid={Boolean(fieldErrors.offerPercent)}
                      aria-describedby={fieldErrors.offerPercent ? "package-offer-percent-error" : undefined}
                      className={cn(
                        "text-start",
                        fieldErrors.offerPercent && "border-danger focus:border-danger focus:ring-danger/25",
                      )}
                    />
                    <FieldError controlId="package-offer-percent" message={fieldErrors.offerPercent} />
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
                      aria-invalid={Boolean(fieldErrors.offerEndsAt)}
                      aria-describedby={fieldErrors.offerEndsAt ? "package-offer-ends-error" : undefined}
                      className={cn(
                        "text-start",
                        fieldErrors.offerEndsAt && "border-danger focus:border-danger focus:ring-danger/25",
                      )}
                    />
                    <FieldError controlId="package-offer-ends" message={fieldErrors.offerEndsAt} />
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
            {renderFeatureGroup(t("package.group.menu"), FEATURE_KEYS.filter((key) => !ORDERING_GROUP.includes(key)))}
            {renderFeatureGroup(
              t("package.group.ordering"),
              FEATURE_KEYS.filter((key) => ORDERING_GROUP.includes(key)),
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
                    <Alert tone="warning">
                      {t("package.deleteConfirm", { name: locale === "ar" ? pkg.nameAr : pkg.nameEn })}
                    </Alert>
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
