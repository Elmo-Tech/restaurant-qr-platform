import { SetMetadata } from '@nestjs/common';

/**
 * FT-9: the stricter, opt-in rate-limit groups. Every route is always
 * counted by the `default` throttler; a route that carries one of these
 * groups is ALSO counted by that group's own (tighter) throttler. Groups are
 * applied with `@RateLimitGroup(...)` rather than `@Throttle(...)` because the
 * limits come from validated environment configuration, which a decorator
 * argument cannot read at import time.
 */
export const RATE_LIMIT_GROUPS = {
  LOGIN: 'login',
  PUBLIC_ORDER: 'publicOrder',
  /** Guest order tracking: polled every few seconds, so a generous limit. */
  PUBLIC_TRACKING: 'publicTracking',
  /** Guest "find my order by phone": strict, it takes a phone number as input. */
  PUBLIC_LOOKUP: 'publicLookup',
} as const;

export type RateLimitGroupName = (typeof RATE_LIMIT_GROUPS)[keyof typeof RATE_LIMIT_GROUPS];

export const RATE_LIMIT_GROUP_KEY = 'rateLimitGroup';

export const RateLimitGroup = (group: RateLimitGroupName) =>
  SetMetadata(RATE_LIMIT_GROUP_KEY, group);
