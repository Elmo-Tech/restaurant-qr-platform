import {
  assertSandboxDatabase,
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_MARKER,
  SANDBOX_ROLE,
  sandboxDatabaseName,
} from './sandbox-guard';

/**
 * Regression tests for the integration-sandbox guard itself (no database needed).
 * Run by `npm run test:db-safety --workspace=apps/api` and in CI.
 */
const DEV = { database: 'restaurant_qr_platform', user: 'restaurant_qr' };
const SANDBOX = `postgresql://${SANDBOX_ROLE}:pw@127.0.0.1:5432/restaurant_qr_it_test?schema=public`;
const EXPECTED_DB = 'restaurant_qr_it_test';

describe('assertSandboxUrl', () => {
  it('accepts a local, sandbox-named database owned by the sandbox role', () => {
    expect(() => assertSandboxUrl(SANDBOX, DEV)).not.toThrow();
    expect(() =>
      assertSandboxUrl(SANDBOX.replace('127.0.0.1', 'localhost'), DEV),
    ).not.toThrow();
  });

  it.each([
    [
      'a remote host',
      SANDBOX.replace('127.0.0.1', 'db.example.com'),
      /host must be local/,
    ],
    [
      'a container host name',
      SANDBOX.replace('127.0.0.1', 'postgres'),
      /host must be local/,
    ],
    [
      'another login role',
      SANDBOX.replace(SANDBOX_ROLE, 'restaurant_qr'),
      /login role must be/,
    ],
    [
      'the development database',
      SANDBOX.replace('restaurant_qr_it_test', 'restaurant_qr_platform'),
      /not a sandbox name/,
    ],
    [
      'a production-like name',
      SANDBOX.replace('restaurant_qr_it_test', 'restaurant_qr_production'),
      /not a sandbox name/,
    ],
    [
      'a name that only contains _test',
      SANDBOX.replace('restaurant_qr_it_test', 'restaurant_qr_test_prod'),
      /not a sandbox name/,
    ],
  ])('refuses %s', (_label, url, message) => {
    expect(() => assertSandboxUrl(url, DEV)).toThrow(message);
  });

  it('refuses the database or role configured as the development target', () => {
    expect(() =>
      assertSandboxUrl(SANDBOX, {
        database: 'restaurant_qr_it_test',
        user: null,
      }),
    ).toThrow(/equals the development database or role/);
    expect(() =>
      assertSandboxUrl(SANDBOX, { database: null, user: SANDBOX_ROLE }),
    ).toThrow(/equals the development database or role/);
  });
});

describe('assertSandboxUrl: the query string cannot redirect the connection', () => {
  it.each([
    ['host', 'host=db.example.com'],
    ['percent-encoded host', '%68ost=db.example.com'],
    ['fully encoded host', '%68%6F%73%74=db.example.com'],
    ['upper-case host', 'HOST=db.example.com'],
    ['empty host', 'host='],
    ['value-less host', 'host'],
    ['repeated host', 'host=127.0.0.1&host=db.example.com'],
    ['hostaddr', 'hostaddr=10.0.0.5'],
    ['port', 'port=6543'],
    ['encoded port', 'p%6Frt=6543'],
    ['user', 'user=postgres'],
    ['username', 'username=postgres'],
    ['database', 'database=restaurant_qr_platform'],
    ['dbname', 'dbname=restaurant_qr_platform'],
    ['db', 'db=restaurant_qr_platform'],
    ['options', 'options=-c%20search_path%3Dpublic'],
    ['encoded options', '%6Fptions=-c%20x'],
    ['service', 'service=production'],
    ['servicefile', 'servicefile=%2Fetc%2Fpg_service.conf'],
  ])('refuses a %s override', (_label, query) => {
    expect(() => assertSandboxUrl(`${SANDBOX}&${query}`, DEV)).toThrow(
      /query overrides the connection target/,
    );
  });

  it.each([
    ['password', 'password=other'],
    ['passfile', 'passfile=%2Ftmp%2Fpgpass'],
    ['an unknown parameter', 'foo=bar'],
  ])('refuses %s, which is not on the allowlist', (_label, query) => {
    expect(() => assertSandboxUrl(`${SANDBOX}&${query}`, DEV)).toThrow(
      /unsupported sandbox URL query parameter/,
    );
  });

  it('accepts the allowlisted parameters', () => {
    const url = `${SANDBOX}&application_name=it&connect_timeout=5&sslmode=disable`;
    expect(() => assertSandboxUrl(url, DEV)).not.toThrow();
  });

  it('refuses when the effective port differs from the URL (PGPORT without an explicit port)', () => {
    const previous = process.env.PGPORT;
    process.env.PGPORT = '6543';
    try {
      expect(() => assertSandboxUrl(SANDBOX.replace(':5432', ''), DEV)).toThrow(
        /effective connection target .* differs from the sandbox URL/,
      );
      // An explicit port in the URL wins over PGPORT and matches.
      expect(() => assertSandboxUrl(SANDBOX, DEV)).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.PGPORT;
      else process.env.PGPORT = previous;
    }
  });

  it('reads the expected database name from the URL path', () => {
    expect(sandboxDatabaseName(SANDBOX)).toBe(EXPECTED_DB);
    expect(sandboxDatabaseName(undefined)).toBeUndefined();
  });
});

