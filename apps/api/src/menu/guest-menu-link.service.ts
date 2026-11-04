import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** The Restaurant's existing public Guest Menu entry point, or `null` when it has no ACTIVE GENERIC QR. */
export interface GuestMenuLink {
  publicCode: string | null;
  /** The readable link (DEC-066): the menu is `/q/{slug}`. Null until the Restaurant has one; then `/q/{publicCode}` is the link. */
  slug: string | null;
}

/**
 * FT-7 Staff quick action: exposes the `publicCode` of the Restaurant's
 * existing ACTIVE GENERIC QR so Staff can open `/q/:publicCode` without
 * copying a URL. Strictly read-only -- it never creates or activates a QR.
 * `restaurantId` is the Backend-authorized value from
 * `request.restaurantAccess`, never client input.
 */
@Injectable()
export class GuestMenuLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async getGuestMenuLink(restaurantId: string): Promise<GuestMenuLink> {
    const qr = await this.prisma.qrCode.findFirst({
      where: { restaurantId, type: 'GENERIC', status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { publicCode: true },
    });
    const current = qr
      ? await this.prisma.restaurantSlug.findFirst({
          where: { restaurantId, isCurrent: true },
          select: { slug: true },
        })
      : null;
    return { publicCode: qr?.publicCode ?? null, slug: current?.slug ?? null };
  }
}
