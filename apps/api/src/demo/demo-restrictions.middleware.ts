import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { extractSessionCookie } from '../auth/guard/session-cookie.extractor';
import { AuthSessionService } from '../auth/session/auth-session.service';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { isDemoEmail } from './demo-constants';
import { matchRestriction } from './demo-restrictions';

const CACHE_MS = 30_000;

/**
 * Enforces `RESTRICTED_ROUTES` for demo restaurants in the Backend, so a prospect cannot get around the screen by
 * calling the API. A route that is not in the list costs nothing: the check is a path match before any query.
 */
@Injectable()
export class DemoRestrictionsMiddleware implements NestMiddleware {
  private readonly demoCache = new Map<
    string,
    { isDemo: boolean; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const path = this.pathAfterPrefix(request.originalUrl);
      const match = matchRestriction(request.method, path);
      if (!match) return next();
      const demo = match.restaurantId
        ? await this.isDemoRestaurant(match.restaurantId)
        : await this.isDemoSession(request);
      if (!demo) return next();
      response.status(403).json({
        error: {
          code: 'DEMO_RESTRICTED',
          message: 'This is not available in a demo restaurant.',
          details: { reason: match.route.reason },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private pathAfterPrefix(originalUrl: string): string {
    const path = originalUrl.split('?')[0];
    const prefix = `/${this.config.get('API_PREFIX', { infer: true }).replace(/^\/+|\/+$/g, '')}`;
    return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
  }

  private async isDemoRestaurant(restaurantId: string): Promise<boolean> {
    const cached = this.demoCache.get(restaurantId);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.isDemo;
    const row = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isDemo: true },
    });
    const isDemo = row?.isDemo === true;
    this.demoCache.set(restaurantId, { isDemo, at: Date.now() });
    if (this.demoCache.size > 500) this.demoCache.clear();
    return isDemo;
  }

  private async isDemoSession(request: Request): Promise<boolean> {
    const cookieName = this.config.get('AUTH_SESSION_COOKIE_NAME', {
      infer: true,
    });
    const raw = extractSessionCookie(request.headers.cookie, cookieName);
    if (!raw) return false;
    const resolved = await this.sessions.resolveSession(raw);
    if (!resolved) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: resolved.userId },
      select: { emailNormalized: true },
    });
    return user !== null && isDemoEmail(user.emailNormalized);
  }
}
