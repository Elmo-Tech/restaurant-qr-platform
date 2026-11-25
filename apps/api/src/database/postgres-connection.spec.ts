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

  it.each([
    'postgresql://app:secret@127.0.0.1:5432/db?options=-c%20TimeZone%3DAfrica%2FCairo',
    'postgresql://app:secret@127.0.0.1:5432/db?schema=public&options=-c%20search_path%3Dx',
    'postgresql://app:secret@127.0.0.1:5432/db?schema=public&OPTIONS=x',
  ])(
    'refuses a URL whose options parameter would override the UTC pin: %s',
    (url) => {
      expect(() => postgresPoolConfig(url)).toThrow(
        /must not set the PostgreSQL "options" parameter/,
      );
    },
  );

  it('does not mistake other parameters or credentials for options', () => {
    const url =
      'postgresql://options:options@127.0.0.1:5432/options?schema=public&sslmode=disable';
    expect(postgresPoolConfig(url).options).toBe('-c TimeZone=UTC');
  });

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
