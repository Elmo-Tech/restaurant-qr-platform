import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { Alert } from '../../components/ui/Alert';

/**
 * Protected Staff auth gate (Section 7/14). This is a UX/navigation
 * boundary, not the security boundary -- every Restaurant-scoped Backend
 * endpoint still enforces its own guards independently (CLAUDE.md #21/#82).
 * Session state is re-derived from `GET /auth/me` on every request, so a
 * hard refresh or direct deep link behaves identically to client navigation
 * (Section 23).
 *
 * Only a genuine `'unauthenticated'` result redirects to `/login`. A
 * `'error'` result (Backend unreachable/failing) renders a deterministic
 * service-error state instead -- a User with a perfectly valid session must
 * never be bounced to Login just because `/auth/me` timed out or 5xx'd
 * (targeted fix, Section 2).
 *
 * UX-1: this layout no longer renders any header/identity chrome itself --
 * that moved to the Restaurant selector page (`/staff`, which has no
 * Restaurant context yet) and to `StaffShell` (for every
 * `/staff/restaurants/[restaurantId]/...` route, which now gets the full
 * sidebar/topbar workspace shell). Keeping both here would have produced two
 * stacked headers on every Restaurant-scoped page.
 */
export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F5F1] px-4">
        <Alert variant="error">{sessionState.message}</Alert>
      </div>
    );
  }

  return <div className="min-h-screen bg-[#F8F5F1]">{children}</div>;
}
