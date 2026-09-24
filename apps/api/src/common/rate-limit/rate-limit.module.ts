import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { EnvConfig } from '../../config/env.schema';
import { AppThrottlerGuard } from './app-throttler.guard';
import {
  RATE_LIMIT_GROUP_KEY,
  RATE_LIMIT_GROUPS,
  type RateLimitGroupName,
} from './rate-limit-group';

export interface RateLimitSettings {
  enabled: boolean;
  windowSeconds: number;
  defaultLimit: number;
  loginLimit: number;
  publicOrderLimit: number;
}

/**
 * FT-9: builds the throttler set from validated settings. `default` counts
 * every route; `login` and `publicOrder` count ONLY routes tagged with the
 * matching `@RateLimitGroup(...)` (via `skipIf`), so the tighter limits never
 * leak onto unrelated routes. In-memory, per API process, keyed by client IP
 * -- no Redis in V1 (a multi-instance deployment would multiply the effective
 * limit; the reverse proxy adds its own limits too).
 */
export function buildThrottlerOptions(settings: RateLimitSettings): ThrottlerModuleOptions {
  const ttl = settings.windowSeconds * 1000;
  const reflector = new Reflector();
  const notInGroup =
    (group: RateLimitGroupName) =>
    (context: ExecutionContext): boolean =>
      !settings.enabled ||
      reflector.getAllAndOverride<RateLimitGroupName | undefined>(RATE_LIMIT_GROUP_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) !== group;

  return {
    // RATE_LIMIT_ENABLED=false (local/e2e only) skips EVERY throttler. It is
    // applied per throttler because a throttler's own skipIf replaces a
    // module-level one.
    throttlers: [
      { name: 'default', ttl, limit: settings.defaultLimit, skipIf: () => !settings.enabled },
      {
        name: RATE_LIMIT_GROUPS.LOGIN,
        ttl,
        limit: settings.loginLimit,
        skipIf: notInGroup(RATE_LIMIT_GROUPS.LOGIN),
      },
      {
        name: RATE_LIMIT_GROUPS.PUBLIC_ORDER,
        ttl,
        limit: settings.publicOrderLimit,
        skipIf: notInGroup(RATE_LIMIT_GROUPS.PUBLIC_ORDER),
      },
    ],
  };
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        buildThrottlerOptions({
          enabled: config.get('RATE_LIMIT_ENABLED', { infer: true }),
          windowSeconds: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
          defaultLimit: config.get('RATE_LIMIT_DEFAULT_LIMIT', { infer: true }),
          loginLimit: config.get('RATE_LIMIT_LOGIN_LIMIT', { infer: true }),
          publicOrderLimit: config.get('RATE_LIMIT_PUBLIC_ORDER_LIMIT', { infer: true }),
        }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class RateLimitModule {}
