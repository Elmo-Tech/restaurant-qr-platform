import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Session TimeZone for EVERY application connection to PostgreSQL.
 *
 * Why this is pinned on the connection and not left to the server default:
 * `@prisma/adapter-pg` (7.x) writes a JS `Date` as an offset-less UTC wall-clock
 * literal ("2026-11-25 09:37:57.123") and, on read, REPLACES the offset of every
 * `timestamptz` value with `+00:00`. Both are only correct when the session
 * TimeZone is UTC. On a server/database/role whose default is e.g. Africa/Cairo,
 * application-written instants are stored shifted by the zone offset and
 * database-generated values (`now()`, column defaults) are read back shifted the
 * other way, so mixing them (expiry checks, "last N minutes" windows, ordering)
 * silently goes wrong.
 *
 * The startup `options` parameter is applied by PostgreSQL before the first
 * query of every pooled connection, takes precedence over server, database and
 * role defaults, and survives `RESET ALL` / `DISCARD ALL`.
 *
 * Business timezones are NOT affected: Restaurant / Branch local time is always
 * computed in the application from `Branch.timezone` (an IANA name), never from
 * the database session.
 */
export const DATABASE_SESSION_TIME_ZONE = 'UTC';

const SESSION_OPTIONS = `-c TimeZone=${DATABASE_SESSION_TIME_ZONE}`;

/**
 * Query parameter names exactly as `pg-connection-string` sees them: it reads
 * `new URL(...).searchParams`, so names are percent-decoded (`%6Fptions` is
 * `options`) and `+` is a space. The fallback parses only the query part for
 * URLs WHATWG cannot parse (for example some socket-path hosts).
 */
function queryParameterNames(connectionString: string): string[] {
  try {
    return [...new URL(connectionString).searchParams.keys()];
  } catch {
    const start = connectionString.indexOf('?');
    if (start < 0) return [];
    const end = connectionString.indexOf('#', start);
    const query = connectionString.slice(start + 1, end < 0 ? undefined : end);
    return [...new URLSearchParams(query).keys()];
  }
}

/**
 * `pg` lets an `options` query parameter in the URL replace the pool config's
 * `options` (an empty or value-less one too), which would drop the UTC pin.
 * Refuse every spelling of it -- including case variants `pg` itself would
 * ignore -- instead of merging, so the effective session settings stay obvious.
 */
function assertNoOptionsParameter(connectionString: string): void {
  const names = queryParameterNames(connectionString);
  if (names.some((name) => name.trim().toLowerCase() === 'options')) {
    throw new Error(
      'DATABASE_URL must not set the PostgreSQL "options" parameter: the application pins the session TimeZone to UTC itself.',
    );
  }
}

/** `pg` pool settings shared by the API and every operational script. */
export function postgresPoolConfig(connectionString: string): {
  connectionString: string;
  options: string;
} {
  assertNoOptionsParameter(connectionString);
  return { connectionString, options: SESSION_OPTIONS };
}

/** The only way application code should build the Prisma PostgreSQL adapter. */
export function createPrismaPgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg(postgresPoolConfig(connectionString));
}

/**
 * Fails fast when a connection does not run in UTC (for example a pooler that
 * drops startup parameters). Call once after connecting.
 */
export async function assertUtcSession(client: {
  $queryRaw: (strings: TemplateStringsArray) => Promise<unknown>;
}): Promise<void> {
  const rows =
    (await client.$queryRaw`SELECT current_setting('TimeZone') AS "timeZone"`) as {
      timeZone: string;
    }[];
  const timeZone = rows[0]?.timeZone;
  if (timeZone !== DATABASE_SESSION_TIME_ZONE) {
    throw new Error(
      `Database session TimeZone must be ${DATABASE_SESSION_TIME_ZONE}, got ${String(timeZone)}`,
    );
  }
}
