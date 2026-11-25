import { validateEnv } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('validateEnv -- rate limiting / proxy (FT-9)', () => {
  it('applies generous, safe defaults', () => {
    const result = validateEnv(BASE);

    expect(result).toMatchObject({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_DEFAULT_LIMIT: 300,
      RATE_LIMIT_LOGIN_LIMIT: 10,
      RATE_LIMIT_PUBLIC_ORDER_LIMIT: 30,
      RATE_LIMIT_PUBLIC_QUOTE_LIMIT: 60,
      TRUST_PROXY_HOPS: 0,
      ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT: 10,
      ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT: 30,
      ONBOARDING_IMPORT_OPERATOR_CONCURRENCY: 1,
      ONBOARDING_IMPORT_GLOBAL_CONCURRENCY: 3,
    });
  });

  it('reads configured values', () => {
    const result = validateEnv({
      ...BASE,
      RATE_LIMIT_ENABLED: 'false',
      RATE_LIMIT_LOGIN_LIMIT: '5',
      RATE_LIMIT_PUBLIC_ORDER_LIMIT: '12',
      RATE_LIMIT_PUBLIC_QUOTE_LIMIT: '45',
      TRUST_PROXY_HOPS: '1',
    });

    expect(result).toMatchObject({
      RATE_LIMIT_ENABLED: false,
      RATE_LIMIT_LOGIN_LIMIT: 5,
      RATE_LIMIT_PUBLIC_ORDER_LIMIT: 12,
      RATE_LIMIT_PUBLIC_QUOTE_LIMIT: 45,
      TRUST_PROXY_HOPS: 1,
    });
  });

  it.each([
    ['ONBOARDING_IMPORT_OPERATOR_DAILY_LIMIT', '0'],
    ['ONBOARDING_IMPORT_GLOBAL_DAILY_LIMIT', '-1'],
    ['ONBOARDING_IMPORT_OPERATOR_CONCURRENCY', '1.5'],
    ['ONBOARDING_IMPORT_GLOBAL_CONCURRENCY', 'abc'],
    ['RATE_LIMIT_ENABLED', 'yes'],
    ['RATE_LIMIT_LOGIN_LIMIT', '0'],
    ['RATE_LIMIT_WINDOW_SECONDS', '0'],
    ['RATE_LIMIT_PUBLIC_ORDER_LIMIT', 'lots'],
    ['RATE_LIMIT_PUBLIC_QUOTE_LIMIT', '0'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['TRUST_PROXY_HOPS', '99'],
  ])('rejects an invalid %s=%s at startup', (key, value) => {
    expect(() => validateEnv({ ...BASE, [key]: value })).toThrow(
      'Invalid environment configuration',
    );
  });
});
