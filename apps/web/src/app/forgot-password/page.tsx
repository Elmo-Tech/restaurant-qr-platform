import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { StaffI18nProvider } from '../../lib/i18n/client';
import { getStaffI18n } from '../../lib/i18n/server';
import { AuthShell } from '../../components/auth/AuthShell';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/**
 * `/forgot-password` (FT-12): a public page like `/login`. An already
 * signed-in User is sent into the Staff area instead -- they change their
 * password from Account. A session-check failure never blocks the form.
 */
export default async function ForgotPasswordPage() {
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'authenticated') {
    redirect('/staff');
  }

  const { t, locale } = await getStaffI18n();

  return (
    <StaffI18nProvider locale={locale}>
      <AuthShell title={t('auth.forgot.title')} description={t('auth.forgot.description')}>
        <ForgotPasswordForm />
      </AuthShell>
    </StaffI18nProvider>
  );
}
