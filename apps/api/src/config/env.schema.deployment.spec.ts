import { validateEnv } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@postgres:5432/db',
  CORS_ORIGIN: 'https://menu.example.com',
};

/** The Coolify compose file (infra/docker/compose.coolify.yml) always passes these, empty when not configured. */
describe('validateEnv -- production deployment (Coolify)', () => {
  it('treats an empty optional n8n URL and secret as "not configured"', () => {
    const result = validateEnv({
      ...BASE,
      N8N_MENU_IMPORT_URL: '',
      N8N_MENU_IMPORT_SECRET: '',
    });

    expect(result.N8N_MENU_IMPORT_URL).toBeUndefined();
    expect(result.N8N_MENU_IMPORT_SECRET).toBeUndefined();
  });

  it('still validates a configured n8n URL', () => {
    expect(() =>
      validateEnv({ ...BASE, N8N_MENU_IMPORT_URL: 'not a url' }),
    ).toThrow(/N8N_MENU_IMPORT_URL/);
    expect(
      validateEnv({
        ...BASE,
        N8N_MENU_IMPORT_URL: 'https://n8n.example.com/webhook/x',
      }).N8N_MENU_IMPORT_URL,
    ).toBe('https://n8n.example.com/webhook/x');
  });

  it('accepts the production values the compose file sets', () => {
    const result = validateEnv({
      ...BASE,
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '4000',
      API_PREFIX: '/api/v1',
      PLATFORM_ORIGIN: 'https://control.example.com',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_COOKIE_SAME_SITE: 'lax',
      TRUST_PROXY_HOPS: '2',
      UPLOAD_LOCAL_DIR: '/var/lib/restaurant-qr/uploads',
      LOG_LEVEL: 'warn',
    });

    expect(result).toMatchObject({
      NODE_ENV: 'production',
      API_PORT: 4000,
      AUTH_COOKIE_SECURE: true,
      TRUST_PROXY_HOPS: 2,
      PLATFORM_ORIGIN: 'https://control.example.com',
      LOG_LEVEL: 'warn',
    });
  });

  it('rejects an unsupported production log level', () => {
    expect(() => validateEnv({ ...BASE, LOG_LEVEL: 'trace' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('refuses to start in production without secure cookies', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'false',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE must be true in production/);
  });
});
