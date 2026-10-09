import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * ISOLATION GUARD for every integration spec that WRITES to PostgreSQL (the
 * Table Sessions specs). These tests must NEVER touch the development or any
 * production database. They only run when TABLE_SESSION_IT_DATABASE_URL is set
 * -- deliberately NOT DATABASE_URL -- and then refuse to continue unless ALL of
 * these hold:
 *   1. the URL is local (localhost / 127.0.0.1);
 *   2. the login role is the dedicated sandbox role `restaurant_qr_it`, which
 *      owns the sandbox database and has no privileges on any other database's
 *      tables (so a wrong URL fails with "permission denied" anyway);
 *   3. the database name matches ^restaurant_qr_[a-z0-9_]+_test$;
 *   4. the database name and role differ from the root `.env` DATABASE_URL;
 *   5. the connected database carries the explicit sandbox marker comment
 *      `restaurant-qr-integration-sandbox` (set once when it is created; the
 *      development database never has it) -- checked by `assertSandboxIdentity`
 *      against the live connection BEFORE any write.
 *
 * Importing this module FIRST in a spec also points the Nest application at the
 * sandbox (DATABASE_URL) and disables rate limiting, because Nest's
 * ConfigModule reads the environment at import time.
 */

export const SANDBOX_URL = process.env.TABLE_SESSION_IT_DATABASE_URL;
export const SANDBOX_MARKER = 'restaurant-qr-integration-sandbox';
export const SANDBOX_ROLE = 'restaurant_qr_it';

function developmentTarget(): { database: string | null; user: string | null } {
  try {
    const parsed = dotenv.parse(
      readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '.env')),
    );
    if (!parsed.DATABASE_URL) {
      return { database: null, user: null };
    }
    const url = new URL(parsed.DATABASE_URL);
    return {
      database: url.pathname.replace(/^\//, ''),
      user: decodeURIComponent(url.username),
    };
  } catch {
    return { database: null, user: null };
  }
}

export function assertSandboxUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, '');
  const user = decodeURIComponent(url.username);
  const dev = developmentTarget();
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(
      `Refusing to run: sandbox host must be local, got ${url.hostname}`,
    );
  }
  if (user !== SANDBOX_ROLE) {
    throw new Error(`Refusing to run: login role must be ${SANDBOX_ROLE}`);
  }
  if (!/^restaurant_qr_[a-z0-9_]+_test$/.test(database)) {
    throw new Error(
      `Refusing to run: database name "${database}" is not a sandbox name`,
    );
  }
  if (dev.database === database || dev.user === user) {
    throw new Error(
      'Refusing to run: sandbox target equals the development database or role',
    );
  }
}

/** Verifies the LIVE connection is the marked sandbox. Call before seeding anything. */
export async function assertSandboxIdentity(prisma: {
  $queryRaw: (strings: TemplateStringsArray) => Promise<unknown>;
}): Promise<void> {
  const identity =
    (await prisma.$queryRaw`SELECT current_database()::text AS db,
              current_user::text AS usr,
              shobj_description(d.oid, 'pg_database') AS marker
         FROM pg_database d WHERE d.datname = current_database()`) as {
      db: string;
      usr: string;
      marker: string | null;
    }[];
  if (
    identity.length !== 1 ||
    identity[0].marker !== SANDBOX_MARKER ||
    identity[0].usr !== SANDBOX_ROLE
  ) {
    throw new Error(
      'Refusing to run: connected database is not the marked integration sandbox',
    );
  }
}

if (SANDBOX_URL) {
  assertSandboxUrl(SANDBOX_URL);
  process.env.DATABASE_URL = SANDBOX_URL;
  process.env.RATE_LIMIT_ENABLED = 'false';
}
