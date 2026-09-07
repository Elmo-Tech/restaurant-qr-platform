import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../lib/auth/session';
import { LoginForm } from './LoginForm';

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
 */
export default async function LoginPage() {
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'authenticated') {
    redirect('/staff');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-[#1D1A18]">
          Restaurant QR Platform
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
