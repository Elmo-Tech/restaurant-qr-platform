import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../lib/auth/session';
import { canViewMenu } from '../../../../lib/menu/capabilities';
import { Alert } from '../../../../components/ui/Alert';
import { Card } from '../../../../components/ui/Card';

interface RestaurantLandingPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * Section 16 (Batch G) / Section 4 (Batch H) proof-of-foundation screen: the
 * URL `restaurantId` is the explicit selected-Restaurant identifier
 * (Section 9), validated here only against the same Backend-authorized
 * `memberships` list every other Staff screen uses -- this is not
 * frontend-invented authorization, it is the Backend's own access decision.
 * Every feature request against this Restaurant (Menu, Orders, ...) still
 * goes through its own `RestaurantAccessGuard`-protected endpoint
 * independently.
 *
 * `currencyCode`/`defaultLocale` (Batch G0) are shown as contextual
 * information only (Section 25) -- no locale editor, no currency formatter.
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
        canViewMenu(membership) ? (
          <Link href={`/staff/restaurants/${restaurantId}/menu`}>
            <Card className="transition-colors hover:border-[#7A5138]">
              <p className="text-sm font-medium text-[#302C29]">
                Menu Management
              </p>
              <p className="mt-1 text-sm text-[#655D56]">
                Manage Menus, Categories, and Products.
              </p>
            </Card>
          </Link>
        ) : (
          <Card>
            <p className="text-sm font-medium text-[#302C29]">
              Menu Management
            </p>
            <p className="mt-1 text-sm text-[#655D56]">
              You do not have permission to view this Restaurant&apos;s Menu.
            </p>
          </Card>
        )
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
