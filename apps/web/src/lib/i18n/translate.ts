import type { StaffLocale } from './locale';
import { messages, type MessageKey, type PluralBase } from './messages';

export type MessageParams = Record<string, string | number>;

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export interface Translator {
  locale: StaffLocale;
  /** Looks up a message; `{name}` placeholders are filled from `params`. */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Countable phrase: picks `<base>.<plural category>` for the locale (falling back to `<base>.other`), with `{count}` filled in. */
  tp: (base: PluralBase, count: number, params?: MessageParams) => string;
}

/**
 * One translator per locale, used identically by Server Components
 * (`getStaffI18n`), Client Components (`useStaffI18n`) and plain helpers.
 * A missing Arabic entry cannot happen (compile-time parity), but a runtime
 * miss would fall back to English rather than render a raw key.
 */
export function createTranslator(locale: StaffLocale): Translator {
  const dictionary = messages[locale] as Record<string, string>;
  const english = messages.en as Record<string, string>;
  const pluralRules = new Intl.PluralRules(locale);

  const t = (key: MessageKey, params?: MessageParams): string =>
    interpolate(dictionary[key] ?? english[key] ?? key, params);

  const tp = (base: PluralBase, count: number, params?: MessageParams): string => {
    const category = pluralRules.select(count);
    const key = `${base}.${category}`;
    const template =
      dictionary[key] ?? dictionary[`${base}.other`] ?? english[key] ?? english[`${base}.other`] ?? base;
    return interpolate(template, { count, ...params });
  };

  return { locale, t, tp };
}

/**
 * The Staff locale for code that has no React context (plain async helpers
 * such as `describeError`). The client provider mirrors the active locale onto
 * `<html lang>`; on the server (or before mount) this is English.
 */
export function currentClientLocale(): StaffLocale {
  if (typeof document === 'undefined') return 'en';
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
}
