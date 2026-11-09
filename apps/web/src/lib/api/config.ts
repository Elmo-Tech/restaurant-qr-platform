/**
 * Direct-browser-to-API base URL (Batch G foundation decision, see review
 * package): the Backend already supports a genuine cross-origin browser
 * client via explicit `CORS_ORIGIN` + `credentials: true`, so the Staff
 * frontend calls it directly rather than through a Next.js proxy/BFF.
 * `NEXT_PUBLIC_API_BASE_PATH` already existed in the repository's env
 * convention; `NEXT_PUBLIC_API_URL` is the one new variable this batch adds.
 */
// Next.js statically replaces `process.env.NEXT_PUBLIC_*` at build time only
// when the literal dotted expression appears in source -- a dynamic
// `process.env[name]` lookup would not be inlined into the browser bundle,
// so each variable is read explicitly here.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH;

if (!apiUrl) {
  throw new Error(
    'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env first.',
  );
}
if (!apiBasePath) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_PATH is not set. Copy .env.example to .env first.',
  );
}

export const API_BASE_URL = apiUrl + apiBasePath;
export const API_BASE_PATH = apiBasePath;

/**
 * Where SERVER-SIDE code (Server Components, route handlers) reaches the API. In production the browser talks
 * to the public same-origin URL above, but the Next.js server sits on the same private network as the API and
 * should not leave it (no DNS or TLS round trip through the public proxy): set `API_INTERNAL_URL` (for example
 * `http://api:4000`) and server code uses it. It is read only on the server (it is not a `NEXT_PUBLIC_*`
 * variable, so it is never inlined into browser JavaScript) and only at runtime. Unset, the public URL is used,
 * which is what local development does.
 */
const internalUrl = typeof window === 'undefined' ? process.env.API_INTERNAL_URL : undefined;
export const SERVER_API_BASE_URL = (internalUrl ? internalUrl.replace(/\/+$/, '') : apiUrl) + apiBasePath;

/**
 * The bare API origin, without the versioned `/api/v1` prefix (FT-2,
 * Section 18) -- Product/Category image assets are served from
 * `${API_ORIGIN}/media/...`, a static route deliberately mounted outside
 * the API version prefix (see `apps/api/src/main.ts`), never from
 * `API_BASE_URL`.
 */
export const API_ORIGIN = apiUrl;
