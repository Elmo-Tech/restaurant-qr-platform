import {
  assertSandboxDatabase,
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_MARKER,
  SANDBOX_ROLE,
} from './sandbox-guard';

/**
 * Regression tests for the integration-sandbox guard itself (no database needed).
 * Run by `npm run test:db-safety --workspace=apps/api` and in CI.
 */
const DEV = { database: 'restaurant_qr_platform', user: 'restaurant_qr' };
const SANDBOX = `postgresql://${SANDBOX_ROLE}:pw@127.0.0.1:5432/restaurant_qr_it_test?schema=public`;

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
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'an unmarked database',
      [{ db: 'restaurant_qr_platform', usr: SANDBOX_ROLE, marker: null }],
    ],
    [
      'a different marker',
      [{ db: 'x_test', usr: SANDBOX_ROLE, marker: 'production' }],
    ],
    [
      'another role',
      [{ db: 'x_test', usr: 'postgres', marker: SANDBOX_MARKER }],
    ],
    ['no identity row', []],
  ])('refuses %s before any write', async (_label, rows) => {
    await expect(assertSandboxIdentity(connection(rows))).rejects.toThrow(
      /not the marked integration sandbox/,
    );
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
  ])('refuses %s before opening any connection', async (_label, url) => {
    // Port 1 would fail to connect; the URL rules must reject first.
    await expect(
      assertSandboxDatabase(url.replace(':5432', ':1')),
    ).rejects.toThrow(/Refusing to run/);
  });
});
