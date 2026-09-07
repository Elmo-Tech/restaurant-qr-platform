import { serverApiGet } from '../api/server-fetch';
import type { AuthContext } from './types';

const HTTP_UNAUTHENTICATED = 401;

export type AuthSessionState =
  | { status: 'authenticated'; context: AuthContext }
  | { status: 'unauthenticated' }
  | { status: 'error'; httpStatus?: number; message: string };

/**
 * Session bootstrap for Server Components (Batch G foundation, Section 6/23;
 * corrected in the targeted fix, Section 2): the Backend's `GET /auth/me` is
 * the sole source of truth for authenticated/unauthenticated/current-user
 * state. Never inferred from localStorage, a UI boolean, or cookie-name
 * guessing. Re-derived on every request (including a hard refresh or deep
 * link), so protected pages never depend on transient client-side React
 * state.
 *
 * Critically, an arbitrary non-2xx (Backend 500/503, or the request never
 * reaching the Backend at all) is NOT the same thing as "unauthenticated" --
 * only a genuine `401` means that. Collapsing every failure into "logged
 * out" would falsely bounce a User with a perfectly valid session to
 * `/login` during a transient Backend outage. Callers must branch on
 * `status` and render the `'error'` case as a deterministic, understandable
 * service error -- never as a login redirect.
 */
export async function getAuthSessionState(): Promise<AuthSessionState> {
  const result = await serverApiGet<AuthContext>('/auth/me');

  if (result.ok) {
    return { status: 'authenticated', context: result.data };
  }

  if (result.status === HTTP_UNAUTHENTICATED) {
    return { status: 'unauthenticated' };
  }

  return {
    status: 'error',
    httpStatus: result.status ?? undefined,
    message: 'Unable to verify your session right now. Please try again shortly.',
  };
}
