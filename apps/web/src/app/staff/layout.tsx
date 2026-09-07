import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { Alert } from '../../components/ui/Alert';
import { LogoutButton } from './LogoutButton';

/**
 * Protected Staff shell (Section 7/14). This is a UX/navigation boundary,
 * not the security boundary -- every Restaurant-scoped Backend endpoint
 * still enforces its own guards independently (CLAUDE.md #21/#82). Session
 * state is re-derived from `GET /auth/me` on every request, so a hard
 * refresh or direct deep link behaves identically to client navigation
 * (Section 23).
 *
 * Only a genuine `'unauthenticated'` result redirects to `/login`. A
 * `'error'` result (Backend unreachable/failing) renders a deterministic
 * service-error state instead -- a User with a perfectly valid session must
 * never be bounced to Login just because `/auth/me` timed out or 5xx'd
 * (targeted fix, Section 2).
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <Alert variant="error">{sessionState.message}</Alert>
      </div>
    );
  }

  const { context } = sessionState;

  return (
    <div className="min-h-screen bg-[#F8F5F1]">
      <header className="flex items-center justify-between border-b border-[#E5DED6] bg-white px-6 py-3">
        <span className="text-sm font-semibold text-[#302C29]">
          Restaurant QR Platform
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#655D56]">{context.user.email}</span>
          <LogoutButton />
        </div>
      </header>
      {/* Batch H, Section 7: widened from max-w-4xl -- the Menu Management
          three-column workspace needs more room than the earlier
          single-column Staff screens. A small targeted adjustment, not a
          shell redesign. */}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
