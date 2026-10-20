import type { Metadata } from 'next';
import { Landing } from './_landing/Landing';
import { LANDING_COPY } from './_landing/copy';
import { getLandingPlans } from './_landing/plans-api';
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
export default async function Home() {
  const [locale, plans] = await Promise.all([getStaffLocale(), getLandingPlans()]);
  return <Landing locale={locale} plans={plans} />;
}
