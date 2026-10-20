"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/** The countries the team usually bills; anything else is typed as a two-letter code. */
export const COUNTRIES = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "IQ", "LY", "SD", "MA", "DZ", "TN", "US", "GB"] as const;
const OTHER = "__other";

/**
 * A country as its two-letter code (DEC-049: Egypt is billed in EGP, every other country in USD). A short
 * list of the usual ones, with "Other..." revealing a code field. Names follow the console language.
 */
export function CountrySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** The two-letter code ("" while a custom code is being typed). */
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const names = useMemo(() => new Intl.DisplayNames(locale === "ar" ? "ar" : "en", { type: "region" }), [locale]);
  const known = (COUNTRIES as readonly string[]).includes(value);
  const [custom, setCustom] = useState(!known && value !== "");

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        id={id}
        value={custom ? OTHER : value}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === OTHER) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(event.target.value);
          }
        }}
        className="min-w-[180px] flex-1"
      >
        {COUNTRIES.map((code) => (
          <option key={code} value={code}>
            {names.of(code) ?? code}
          </option>
        ))}
        <option value={OTHER}>{t("billing.countryOther")}</option>
      </Select>
      {custom ? (
        <Input
          aria-label={t("billing.countryCode")}
          placeholder={t("billing.countryCode")}
          dir="ltr"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase().slice(0, 2))}
          maxLength={2}
          disabled={disabled}
          className="w-32 text-start uppercase"
        />
      ) : null}
    </div>
  );
}
