import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getStaffLocale } from '../../lib/i18n/server';
import { Landing } from '../_landing-clay/Landing';
import { getLandingPlans } from '../_landing-clay/plans-api';
import { THEME_COOKIE } from '../_landing-clay/theme';

// A Claymorphism take on the landing page, kept beside the main one (`/`) for comparison. Not linked from anywhere.
export const metadata: Metadata = { title: 'Wayta — Landing (clay preview)', robots: { index: false, follow: false } };

export default async function Page() {
  const [locale, plans, cookieStore] = await Promise.all([getStaffLocale(), getLandingPlans(), cookies()]);
  const saved = cookieStore.get(THEME_COOKIE)?.value;
  return <Landing locale={locale} plans={plans} theme={saved === 'light' || saved === 'dark' ? saved : null} />;
}
