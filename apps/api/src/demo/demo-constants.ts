/**
 * Temporary demo restaurants (DEC-060). Demo owners use a synthetic address that can never receive mail (`.invalid` is
 * reserved by RFC 2606), which is also how the Backend recognizes a demo user.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.wayta.invalid';

export const isDemoEmail = (emailNormalized: string): boolean =>
  emailNormalized.endsWith(`@${DEMO_EMAIL_DOMAIN}`);

/**
 * The kinds of business a demo can show. Each kind has its own template folder under `apps/api/demo-template/<kind>/`
 * (DEC-061): a restaurant, a café and a sweets shop. A demo without a stored kind (made before kinds existed) is a restaurant.
 */
export const DEMO_KINDS = ['restaurant', 'cafe', 'sweets'] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];
export const DEFAULT_DEMO_KIND: DemoKind = 'restaurant';
export const isDemoKind = (value: unknown): value is DemoKind =>
  typeof value === 'string' &&
  (DEMO_KINDS as readonly string[]).includes(value);

/** How long a demo can be created for, in hours. */
export const DEMO_MIN_HOURS = 1;
export const DEMO_MAX_HOURS = 24 * 14;

/** The most demos that may exist at once (a purge that falls behind must never let them pile up). */
export const DEFAULT_MAX_ACTIVE_DEMOS = 20;
/** After the expiry the demo is locked at once and removed this long after, so it can still be extended. */
export const DEFAULT_PURGE_GRACE_MINUTES = 60;
