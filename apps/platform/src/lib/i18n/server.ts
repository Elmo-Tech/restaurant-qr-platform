import { cookies, headers } from "next/headers";
import { directionOf, LOCALE_COOKIE, resolveLocale, type Locale } from "./locale";
import { createTranslate, type Translate } from "./translate";

export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
}

/** Server Components: `const { t } = await getI18n();` */
export async function getI18n(): Promise<{ locale: Locale; dir: "ltr" | "rtl"; t: Translate }> {
  const locale = await getLocale();
  return { locale, dir: directionOf(locale), t: createTranslate(locale) };
}
