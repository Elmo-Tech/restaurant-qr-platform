import { z } from 'zod';

/**
 * Validates only the API runtime configuration that has a concrete current
 * consumer today (bootstrap host/port/prefix, and the Prisma/PostgreSQL
 * connection string). Other documented `.env.example` variables (Docker
 * Postgres credentials, AI/n8n settings, auth/session settings, etc.) have
 * no current runtime consumer in this application yet and are intentionally
 * left out of this schema rather than being required prematurely.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    API_HOST: z
      .string()
      .trim()
      .min(1, 'API_HOST must not be empty')
      .default('0.0.0.0'),

    API_PORT: z.coerce
      .number({ message: 'API_PORT must be a number' })
      .int('API_PORT must be an integer')
      .min(1, 'API_PORT must be between 1 and 65535')
      .max(65535, 'API_PORT must be between 1 and 65535')
      .default(4000),

    // Trimmed first so whitespace-only input is treated as empty, then
    // checked again after stripping leading slashes so slash-only values
    // (e.g. "/", "///") are rejected as empty prefixes too. main.ts performs
    // the same leading-slash strip before calling setGlobalPrefix, so this
    // mirrors the value it will actually receive.
    API_PREFIX: z
      .string()
      .trim()
      .min(1, 'API_PREFIX must not be empty')
      .refine((value) => value.replace(/^\/+/, '').length > 0, {
        message: 'API_PREFIX must not be empty after removing leading slashes',
      })
      .default('/api/v1'),

    DATABASE_URL: z
      .string({ message: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required')
      .url('DATABASE_URL must be a valid URL')
      .refine(
        (value) =>
          value.startsWith('postgresql://') || value.startsWith('postgres://'),
        { message: 'DATABASE_URL must be a PostgreSQL connection string' },
      ),

    // Approved V1 guidance (.env.example, AUTH_TENANCY_SPEC.md #25,
    // SECURITY_SPEC.md #25): staff Auth Session absolute expiry, ~30 days.
    AUTH_SESSION_TTL_DAYS: z.coerce
      .number({ message: 'AUTH_SESSION_TTL_DAYS must be a number' })
      .int('AUTH_SESSION_TTL_DAYS must be an integer')
      .min(1, 'AUTH_SESSION_TTL_DAYS must be between 1 and 365')
      .max(365, 'AUTH_SESSION_TTL_DAYS must be between 1 and 365')
      .default(30),
  })
  // Unrelated environment variables (AI, n8n, auth, upload, Docker Postgres
  // credentials, etc.) must be allowed through untouched, not rejected and
  // not silently stripped from what ConfigService can still read.
  .passthrough();

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration - ${issues}`);
  }

  return result.data;
}
