import { validateEnv } from './env.schema';

const VALID_DATABASE_URL =
  'postgresql://restaurant_qr:redacted@localhost:5432/restaurant_qr_platform?schema=public';

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: 'development',
    API_HOST: '0.0.0.0',
    API_PORT: '4000',
    API_PREFIX: '/api/v1',
    DATABASE_URL: VALID_DATABASE_URL,
    ...overrides,
  };
}

function omit(
  config: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> {
  const copy = { ...config };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

describe('validateEnv', () => {
  it('accepts a valid configuration and coerces API_PORT to a number', () => {
    const result = validateEnv(validConfig());

    expect(result.NODE_ENV).toBe('development');
    expect(result.API_HOST).toBe('0.0.0.0');
    expect(result.API_PORT).toBe(4000);
    expect(typeof result.API_PORT).toBe('number');
    expect(result.API_PREFIX).toBe('/api/v1');
    expect(result.DATABASE_URL).toBe(VALID_DATABASE_URL);
  });

  it('applies documented defaults when optional values are omitted', () => {
    const result = validateEnv(
      omit(validConfig(), 'NODE_ENV', 'API_HOST', 'API_PORT', 'API_PREFIX'),
    );

    expect(result.NODE_ENV).toBe('development');
    expect(result.API_HOST).toBe('0.0.0.0');
    expect(result.API_PORT).toBe(4000);
    expect(result.API_PREFIX).toBe('/api/v1');
  });

  it('passes unrelated environment variables through untouched', () => {
    const result = validateEnv(
      validConfig({ SOME_UNRELATED_HOST_VARIABLE: 'keep-me' }),
    );

    expect(result).toMatchObject({ SOME_UNRELATED_HOST_VARIABLE: 'keep-me' });
  });

  it('rejects a non-numeric API_PORT', () => {
    expect(() =>
      validateEnv(validConfig({ API_PORT: 'not-a-number' })),
    ).toThrow(/API_PORT/);
  });

  it('rejects an out-of-range API_PORT', () => {
    expect(() => validateEnv(validConfig({ API_PORT: '70000' }))).toThrow(
      /API_PORT/,
    );
  });

  it('rejects a non-integer API_PORT', () => {
    expect(() => validateEnv(validConfig({ API_PORT: '4000.5' }))).toThrow(
      /API_PORT/,
    );
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validateEnv(validConfig({ NODE_ENV: 'staging' }))).toThrow(
      /NODE_ENV/,
    );
  });

  it('rejects an empty API_PREFIX', () => {
    expect(() => validateEnv(validConfig({ API_PREFIX: '' }))).toThrow(
      /API_PREFIX/,
    );
  });

  it('rejects a whitespace-only API_PREFIX', () => {
    expect(() => validateEnv(validConfig({ API_PREFIX: '   ' }))).toThrow(
      /API_PREFIX/,
    );
  });

  it('rejects a slash-only API_PREFIX', () => {
    expect(() => validateEnv(validConfig({ API_PREFIX: '/' }))).toThrow(
      /API_PREFIX/,
    );
    expect(() => validateEnv(validConfig({ API_PREFIX: '///' }))).toThrow(
      /API_PREFIX/,
    );
  });

  it('trims surrounding whitespace from a valid API_PREFIX', () => {
    const result = validateEnv(validConfig({ API_PREFIX: '  /api/v1  ' }));

    expect(result.API_PREFIX).toBe('/api/v1');
  });

  it('rejects a whitespace-only API_HOST', () => {
    expect(() => validateEnv(validConfig({ API_HOST: '   ' }))).toThrow(
      /API_HOST/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv(omit(validConfig(), 'DATABASE_URL'))).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a non-PostgreSQL DATABASE_URL without leaking the value', () => {
    let caught: Error | undefined;

    try {
      validateEnv(
        validConfig({ DATABASE_URL: 'mysql://user:secret@localhost:3306/db' }),
      );
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toMatch(/DATABASE_URL/);
    expect(caught?.message).not.toContain('secret');
  });
});
