/**
 * Direct-browser-to-API base URL, as in the restaurant web app: the Backend allows this app's origin
 * through `PLATFORM_ORIGIN` + credentialed CORS, so the browser calls the API itself (a mutation must be
 * a real browser request carrying the non-spoofable Origin header the Backend checks).
 * `NEXT_PUBLIC_*` values are inlined at build time only when written as literal dotted expressions.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH;

if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env first.");
}
if (!apiBasePath) {
  throw new Error("NEXT_PUBLIC_API_BASE_PATH is not set. Copy .env.example to .env first.");
}

/** `{origin}/api/v1` */
export const API_BASE_URL = apiUrl + apiBasePath;
/** Every platform route lives under this prefix (DEC-045). */
export const PLATFORM_API = `${API_BASE_URL}/platform`;

/**
 * Where SERVER-SIDE code reaches the API. Production sets `API_INTERNAL_URL` (for example `http://api:4000`) so
 * the Next.js server calls the API over the private network instead of going out through the public proxy; it
 * is server-only and runtime-only (not a `NEXT_PUBLIC_*` variable, so never inlined into browser code). Unset,
 * the public URL is used (local development).
 */
const internalUrl = typeof window === "undefined" ? process.env.API_INTERNAL_URL : undefined;
export const SERVER_PLATFORM_API = `${internalUrl ? internalUrl.replace(/\/+$/, "") : apiUrl}${apiBasePath}/platform`;
