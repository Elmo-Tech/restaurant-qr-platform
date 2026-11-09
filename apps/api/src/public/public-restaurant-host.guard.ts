import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { looksLikeSlug, RESERVED_SLUGS } from '../restaurants/restaurant-slug';

const QR_NOT_FOUND = {
  error: { code: 'QR_NOT_FOUND', message: 'This QR code is not available.' },
};

/**
 * On a restaurant subdomain, an opaque QR code or readable slug MUST belong
 * to that exact restaurant. A foreign QR is deliberately indistinguishable
 * from a nonexistent QR (including on order and tracking POSTs).
 *
 * Apex/legacy paths retain the established QR capability flow. This guard
 * does not grant access: the existing public QR services still validate
 * Restaurant, Table, order/session state, prices, limits and entitlements.
 */
@Injectable()
export class PublicRestaurantHostGuard implements CanActivate {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const baseDomain = this.config.get('RESTAURANT_BASE_DOMAIN', { infer: true });
    if (!baseDomain) return true; // Opt-in; no change to existing deployments.

    const request = context.switchToHttp().getRequest<{
      headers: { host?: string };
      params: { publicCode?: string };
    }>();
    const host = (request.headers.host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    const base = baseDomain.toLowerCase();
    if (host === base || !host.endsWith(`.${base}`)) return true;

    // Even unexpected/nested/reserved hosts fail closed if misrouted to the API.
    const label = host.slice(0, -base.length - 1);
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label) ||
      label.length < 3 || label.length > 40 || RESERVED_SLUGS.has(label)
    ) this.notFound();

    const publicCode = request.params.publicCode;
    if (!publicCode) this.notFound();

    let restaurantId: string | undefined;
    if (looksLikeSlug(publicCode)) {
      const alias = await this.db.restaurantSlug.findUnique({
        where: { slug: publicCode },
        select: { restaurantId: true },
      });
      restaurantId = alias?.restaurantId;
    }
    if (!restaurantId) {
      const qr = await this.db.qrCode.findUnique({
        where: { publicCode },
        select: { restaurantId: true },
      });
      restaurantId = qr?.restaurantId;
    }
    if (!restaurantId) this.notFound();

    const current = await this.db.restaurantSlug.findFirst({
      where: { restaurantId, isCurrent: true },
      select: { slug: true },
    });
    if (current?.slug !== label) this.notFound();
    return true;
  }

  private notFound(): never {
    throw new NotFoundException(QR_NOT_FOUND);
  }
}
