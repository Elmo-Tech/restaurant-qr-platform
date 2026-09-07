import { ApiError } from '../api/errors';

const HTTP_UNAUTHENTICATED = 401;

/**
 * Safe, user-facing text for any thrown value (Section 23/CLAUDE.md #63):
 * a Backend `ApiError` already carries a safe `message`; anything else
 * (network failure, unexpected exception) becomes a generic message --
 * never a raw stack trace or error object.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Unable to reach the server. Please try again.';
}

/**
 * A real `401` from any Menu/Category/Product browser request means the
 * Staff session expired or was revoked after this page already rendered
 * (`StaffLayout` only checks auth at Server render/navigation time).
 * Deliberately broad: any `401` status counts, regardless of its `code` --
 * this helper does not, and must not, try to special-case
 * `INVALID_CREDENTIALS` versus `UNAUTHENTICATED` by code alone, since a
 * `401` is a `401`.
 *
 * This is safe from misfiring on `POST /auth/login`'s own
 * `401 INVALID_CREDENTIALS` for a narrower reason than "the code differs":
 * this helper is Menu/Category/Product-specific and is never called from
 * the Login flow at all -- `LoginForm` handles its own `ApiError` directly
 * (see `apps/web/src/app/login/LoginForm.tsx`) without going through
 * `isUnauthenticatedError`/`redirectToLogin`. If this helper's `error.code
 * === 'UNAUTHENTICATED'` check were ever reached with a genuine
 * `INVALID_CREDENTIALS` error, it would still return `true` on the
 * `error.status === 401` branch alone -- the safety here comes entirely
 * from call-site scope, not from the code check.
 */
export function isUnauthenticatedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === HTTP_UNAUTHENTICATED || error.code === 'UNAUTHENTICATED')
  );
}

/**
 * A full browser navigation (not a Next.js client-side route transition) --
 * this guarantees `/login`'s Server Component re-runs the real session
 * bootstrap (`getAuthSessionState()`) against current cookies, exactly as a
 * fresh visit would, rather than depending on any client-held state. This is
 * a deliberate, narrow exception to `next/no-location-assign-relative-
 * destination`: `useRouter().push()` would require threading a router
 * instance into this plain helper (and every Menu/Category/Product panel
 * that calls it), for no benefit here -- a hard navigation to `/login` is
 * exactly the desired behavior on session expiry, not a soft client
 * transition.
 */
export function redirectToLogin(): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
}
