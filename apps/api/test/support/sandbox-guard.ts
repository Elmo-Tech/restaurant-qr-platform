import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { queryParameterNames } from '../../src/database/postgres-connection';

/**
 * ISOLATION GUARD for every integration spec that WRITES to PostgreSQL
 * (enforced for every `*.e2e-spec.ts` by `e2e-database-safety.spec.ts`; run
 * `npm run test:db-safety`). These tests must NEVER touch the development or any
 * production database. They only run when TABLE_SESSION_IT_DATABASE_URL is set
 * -- deliberately NOT DATABASE_URL -- and then refuse to continue unless ALL of
 * these hold:
 *   1. the URL is local (localhost / 127.0.0.1);
 *   2. the login role is the dedicated sandbox role `restaurant_qr_it`, which
 *      owns the sandbox database and has no privileges on any other database's
 *      tables (so a wrong URL fails with "permission denied" anyway);
 *   3. the database name matches ^restaurant_qr_[a-z0-9_]+_test$;
 *   4. the database name and role differ from the root `.env` DATABASE_URL;
 *   4a. the query string cannot redirect the connection: parameters that
 *      override host, port, user, database or connection options (any
 *      spelling, percent-encoded or not) are refused, only a short allowlist
 *      is accepted, and the EFFECTIVE target `pg` resolves (query string and
 *      PG* environment included) must equal the URL authority;
 *   5. the connected database carries the explicit sandbox marker comment
 *      `restaurant-qr-integration-sandbox` (set once when it is created; the
 *      development database never has it) -- checked by `assertSandboxIdentity`
 *      against the live connection BEFORE any write, together with the
 *      connected database name and role. `assertSandboxDatabase`
 *      does the same on a short-lived raw connection, so a suite can verify the
 *      target before the Nest application (and its bootstrap hooks) even
 *      exists; `sandbox-global-setup.ts` runs it once per e2e run.
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

/**
 * Query parameters that can move a `pg` / libpq connection away from the URL
 * authority (or change its session settings). `pg` applies `host`, `port`,
 * `user` and `options` from the query string today; the libpq spellings are
 * refused too so another client or a driver upgrade cannot reopen the hole.
 */
const TARGET_OVERRIDE_PARAMETERS = new Set([
  'host',
  'hostaddr',
  'port',
  'user',
  'username',
  'database',
  'dbname',
  'db',
  'options',
  'service',
  'servicefile',
]);
/** The only query parameters a sandbox URL may carry. */
const ALLOWED_SANDBOX_PARAMETERS = new Set([
  'schema',
  'application_name',
  'connect_timeout',
  'sslmode',
]);

function assertSandboxQuery(rawUrl: string): void {
  for (const rawName of queryParameterNames(rawUrl)) {
    const name = rawName.trim().toLowerCase();
    if (TARGET_OVERRIDE_PARAMETERS.has(name)) {
      throw new Error(
        `Refusing to run: the sandbox URL query overrides the connection target ("${name}")`,
      );
    }
    if (!ALLOWED_SANDBOX_PARAMETERS.has(name)) {
      throw new Error(
        `Refusing to run: unsupported sandbox URL query parameter "${name}"`,
      );
    }
  }
}

/**
 * What `pg` will actually connect to (it merges the query string and the PG*
 * environment variables into the URL). Constructing a Client does not connect.
 */
function effectiveTarget(rawUrl: string): {
  host: string;
  port: number;
  user: string | undefined;
  database: string | undefined;
} {
  const client = new Client({ connectionString: rawUrl });
  return {
    host: client.host,
    port: client.port,
    user: client.user,
    database: client.database,
  };
}

/** The database name in a sandbox URL (the path), or undefined without a URL. */
export function sandboxDatabaseName(
  rawUrl: string | undefined = SANDBOX_URL,
): string | undefined {
  return rawUrl ? new URL(rawUrl).pathname.replace(/^\//, '') : undefined;
}

export function assertSandboxUrl(
  rawUrl: string,
  dev: { database: string | null; user: string | null } = developmentTarget(),
): void {
  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, '');
  const user = decodeURIComponent(url.username);
  assertSandboxQuery(rawUrl);
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
  const effective = effectiveTarget(rawUrl);
  const expectedPort = url.port ? Number(url.port) : 5432;
  if (
    effective.host !== url.hostname ||
    effective.port !== expectedPort ||
    effective.user !== user ||
    effective.database !== database
  ) {
    throw new Error(
      `Refusing to run: the effective connection target (${effective.user}@${effective.host}:${effective.port}/${effective.database}) differs from the sandbox URL`,
    );
  }
}

/**
 * Verifies the LIVE connection is the marked sandbox: the expected database
 * name (the sandbox URL's), the sandbox role and the sandbox marker. Call
 * before seeding anything.
 */
export async function assertSandboxIdentity(
  prisma: {
    $queryRaw: (strings: TemplateStringsArray) => Promise<unknown>;
  },
  expectedDatabase: string | undefined = sandboxDatabaseName(),
): Promise<void> {
  if (!expectedDatabase) {
    throw new Error(
      'Refusing to run: no expected sandbox database (TABLE_SESSION_IT_DATABASE_URL is not set)',
    );
  }
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
    identity[0].db !== expectedDatabase ||
    identity[0].marker !== SANDBOX_MARKER ||
    identity[0].usr !== SANDBOX_ROLE
  ) {
    throw new Error(
      'Refusing to run: connected database is not the marked integration sandbox',
    );
  }
}

/**
 * Verifies the URL rules AND the live identity of the target on its own raw
 * connection -- no Nest application, no Prisma -- so nothing of the app has
 * started yet. Call it before `Test.createTestingModule` / `app.init()`.
 */
export async function assertSandboxDatabase(
  rawUrl: string | undefined = SANDBOX_URL,
): Promise<void> {
  if (!rawUrl) {
    throw new Error(
      'Refusing to run: TABLE_SESSION_IT_DATABASE_URL is not set',
    );
  }
  assertSandboxUrl(rawUrl);
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    await assertSandboxIdentity(
      {
        $queryRaw: async (strings) =>
          (await client.query<Record<string, unknown>>(strings.join(''))).rows,
      },
      sandboxDatabaseName(rawUrl),
    );
  } finally {
    await client.end();
  }
}

if (SANDBOX_URL) {
  assertSandboxUrl(SANDBOX_URL);
  process.env.DATABASE_URL = SANDBOX_URL;
  process.env.RATE_LIMIT_ENABLED = 'false';
}
