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
    CORS_ORIGIN: 'http://localhost:3000',
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

  it('applies the documented default AUTH_SESSION_TTL_DAYS when omitted', () => {
    const result = validateEnv(omit(validConfig(), 'AUTH_SESSION_TTL_DAYS'));

    expect(result.AUTH_SESSION_TTL_DAYS).toBe(30);
  });

  it('coerces a valid AUTH_SESSION_TTL_DAYS to a number', () => {
    const result = validateEnv(validConfig({ AUTH_SESSION_TTL_DAYS: '7' }));

    expect(result.AUTH_SESSION_TTL_DAYS).toBe(7);
  });

  it('rejects a non-integer AUTH_SESSION_TTL_DAYS', () => {
    expect(() =>
      validateEnv(validConfig({ AUTH_SESSION_TTL_DAYS: '30.5' })),
    ).toThrow(/AUTH_SESSION_TTL_DAYS/);
  });

  it('rejects an out-of-range AUTH_SESSION_TTL_DAYS', () => {
    expect(() =>
      validateEnv(validConfig({ AUTH_SESSION_TTL_DAYS: '0' })),
    ).toThrow(/AUTH_SESSION_TTL_DAYS/);
    expect(() =>
      validateEnv(validConfig({ AUTH_SESSION_TTL_DAYS: '400' })),
    ).toThrow(/AUTH_SESSION_TTL_DAYS/);
  });

  it('applies the documented default RESTAURANT_INVITATION_TTL_DAYS when omitted', () => {
    const result = validateEnv(
      omit(validConfig(), 'RESTAURANT_INVITATION_TTL_DAYS'),
    );

    expect(result.RESTAURANT_INVITATION_TTL_DAYS).toBe(7);
  });

  it('coerces a valid RESTAURANT_INVITATION_TTL_DAYS to a number', () => {
    const result = validateEnv(
      validConfig({ RESTAURANT_INVITATION_TTL_DAYS: '14' }),
    );

    expect(result.RESTAURANT_INVITATION_TTL_DAYS).toBe(14);
  });

  it('rejects a non-integer RESTAURANT_INVITATION_TTL_DAYS', () => {
    expect(() =>
      validateEnv(validConfig({ RESTAURANT_INVITATION_TTL_DAYS: '7.5' })),
    ).toThrow(/RESTAURANT_INVITATION_TTL_DAYS/);
  });

  it('rejects a zero or negative RESTAURANT_INVITATION_TTL_DAYS', () => {
    expect(() =>
      validateEnv(validConfig({ RESTAURANT_INVITATION_TTL_DAYS: '0' })),
    ).toThrow(/RESTAURANT_INVITATION_TTL_DAYS/);
    expect(() =>
      validateEnv(validConfig({ RESTAURANT_INVITATION_TTL_DAYS: '-1' })),
    ).toThrow(/RESTAURANT_INVITATION_TTL_DAYS/);
  });

  it('accepts a value greater than 365 -- no maximum is part of the settled contract', () => {
    const result = validateEnv(
      validConfig({ RESTAURANT_INVITATION_TTL_DAYS: '400' }),
    );

    expect(result.RESTAURANT_INVITATION_TTL_DAYS).toBe(400);
  });

  it('applies the documented default PASSWORD_RESET_TTL_MINUTES when omitted', () => {
    const result = validateEnv(
      omit(validConfig(), 'PASSWORD_RESET_TTL_MINUTES'),
    );

    expect(result.PASSWORD_RESET_TTL_MINUTES).toBe(45);
  });

  it('coerces a valid PASSWORD_RESET_TTL_MINUTES to a number', () => {
    const result = validateEnv(
      validConfig({ PASSWORD_RESET_TTL_MINUTES: '30' }),
    );

    expect(result.PASSWORD_RESET_TTL_MINUTES).toBe(30);
  });

  it('rejects a PASSWORD_RESET_TTL_MINUTES outside the 5-180 range', () => {
    expect(() =>
      validateEnv(validConfig({ PASSWORD_RESET_TTL_MINUTES: '4' })),
    ).toThrow(/PASSWORD_RESET_TTL_MINUTES/);
    expect(() =>
      validateEnv(validConfig({ PASSWORD_RESET_TTL_MINUTES: '181' })),
    ).toThrow(/PASSWORD_RESET_TTL_MINUTES/);
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

  it('enables an exact restaurant base domain only when configured', () => {
    expect(validateEnv(validConfig()).RESTAURANT_BASE_DOMAIN).toBeUndefined();
    expect(
      validateEnv(validConfig({ RESTAURANT_BASE_DOMAIN: 'waytaapp.com' }))
        .RESTAURANT_BASE_DOMAIN,
    ).toBe('waytaapp.com');
    expect(() =>
      validateEnv(validConfig({ RESTAURANT_BASE_DOMAIN: '*.waytaapp.com' })),
    ).toThrow(/RESTAURANT_BASE_DOMAIN/);
  });

  it('rejects a missing CORS_ORIGIN', () => {
    expect(() => validateEnv(omit(validConfig(), 'CORS_ORIGIN'))).toThrow(
      /CORS_ORIGIN/,
    );
  });

  it('rejects a wildcard CORS_ORIGIN', () => {
    expect(() => validateEnv(validConfig({ CORS_ORIGIN: '*' }))).toThrow(
      /CORS_ORIGIN/,
    );
  });

  it('rejects a non-URL CORS_ORIGIN', () => {
    expect(() =>
      validateEnv(validConfig({ CORS_ORIGIN: 'not-a-url' })),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('applies the documented default AUTH_SESSION_COOKIE_NAME when omitted', () => {
    const result = validateEnv(omit(validConfig(), 'AUTH_SESSION_COOKIE_NAME'));

    expect(result.AUTH_SESSION_COOKIE_NAME).toBe('restaurant_session');
  });

  it('rejects an empty AUTH_SESSION_COOKIE_NAME', () => {
    expect(() =>
      validateEnv(validConfig({ AUTH_SESSION_COOKIE_NAME: '' })),
    ).toThrow(/AUTH_SESSION_COOKIE_NAME/);
  });

  it('defaults AUTH_COOKIE_SECURE to false and coerces the string "true"', () => {
    const defaulted = validateEnv(omit(validConfig(), 'AUTH_COOKIE_SECURE'));
    expect(defaulted.AUTH_COOKIE_SECURE).toBe(false);

    const enabled = validateEnv(validConfig({ AUTH_COOKIE_SECURE: 'true' }));
    expect(enabled.AUTH_COOKIE_SECURE).toBe(true);
  });

  it('rejects a non-boolean-string AUTH_COOKIE_SECURE', () => {
    expect(() =>
      validateEnv(validConfig({ AUTH_COOKIE_SECURE: 'yes' })),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('requires AUTH_COOKIE_SECURE=true when NODE_ENV=production', () => {
    expect(() =>
      validateEnv(
        validConfig({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }),
      ),
    ).toThrow(/AUTH_COOKIE_SECURE/);

    const result = validateEnv(
      validConfig({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'true' }),
    );
    expect(result.AUTH_COOKIE_SECURE).toBe(true);
  });

  it('defaults AUTH_COOKIE_SAME_SITE to lax and accepts it case-insensitively', () => {
    const defaulted = validateEnv(omit(validConfig(), 'AUTH_COOKIE_SAME_SITE'));
    expect(defaulted.AUTH_COOKIE_SAME_SITE).toBe('lax');

    const upper = validateEnv(validConfig({ AUTH_COOKIE_SAME_SITE: 'Lax' }));
    expect(upper.AUTH_COOKIE_SAME_SITE).toBe('lax');
  });

  it('rejects an AUTH_COOKIE_SAME_SITE other than lax', () => {
    expect(() =>
      validateEnv(validConfig({ AUTH_COOKIE_SAME_SITE: 'none' })),
    ).toThrow(/AUTH_COOKIE_SAME_SITE/);
  });
});
