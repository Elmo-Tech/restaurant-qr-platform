import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../lib/auth/session';
import { Alert } from '../../../../components/ui/Alert';
import { Card } from '../../../../components/ui/Card';

interface RestaurantLandingPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * Section 16 proof-of-foundation screen: the URL `restaurantId` is the
 * explicit selected-Restaurant identifier (Section 9), validated here only
 * against the same Backend-authorized `memberships` list every other Staff
 * screen uses -- this is not frontend-invented authorization, it is the
 * Backend's own access decision. Every future feature request against this
 * Restaurant (Menu, Orders, ...) still goes through its own
 * RestaurantAccessGuard-protected endpoint independently.
 *
 * `currencyCode`/`defaultLocale` are intentionally omitted: `GET /auth/me`
 * does not expose them and no Backend Restaurant-details endpoint exists
 * yet (see Batch G review package) -- inventing one was explicitly out of
 * scope for this foundation.
 *
 * A non-`ACTIVE` Restaurant status (`INACTIVE`/`SUSPENDED`, already exposed
 * by `GET /auth/me`) renders a non-operational state instead of the normal
 * feature entry point (targeted fix, Section 3) -- UX only; the Backend's
 * `RestaurantAccessGuard` remains the actual authorization/operational
 * authority for every real request a future feature page makes.
 */
export default async function RestaurantLandingPage({
  params,
}: RestaurantLandingPageProps) {
  const { restaurantId } = await params;
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return <Alert variant="error">Restaurant not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-[#1D1A18]">
          {membership.restaurant.name}
        </h1>
        <p className="text-sm text-[#655D56]">
          {membership.role} · {membership.restaurant.status}
        </p>
      </div>

      {membership.restaurant.status === 'ACTIVE' ? (
        <Card>
          <p className="text-sm font-medium text-[#302C29]">Menu Management</p>
          <p className="mt-1 text-sm text-[#655D56]">Coming next.</p>
        </Card>
      ) : (
        <Alert variant="error">
          This Restaurant is currently{' '}
          {membership.restaurant.status === 'SUSPENDED'
            ? 'suspended'
            : 'inactive'}{' '}
          and not operational. Contact your Restaurant owner for details.
        </Alert>
      )}
    </div>
  );
}
