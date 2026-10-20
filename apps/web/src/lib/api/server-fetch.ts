import { headers } from 'next/headers';
import { SERVER_API_BASE_URL } from './config';

/**
 * The visitor's address chain, passed on to the API. Every server-side call would otherwise reach the API from
 * this server's own address, and the API's per-IP rate limit (`TRUST_PROXY_HOPS` counts from the right) would
 * treat all visitors as one. Read from the proxy in front of this server; absent in local development.
 */
export function forwardedForHeader(incomingHeaders: Headers): Record<string, string> {
  const chain = incomingHeaders.get('x-forwarded-for');
  return chain ? { 'x-forwarded-for': chain } : {};
}

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
    response = await fetch(`${SERVER_API_BASE_URL}${path}`, {
      method: 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...forwardedForHeader(incomingHeaders) },
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
