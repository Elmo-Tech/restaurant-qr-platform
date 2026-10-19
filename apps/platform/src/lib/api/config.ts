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
