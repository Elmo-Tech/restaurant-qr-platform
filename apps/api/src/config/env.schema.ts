import { z } from 'zod';

/**
 * Validates only the API runtime configuration that has a concrete current
 * consumer today (bootstrap host/port/prefix, the Prisma/PostgreSQL
 * connection string, Auth Session TTL, Staff Invitation TTL, CORS origin,
 * and the HTTP login cookie policy). Other documented `.env.example`
 * variables (Docker Postgres credentials, AI/n8n settings, password reset
 * settings, etc.) have no current runtime consumer in this application yet
 * and are intentionally left out of this schema rather than being required
 * prematurely.
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

    // Approved V1 guidance (.env.example, AUTH_TENANCY_SPEC.md #11/#107,
    // SECURITY_SPEC.md #68-69): a single explicit trusted Web origin.
    // Never a wildcard -- this is used with credentialed CORS.
    CORS_ORIGIN: z
      .string({ message: 'CORS_ORIGIN is required' })
      .min(1, 'CORS_ORIGIN is required')
      .url('CORS_ORIGIN must be a valid URL')
      .refine((value) => value !== '*', {
        message:
          'CORS_ORIGIN must not be a wildcard (SECURITY_SPEC.md #68: never combine credentials=true with origin=*)',
      }),

    // Business Foundation S, settled contract (AUTH_TENANCY_SPEC.md #78):
    // Staff Invitation absolute expiry, 7 days by default. Already
    // documented in .env.example as RESTAURANT_INVITATION_TTL_DAYS=7 --
    // this wires that existing variable into runtime validation for the
    // first time; the name is unchanged.
    RESTAURANT_INVITATION_TTL_DAYS: z.coerce
      .number({ message: 'RESTAURANT_INVITATION_TTL_DAYS must be a number' })
      .int('RESTAURANT_INVITATION_TTL_DAYS must be an integer')
      .min(1, 'RESTAURANT_INVITATION_TTL_DAYS must be a positive integer')
      .default(7),

    // Exact name is an implementation detail (AUTH_TENANCY_SPEC.md #22).
    AUTH_SESSION_COOKIE_NAME: z
      .string()
      .trim()
      .min(1, 'AUTH_SESSION_COOKIE_NAME must not be empty')
      .default('restaurant_session'),

    // AUTH_TENANCY_SPEC.md #24, SECURITY_SPEC.md #23: Production auth
    // cookies must require HTTPS. Local development may relax this only for
    // plain-http localhost. Enforced against NODE_ENV below.
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'], {
        message: 'AUTH_COOKIE_SECURE must be "true" or "false"',
      })
      .default('false')
      .transform((value) => value === 'true'),

    // AUTH_TENANCY_SPEC.md #22, SECURITY_SPEC.md #21: SameSite=Lax is the
    // only V1-approved policy -- not a free-form per-deployment choice.
    AUTH_COOKIE_SAME_SITE: z
      .string()
      .trim()
      .toLowerCase()
      .default('lax')
      .refine((value) => value === 'lax', {
        message:
          'AUTH_COOKIE_SAME_SITE must be "lax" (AUTH_TENANCY_SPEC.md #22 is the only V1-approved policy)',
      }),
  })
  // Unrelated environment variables (AI, n8n, auth, upload, Docker Postgres
  // credentials, etc.) must be allowed through untouched, not rejected and
  // not silently stripped from what ConfigService can still read.
  .passthrough()
  .superRefine((config, ctx) => {
    // AUTH_TENANCY_SPEC.md #24, SECURITY_SPEC.md #23: this invariant is
    // enforced at startup rather than trusted from a possibly-stale .env.
    if (config.NODE_ENV === 'production' && !config.AUTH_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message:
          'AUTH_COOKIE_SECURE must be true in production (AUTH_TENANCY_SPEC.md #24, SECURITY_SPEC.md #23)',
      });
    }
  });

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
