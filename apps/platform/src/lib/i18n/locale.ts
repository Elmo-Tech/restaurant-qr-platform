/** The console UI language (Arabic or English). Stored in a cookie so the server renders the right `lang` / `dir` on first paint. */
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "platform_ui_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** The cookie value, else the browser's preferred supported language (q-values respected), else English. */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage) {
    const best = acceptLanguage
      .split(",")
      .map((part, index) => {
        const [tag, ...params] = part.trim().split(";");
        const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        const weight = q ? Number.parseFloat(q.slice(2)) : 1;
        return { primary: tag.trim().toLowerCase().split("-")[0], weight: Number.isNaN(weight) ? 0 : weight, index };
      })
      .filter((candidate) => isLocale(candidate.primary) && candidate.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.index - b.index)[0];
    if (best) return best.primary as Locale;
  }
  return DEFAULT_LOCALE;
}
