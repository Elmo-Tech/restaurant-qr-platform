/**
 * Temporary demo restaurants (DEC-060). Demo owners use a synthetic address that can never receive mail (`.invalid` is
 * reserved by RFC 2606), which is also how the Backend recognizes a demo user.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.wayta.invalid';

export const isDemoEmail = (emailNormalized: string): boolean =>
  emailNormalized.endsWith(`@${DEMO_EMAIL_DOMAIN}`);

/** How long a demo can be created for, in hours. */
export const DEMO_MIN_HOURS = 1;
export const DEMO_MAX_HOURS = 24 * 14;

/** The most demos that may exist at once (a purge that falls behind must never let them pile up). */
export const DEFAULT_MAX_ACTIVE_DEMOS = 20;
/** After the expiry the demo is locked at once and removed this long after, so it can still be extended. */
export const DEFAULT_PURGE_GRACE_MINUTES = 60;
