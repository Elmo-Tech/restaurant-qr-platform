import { StaffI18nProvider } from '../../../lib/i18n/client';
import { getStaffI18n } from '../../../lib/i18n/server';
import { AuthShell } from '../../../components/auth/AuthShell';
import { DemoEnter } from './DemoEnter';

interface DemoPageProps {
  params: Promise<{ token: string }>;
}

/**
 * The secret link of a temporary demo restaurant (DEC-060). It carries no authority by itself: the page only hands the
 * token to the Backend, which decides and sets the session cookie.
 */
export default async function DemoPage({ params }: DemoPageProps) {
  const [{ token }, { locale }] = await Promise.all([params, getStaffI18n()]);
  return (
    <StaffI18nProvider locale={locale}>
      <AuthShell>
        <DemoEnter token={token} />
      </AuthShell>
    </StaffI18nProvider>
  );
}
