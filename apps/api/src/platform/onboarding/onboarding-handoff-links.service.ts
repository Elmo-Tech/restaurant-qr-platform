import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import { PublicMenuService } from '../../public/public-menu.service';
import { restaurantMenuUrl } from '../../restaurants/menu-link';

export interface OnboardingHandoffLinks {
  guestMenuUrl: string;
  staffLoginUrl: string;
}

@Injectable()
export class OnboardingHandoffLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: PublicMenuService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** A QR is not sufficient: use the same reader that serves the Guest Menu. */
  async readySlug(restaurantId: string, demo: boolean): Promise<string | null> {
    const target = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        status: 'ACTIVE',
        isDemo: demo,
        ...(demo ? { demoExpiresAt: { gt: new Date() } } : {}),
      },
      select: {
        slugs: { where: { isCurrent: true }, select: { slug: true }, take: 1 },
      },
    });
    const slug = target?.slugs[0]?.slug;
    if (!slug) return null;
    const qr = await this.prisma.qrCode.findFirst({
      where: {
        restaurantId,
        type: 'GENERIC',
        status: 'ACTIVE',
        branchId: null,
        tableId: null,
      },
      select: { publicCode: true },
    });
    if (!qr) return null;
    const guest = await this.menus.getPublicMenu({
      publicCode: slug,
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    return guest.outcome === 'found' &&
      guest.data.context.entry.publicCode === qr.publicCode &&
      guest.data.menu.categories.some((category) =>
        category.products.some(
          (product) => product.availability === 'AVAILABLE',
        ),
      )
      ? slug
      : null;
  }

  async resolve(restaurantId: string): Promise<OnboardingHandoffLinks | null> {
    const slug = await this.readySlug(restaurantId, false);
    if (!slug) return null;
    const origin = this.config.get('CORS_ORIGIN', { infer: true });
    const tenantDomain = this.config.get('RESTAURANT_BASE_DOMAIN', {
      infer: true,
    });
    return {
      guestMenuUrl: restaurantMenuUrl(slug, origin, tenantDomain),
      staffLoginUrl: new URL('/login', origin).href,
    };
  }
}
