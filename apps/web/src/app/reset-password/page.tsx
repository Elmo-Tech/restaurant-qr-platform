import type { Metadata } from 'next';
import { StaffI18nProvider } from '../../lib/i18n/client';
import { getStaffI18n } from '../../lib/i18n/server';
import { AuthShell } from '../../components/auth/AuthShell';
import { ResetPasswordForm } from './ResetPasswordForm';

// The reset link carries a one-time token in its query string; keep it out of
// the `Referer` header of anything this page might link to.
export const metadata: Metadata = {
  referrer: 'no-referrer',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * `/reset-password?token=...` (FT-12). The token comes from the reset link
 * (the Backend contract is a body field, so the form posts it -- it is never
 * echoed back into the page). Anyone with a link may open this page whether
 * or not they are signed in; the Backend alone decides if the token is valid.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const [{ token }, { t, locale }] = await Promise.all([searchParams, getStaffI18n()]);
  const resolvedToken = Array.isArray(token) ? token[0] : token;

  return (
    <StaffI18nProvider locale={locale}>
      <AuthShell title={t('auth.reset.title')} description={t('auth.reset.description')}>
        <ResetPasswordForm token={resolvedToken ?? null} />
      </AuthShell>
    </StaffI18nProvider>
  );
}
