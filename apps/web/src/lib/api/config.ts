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

/**
 * The bare API origin, without the versioned `/api/v1` prefix (FT-2,
 * Section 18) -- Product/Category image assets are served from
 * `${API_ORIGIN}/media/...`, a static route deliberately mounted outside
 * the API version prefix (see `apps/api/src/main.ts`), never from
 * `API_BASE_URL`.
 */
export const API_ORIGIN = apiUrl;
