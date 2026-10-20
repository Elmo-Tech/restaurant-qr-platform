import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Landing } from './_landing/Landing';
import { LANDING_COPY } from './_landing/copy';
import { getLandingPlans } from './_landing/plans-api';
import { INTRO_COOKIE, shouldShowIntro } from './_landing/intro';
import { THEME_COOKIE } from './_landing/theme';
import { getStaffLocale } from '../lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStaffLocale();
  const { title, description } = LANDING_COPY[locale].meta;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', locale: locale === 'ar' ? 'ar_EG' : 'en_US' },
  };
}

/** The public landing page (DEC-053). Restaurant staff sign in from `/staff`. */
export default async function Home({ searchParams }: { searchParams: Promise<{ intro?: string | string[] }> }) {
  const [locale, plans, cookieStore] = await Promise.all([getStaffLocale(), getLandingPlans(), cookies()]);
  const saved = cookieStore.get(THEME_COOKIE)?.value;
  const { intro: introParam } = await searchParams;
  const intro = shouldShowIntro({ seenCookie: cookieStore.get(INTRO_COOKIE)?.value, param: Array.isArray(introParam) ? introParam[0] : introParam });
  return <Landing locale={locale} plans={plans} theme={saved === 'light' || saved === 'dark' ? saved : null} intro={intro} />;
}
