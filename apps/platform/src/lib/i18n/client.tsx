"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { directionOf, LOCALE_COOKIE, type Locale } from "./locale";
import { createFormatters, createTranslate, type Translate } from "./translate";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translate;
  fmt: ReturnType<typeof createFormatters>;
  /** Saves the preference in a cookie and re-renders the server components in the new language. */
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Provides the console language to every client component. `locale` comes from the server, so the first paint is already right. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      router.refresh();
    },
    [router],
  );
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: directionOf(locale),
      t: createTranslate(locale),
      fmt: createFormatters(locale),
      setLocale,
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider.");
  return value;
}
