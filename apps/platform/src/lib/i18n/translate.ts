import { MESSAGES, type MessageKey } from "./messages";
import type { Locale } from "./locale";

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslate(locale: Locale): Translate {
  const table = MESSAGES[locale];
  return (key, params) => {
    const text = table[key];
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

/** Numbers and dates in the console language (Latin digits in both: easier to compare figures). */
export function createFormatters(locale: Locale) {
  const tag = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const number = new Intl.NumberFormat(tag);
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
  const money = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    number: (value: number) => number.format(value),
    /** A price string from the API for display only (never used for calculation). */
    money: (value: string) => money.format(Number(value)),
    date: (value: string | Date) => date.format(new Date(value)),
    dateTime: (value: string | Date) => dateTime.format(new Date(value)),
  };
}
