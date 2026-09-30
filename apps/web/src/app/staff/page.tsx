import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';
import { LogoutButton } from './LogoutButton';
import { StaffLanguageSwitcher } from '../../components/staff/StaffLanguageSwitcher';
import { getStaffI18n } from '../../lib/i18n/server';

/**
 * Restaurant discovery/selection (Section 8): the Backend-authorized
 * `memberships` list from `GET /auth/me` is the only source of accessible
 * Restaurants -- never a hard-coded or seeded id. Zero/one/many are each
 * handled deterministically; Backend access checks remain authoritative for
 * every subsequent Restaurant-scoped request.
 *
 * A Backend/session-check failure renders a service-error state rather than
 * a false `/login` redirect (targeted fix, Section 2) -- `StaffLayout`
 * already handles the top-level auth gate, but this page re-derives the
 * same state independently rather than trusting an implicit parent
 * guarantee, and must apply the identical unauthenticated/error distinction.
 *
 * UX-1: this page has no Restaurant context yet, so it is deliberately kept
 * outside the new sidebar workspace shell (Section 9 -- "Do NOT redesign the
 * full Restaurant-selector experience in UX-1"). It now renders its own
 * light identity/logout header directly, since that chrome moved out of the
 * parent `StaffLayout` to avoid a duplicate header once Restaurant-scoped
 * routes gained their own full shell.
 */
export default async function StaffHomePage() {
  const [sessionState, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Alert variant="error">{sessionState.message}</Alert>
      </div>
    );
  }

  const { user, memberships } = sessionState.context;

  if (memberships.length === 1) {
    redirect(`/staff/restaurants/${memberships[0].restaurant.id}`);
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <span className="text-sm font-semibold text-secondary-foreground">
          {t('shell.productName')}
        </span>
        <div className="flex items-center gap-4">
          <StaffLanguageSwitcher />
          <span dir="ltr" className="text-sm text-muted-foreground">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {memberships.length === 0 ? (
          <Alert variant="info">
            {t('guard.noRestaurants')}
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold text-foreground">
              {t('staffHome.yourRestaurants')}
            </h1>
            <ul className="flex flex-col gap-3">
              {memberships.map((membership) => (
                <li key={membership.id}>
                  <Link href={`/staff/restaurants/${membership.restaurant.id}`}>
                    <Card className="transition-colors hover:border-primary">
                      <p dir="auto" className="font-medium text-foreground">
                        {membership.restaurant.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(`role.${membership.role}` as const)} ·{' '}
                        {membership.restaurant.status === 'ACTIVE'
                          ? t('common.active')
                          : membership.restaurant.status === 'SUSPENDED'
                            ? t('common.suspended')
                            : t('common.inactive')}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
