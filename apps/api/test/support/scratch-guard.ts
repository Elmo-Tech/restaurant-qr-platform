/**
 * Isolation guard for integration specs that write to a throwaway PostgreSQL database (Offers, DEC-069).
 *
 * They run only when OFFERS_E2E_DATABASE_URL is set -- deliberately NOT DATABASE_URL -- and then refuse to continue unless
 * the URL is local and the database name contains `scratch`. Importing this module FIRST in a spec points the Nest application
 * at that database (Nest's ConfigModule reads the environment at import time) and disables rate limiting.
 *
 * Create the database empty and run `prisma migrate deploy` against it with DATABASE_URL overridden.
 */
export const SCRATCH_URL = process.env.OFFERS_E2E_DATABASE_URL;

export function assertScratchUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`Refusing to run: host must be local, got ${url.hostname}`);
  }
  if (!database.includes('scratch')) {
    throw new Error(
      `Refusing to run: database name "${database}" does not contain "scratch"`,
    );
  }
}

if (SCRATCH_URL) {
  assertScratchUrl(SCRATCH_URL);
  process.env.DATABASE_URL = SCRATCH_URL;
  process.env.RATE_LIMIT_ENABLED = 'false';
}
