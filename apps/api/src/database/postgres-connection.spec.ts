import { PrismaPg } from '@prisma/adapter-pg';
import {
  assertUtcSession,
  createPrismaPgAdapter,
  DATABASE_SESSION_TIME_ZONE,
  postgresPoolConfig,
} from './postgres-connection';

const URL_WITHOUT_OPTIONS =
  'postgresql://app:secret@127.0.0.1:5432/restaurant_qr_platform?schema=public';

describe('postgres connection settings', () => {
  it('pins the session TimeZone to UTC through the startup options', () => {
    expect(DATABASE_SESSION_TIME_ZONE).toBe('UTC');
    expect(postgresPoolConfig(URL_WITHOUT_OPTIONS)).toEqual({
      connectionString: URL_WITHOUT_OPTIONS,
      options: '-c TimeZone=UTC',
    });
  });

  const BASE = 'postgresql://app:secret@127.0.0.1:5432/db';

  it.each([
    ['plain', `${BASE}?options=-c%20TimeZone%3DAfrica%2FCairo`],
    [
      'after other parameters',
      `${BASE}?schema=public&options=-c%20search_path%3Dx`,
    ],
    [
      'percent-encoded name',
      `${BASE}?%6Fptions=-c%20TimeZone%3DAfrica%2FCairo`,
    ],
    ['fully encoded name', `${BASE}?%6F%70%74%69%6F%6E%73=x`],
    ['encoded name, mixed case', `${BASE}?schema=public&OPT%49ONS=x`],
    [
      'repeated',
      `${BASE}?options=-c%20TimeZone%3DUTC&options=-c%20TimeZone%3DAfrica%2FCairo`,
    ],
    ['repeated around others', `${BASE}?options=a&schema=public&options=b`],
    ['empty value', `${BASE}?schema=public&options=`],
    ['no value at all', `${BASE}?options`],
    ['upper case', `${BASE}?OPTIONS=x`],
    ['title case', `${BASE}?Options=x`],
    ['plus-encoded value', `${BASE}?options=-c+TimeZone%3DAfrica%2FCairo`],
    [
      'unparseable host, query fallback',
      'postgresql://app@/var/run/postgresql:5432/db?%6Fptions=x',
    ],
  ])('refuses an options parameter (%s)', (_label, url) => {
    expect(() => postgresPoolConfig(url)).toThrow(
      /must not set the PostgreSQL "options" parameter/,
    );
  });

  it.each([
    [
      'credentials and database named options',
      'postgresql://options:options@127.0.0.1:5432/options?schema=public&sslmode=disable',
    ],
    ['similar parameter names', `${BASE}?xoptions=1&options_extra=1&option=1`],
    ['the word in a value', `${BASE}?application_name=options&schema=options`],
    ['encoded value only', `${BASE}?application_name=%6Fptions%3Dx`],
    ['a fragment, which is not a parameter', `${BASE}?schema=public#options=x`],
    ['no query at all', BASE],
  ])(
    'keeps the UTC pin when there is no options parameter (%s)',
    (_label, url) => {
      expect(postgresPoolConfig(url)).toEqual({
        connectionString: url,
        options: '-c TimeZone=UTC',
      });
    },
  );

  it('builds the Prisma adapter from the same settings', () => {
    expect(createPrismaPgAdapter(URL_WITHOUT_OPTIONS)).toBeInstanceOf(PrismaPg);
  });

  it('accepts a UTC session and rejects any other session TimeZone', async () => {
    const session = (timeZone: string) => ({
      $queryRaw: jest.fn().mockResolvedValue([{ timeZone }]),
    });
    await expect(assertUtcSession(session('UTC'))).resolves.toBeUndefined();
    await expect(assertUtcSession(session('Africa/Cairo'))).rejects.toThrow(
      'Database session TimeZone must be UTC, got Africa/Cairo',
    );
    await expect(assertUtcSession(session('Etc/UTC'))).rejects.toThrow(
      /must be UTC/,
    );
  });
});
