import { cookies, headers } from 'next/headers';
import { directionOf, resolveStaffLocale, STAFF_LOCALE_COOKIE, type StaffLocale } from './locale';
import { createTranslator, type Translator } from './translate';

export interface StaffI18n extends Translator {
  dir: 'ltr' | 'rtl';
}

/** The Staff UI locale for this request: the saved cookie, else the browser's preferred Arabic/English, else English. */
export async function getStaffLocale(): Promise<StaffLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveStaffLocale(
    cookieStore.get(STAFF_LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );
}

/** Server Components: `const { t } = await getStaffI18n();` */
export async function getStaffI18n(): Promise<StaffI18n> {
  const locale = await getStaffLocale();
  return { ...createTranslator(locale), dir: directionOf(locale) };
}
