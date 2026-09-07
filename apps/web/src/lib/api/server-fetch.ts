import { headers } from 'next/headers';
import { API_BASE_URL } from './config';

export type ServerApiResult<TData> =
  | { ok: true; data: TData }
  // A real HTTP response was received but was non-2xx.
  | { ok: false; status: number }
  // `fetch` itself failed (network failure, Backend unreachable) or the
  // response body was not the expected JSON shape -- there is no HTTP
  // status to report. Callers must not conflate this with a `401`
  // (Batch G targeted fix, Section 2): only a real `401` means
  // unauthenticated.
  | { ok: false; status: null };

/**
 * Server Component read-only transport (Batch G foundation). Forwards the
 * visiting browser's raw `Cookie` header verbatim to the Backend -- this is
 * a standard SSR auth-check pattern, not a CSRF concern: `CsrfGuard` only
 * validates unsafe methods (AUTH_TENANCY_SPEC.md #106), and this helper is
 * GET-only. Unsafe mutations must never use this helper; they belong in
 * `apiFetch` (client.ts), issued as a genuine browser request.
 *
 * `cache: 'no-store'` -- session/authorization state must never be served
 * from Next's Data Cache. Within one render pass, Next's Request
 * Memoization already dedupes identical calls (e.g. the Staff layout and a
 * page both reading `/auth/me`), so no manual caching/context plumbing is
 * needed for that.
 */
export async function serverApiGet<TData>(
  path: string,
): Promise<ServerApiResult<TData>> {
  const incomingHeaders = await headers();
  const cookie = incomingHeaders.get('cookie');

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: null };
  }

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const body = (await response.json().catch(() => null)) as {
    data: TData;
  } | null;

  if (!body) {
    return { ok: false, status: null };
  }

  return { ok: true, data: body.data };
}
