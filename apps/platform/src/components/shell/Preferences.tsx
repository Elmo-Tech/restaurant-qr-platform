"use client";

import { IconMonitor, IconMoon, IconSun } from "@/components/icons";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LOCALE_LABEL: Record<Locale, string> = { en: "EN", ar: "عربي" };

const SEGMENT = "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors";

/** Arabic / English switch. */
export function LanguageSwitch({ tone = "default" }: { tone?: "default" | "rail" }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.switch")}
      className={cn(
        "inline-flex rounded-lg border p-0.5",
        tone === "rail" ? "border-rail-border bg-rail-hover" : "border-border bg-surface-2",
      )}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          onClick={() => locale !== code && setLocale(code)}
          className={cn(
            SEGMENT,
            locale === code
              ? tone === "rail"
                ? "bg-rail-active text-rail-foreground"
                : "bg-surface text-foreground shadow-card"
              : tone === "rail"
                ? "text-rail-muted hover:text-rail-foreground"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LOCALE_LABEL[code]}
        </button>
      ))}
    </div>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; icon: typeof IconSun; label: "theme.light" | "theme.dark" | "theme.system" }[] = [
  { mode: "light", icon: IconSun, label: "theme.light" },
  { mode: "system", icon: IconMonitor, label: "theme.system" },
  { mode: "dark", icon: IconMoon, label: "theme.dark" },
];

/** Light / system / dark switch. */
export function ThemeSwitch({ tone = "default" }: { tone?: "default" | "rail" }) {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("theme.toggle")}
      className={cn(
        "inline-flex rounded-lg border p-0.5",
        tone === "rail" ? "border-rail-border bg-rail-hover" : "border-border bg-surface-2",
      )}
    >
      {THEME_OPTIONS.map(({ mode: option, icon: Icon, label }) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => setMode(option)}
          className={cn(
            SEGMENT,
            mode === option
              ? tone === "rail"
                ? "bg-rail-active text-rail-foreground"
                : "bg-surface text-foreground shadow-card"
              : tone === "rail"
                ? "text-rail-muted hover:text-rail-foreground"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon width={16} height={16} />
        </button>
      ))}
    </div>
  );
}
