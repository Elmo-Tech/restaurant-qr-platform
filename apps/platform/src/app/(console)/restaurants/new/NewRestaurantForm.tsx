"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CountrySelect } from "@/components/country-select";
import { IconArrowLeft } from "@/components/icons";
import { Alert, Button, Card, CardHeader, Input, Label, PageHeader, Select } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { packageErrorKey } from "@/lib/api/package-errors";
import { createRestaurant, listPackages, type PackageSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  restaurantName: string;
  branchName: string;
  defaultLocale: "ar" | "en";
  currencyCode: string;
  timezone: string;
  countryCode: string;
  ownerEmail: string;
  ownerPassword: string;
  packageId: string;
}

const INITIAL: FormState = {
  restaurantName: "",
  branchName: "",
  defaultLocale: "ar",
  currencyCode: "EGP",
  timezone: "Africa/Cairo",
  countryCode: "EG",
  ownerEmail: "",
  ownerPassword: "",
  packageId: "",
};

export function NewRestaurantForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // The problem is kept as a message key, so a language switch re-translates it.
  const [problem, setProblem] = useState<MessageKey | "network" | "session" | "other" | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listPackages()
      .then((loaded) => {
        if (!cancelled) setPackages(loaded.filter((pkg) => pkg.status === "ACTIVE"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  function validate(): MessageKey | null {
    const name = form.restaurantName.trim();
    if (name.length < 2 || name.length > 100) return "restaurantNew.err.name";
    if (form.branchName.trim() === "") return "restaurantNew.err.branch";
    if (!EMAIL.test(form.ownerEmail.trim())) return "restaurantNew.err.email";
    if (form.ownerPassword.length < 8) return "restaurantNew.err.password";
    if (!/^[A-Za-z]{3}$/.test(form.currencyCode.trim())) return "restaurantNew.err.currency";
    if (!/^[A-Za-z]{2}$/.test(form.countryCode.trim())) return "restaurantNew.err.country";
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validate();
    setServerProblems([]);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const created = await createRestaurant({
        restaurantName: form.restaurantName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerPassword: form.ownerPassword,
        branchName: form.branchName.trim(),
        defaultLocale: form.defaultLocale,
        currencyCode: form.currencyCode.trim().toUpperCase(),
        timezone: form.timezone.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
        packageId: form.packageId === "" ? null : form.packageId,
      });
      router.push(`/restaurants/${created.id}`);
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError) {
        if (caught.code === "OWNER_EMAIL_IN_USE") return setProblem("restaurantNew.err.emailInUse");
        if (caught.code === "RESTAURANT_ALREADY_EXISTS") return setProblem("restaurantNew.err.exists");
        if (caught.code === "RESTAURANT_INVALID") {
          setServerProblems(caught.problems);
          return setProblem("restaurantNew.err.invalid");
        }
        const packageKey = packageErrorKey(caught);
        if (packageKey) return setProblem(packageKey);
        return setProblem(caught.status === 401 ? "session" : "other");
      }
      setProblem(isNetworkFailure(caught) ? "network" : "other");
    }
  }

  const problemText =
    problem === null
      ? null
      : problem === "network"
        ? t("common.unreachable")
        : problem === "session"
          ? t("common.sessionExpired")
          : problem === "other"
            ? t("common.error")
            : t(problem);

  return (
    <>
      <Link href="/restaurants" className="mb-4 inline-flex items-center gap-2 text-sm text-primary-text hover:underline">
        <IconArrowLeft className="rtl:rotate-180" width={16} height={16} />
        {t("detail.back")}
      </Link>
      <PageHeader title={t("restaurantNew.title")} description={t("restaurantNew.subtitle")} />

      {problemText ? (
        <Alert tone="danger" className="mb-4">
          {problemText}
          {serverProblems.length > 0 ? (
            <ul className="mt-1 list-disc ps-5">
              {serverProblems.map((text) => (
                <li key={text} dir="ltr" className="text-start">
                  {text}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className="max-w-3xl space-y-6" noValidate autoComplete="off">
        <Card>
          <CardHeader title={t("restaurantNew.restaurantSection")} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="r-name">{t("restaurantNew.name")}</Label>
              <Input id="r-name" value={form.restaurantName} onChange={(e) => set("restaurantName", e.target.value)} maxLength={100} required />
            </div>
            <div>
              <Label htmlFor="r-branch">{t("restaurantNew.branch")}</Label>
              <Input id="r-branch" value={form.branchName} onChange={(e) => set("branchName", e.target.value)} maxLength={100} required />
            </div>
            <div>
              <Label htmlFor="r-package">{t("restaurantNew.package")}</Label>
              <Select id="r-package" value={form.packageId} onChange={(e) => set("packageId", e.target.value)}>
                <option value="">{t("detail.noPackage")}</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="r-language">{t("restaurantNew.language")}</Label>
              <Select id="r-language" value={form.defaultLocale} onChange={(e) => set("defaultLocale", e.target.value as "ar" | "en")}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="r-country">{t("restaurantNew.country")}</Label>
              <CountrySelect id="r-country" value={form.countryCode} onChange={(code) => set("countryCode", code)} />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("restaurantNew.countryHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="r-currency">{t("restaurantNew.currency")}</Label>
                <Input
                  id="r-currency"
                  dir="ltr"
                  value={form.currencyCode}
                  onChange={(e) => set("currencyCode", e.target.value.toUpperCase())}
                  maxLength={3}
                  className="text-start uppercase"
                />
              </div>
              <div>
                <Label htmlFor="r-timezone">{t("restaurantNew.timezone")}</Label>
                <Input id="r-timezone" dir="ltr" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className="text-start" />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("restaurantNew.ownerSection")} description={t("restaurantNew.ownerHint")} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="o-email">{t("restaurantNew.ownerEmail")}</Label>
              <Input
                id="o-email"
                type="email"
                dir="ltr"
                value={form.ownerEmail}
                onChange={(e) => set("ownerEmail", e.target.value)}
                autoComplete="off"
                className="text-start"
                required
              />
            </div>
            <div>
              <Label htmlFor="o-password">{t("restaurantNew.password")}</Label>
              <Input
                id="o-password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                value={form.ownerPassword}
                onChange={(e) => set("ownerPassword", e.target.value)}
                autoComplete="new-password"
                className="text-start"
                required
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{t("restaurantNew.passwordHint")}</p>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="accent-primary" />
                  {t("restaurantNew.showPassword")}
                </label>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("restaurantNew.submitting") : t("restaurantNew.submit")}
          </Button>
          <Button type="button" onClick={() => router.push("/restaurants")} disabled={busy}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </>
  );
}
