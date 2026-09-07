import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';

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
 */
export default async function StaffHomePage() {
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const { memberships } = sessionState.context;

  if (memberships.length === 0) {
    return (
      <Alert variant="info">
        You do not have access to any Restaurant yet. Contact your Restaurant
        owner for an invitation.
      </Alert>
    );
  }

  if (memberships.length === 1) {
    redirect(`/staff/restaurants/${memberships[0].restaurant.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#1D1A18]">Your Restaurants</h1>
      <ul className="flex flex-col gap-3">
        {memberships.map((membership) => (
          <li key={membership.id}>
            <Link href={`/staff/restaurants/${membership.restaurant.id}`}>
              <Card className="transition-colors hover:border-[#7A5138]">
                <p className="font-medium text-[#1D1A18]">
                  {membership.restaurant.name}
                </p>
                <p className="text-sm text-[#655D56]">
                  {membership.role} · {membership.restaurant.status}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
