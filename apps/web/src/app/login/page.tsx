import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { StaffI18nProvider } from '../../lib/i18n/client';
import { getStaffI18n } from '../../lib/i18n/server';
import { AuthShell } from '../../components/auth/AuthShell';
import { LoginForm } from './LoginForm';

interface LoginPageProps {
  searchParams: Promise<{ reset?: string }>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Server Component: deterministic on refresh/deep-link (Section 23) --
 * re-derives auth state from the Backend on every request rather than
 * trusting client-side state. An already-authenticated User visiting
 * `/login` directly is sent into the Staff flow instead of re-prompting.
 *
 * An `'error'` session state (Backend unreachable/failing) is treated the
 * same as `'unauthenticated'` here -- this page never requires a working
 * prior session check to let someone attempt to log in, so a bootstrap
 * failure must not block rendering the form itself.
 *
 * `?reset=success` is set by the Reset Password page after a successful reset
 * and only selects a friendly notice -- it carries no authority.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [sessionState, { reset }] = await Promise.all([getAuthSessionState(), searchParams]);

  if (sessionState.status === 'authenticated') {
    redirect('/staff');
  }

  const { locale } = await getStaffI18n();

  return (
    <StaffI18nProvider locale={locale}>
      <AuthShell>
        <LoginForm showResetSuccess={reset === 'success'} />
      </AuthShell>
    </StaffI18nProvider>
  );
}