describe('assertSandboxIdentity', () => {
  const connection = (rows: unknown[]) => ({
    $queryRaw: jest.fn().mockResolvedValue(rows),
  });

  it('accepts the marked sandbox connected as the sandbox role', async () => {
    await expect(
      assertSandboxIdentity(
        connection([
          {
            db: 'restaurant_qr_it_test',
            usr: SANDBOX_ROLE,
            marker: SANDBOX_MARKER,
          },
        ]),
        EXPECTED_DB,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a marked sandbox that is not the expected database', async () => {
    await expect(
      assertSandboxIdentity(
        connection([
          {
            db: 'restaurant_qr_other_test',
            usr: SANDBOX_ROLE,
            marker: SANDBOX_MARKER,
          },
        ]),
        EXPECTED_DB,
      ),
    ).rejects.toThrow(/not the marked integration sandbox/);
  });

  it('refuses when there is no expected database to compare with', async () => {
    await expect(
      assertSandboxIdentity(
        connection([
          { db: EXPECTED_DB, usr: SANDBOX_ROLE, marker: SANDBOX_MARKER },
        ]),
        undefined,
      ),
    ).rejects.toThrow(/no expected sandbox database/);
  });

  it.each([
    [
      'an unmarked database',
      [{ db: EXPECTED_DB, usr: SANDBOX_ROLE, marker: null }],
    ],
    [
      'a different marker',
      [{ db: EXPECTED_DB, usr: SANDBOX_ROLE, marker: 'production' }],
    ],
    [
      'another role',
      [{ db: EXPECTED_DB, usr: 'postgres', marker: SANDBOX_MARKER }],
    ],
    ['no identity row', []],
  ])('refuses %s before any write', async (_label, rows) => {
    await expect(
      assertSandboxIdentity(connection(rows), EXPECTED_DB),
    ).rejects.toThrow(/not the marked integration sandbox/);
  });
});

describe('assertSandboxDatabase (before the application exists)', () => {
  it('refuses when no sandbox URL is configured', async () => {
    await expect(assertSandboxDatabase(undefined)).rejects.toThrow(
      /TABLE_SESSION_IT_DATABASE_URL is not set/,
    );
  });

  it.each([
    ['a remote host', SANDBOX.replace('127.0.0.1', 'db.example.com')],
    [
      'a non-sandbox name',
      SANDBOX.replace('restaurant_qr_it_test', 'restaurant_qr_platform'),
    ],
    ['another role', SANDBOX.replace(SANDBOX_ROLE, 'postgres')],
    ['a host override in the query', `${SANDBOX}&host=db.example.com`],
    ['a port override in the query', `${SANDBOX}&port=6543`],
  ])('refuses %s before opening any connection', async (_label, url) => {
    // Port 1 would fail to connect; the URL rules must reject first.
    await expect(
      assertSandboxDatabase(url.replace(':5432', ':1')),
    ).rejects.toThrow(/Refusing to run/);
  });
});
