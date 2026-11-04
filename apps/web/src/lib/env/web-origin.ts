/**
 * FT-4: the Platform's own public Web origin -- used to build the exact
 * Guest Menu URL a QR encodes: `${webOrigin}/q/{slug}` for the Restaurant QR (DEC-066), `${webOrigin}/q/{publicCode}` for a Table QR.
 * Server-only, deliberately NOT a `NEXT_PUBLIC_*` variable (unlike
 * `lib/api/config.ts`'s `NEXT_PUBLIC_API_URL`): nothing here needs to run
 * in browser JS, only to be read once, server-side, in a Server Component
 * page and passed down as a plain prop -- so it never needs to be inlined
 * into the client bundle. `WEB_URL` already exists in `.env`/`.env.example`
 * (added for exactly this eventual purpose) but was unused until now.
 * Never hardcode `localhost` -- Production configuration must set a real
 * `WEB_URL`, the same way `NEXT_PUBLIC_API_URL` already works.
 */
export function getWebOrigin(): string {
  const webUrl = process.env.WEB_URL;
  if (!webUrl) {
    throw new Error('WEB_URL is not set. Copy .env.example to .env first.');
  }
  return webUrl.replace(/\/+$/, '');
}
