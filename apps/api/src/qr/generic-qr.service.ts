import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { QrStatus } from '../generated/prisma/client';
import { createQrPublicCode } from './qr-public-code';

/** Safe Staff-facing Generic QR shape -- never the internal ids. */
export interface GenericQrView {
  publicCode: string;
  status: QrStatus;
  /** The Restaurant's readable menu link segment (DEC-066); null until it has one. */
  slug: string | null;
}

export type CreateGenericQrResult =
  | { outcome: 'created'; data: GenericQrView }
  | { outcome: 'alreadyExists' };

export type UpdateGenericQrResult =
  | { outcome: 'updated'; data: GenericQrView }
  | { outcome: 'notFound' };

/** The partial unique index that allows at most one GENERIC QR row per Restaurant (see the FT-9 migration). */
const ONE_GENERIC_QR_INDEX = 'qr_codes_one_generic_qr_per_restaurant';

function isOneGenericQrConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === ONE_GENERIC_QR_INDEX;
}

const GENERIC_QR_SELECT = { publicCode: true, status: true } satisfies Prisma.QrCodeSelect;

/**
 * FT-9: management of the Restaurant-wide GENERIC QR (the public entry point
 * for Pickup and Delivery). One per Restaurant; it has no Branch and no
 * Table, and resolves the Restaurant's current primary ACTIVE Menu. Tenant
 * authority is only ever the authorized `restaurantId` passed in by the
 * controller. Lifecycle follows the existing QR convention: a QR is never
 * deleted, only toggled ACTIVE/INACTIVE (an INACTIVE QR resolves to the
 * generic "QR not found" on the public side).
 */
@Injectable()
export class GenericQrService {
  constructor(private readonly prisma: PrismaService) {}

  async getGenericQr(restaurantId: string): Promise<GenericQrView | null> {
    const qr = await this.prisma.qrCode.findFirst({
      where: { restaurantId, type: 'GENERIC' },
      select: GENERIC_QR_SELECT,
    });
    return qr ? { ...qr, slug: await this.currentSlug(restaurantId) } : null;
  }

  private async currentSlug(restaurantId: string): Promise<string | null> {
    const row = await this.prisma.restaurantSlug.findFirst({
      where: { restaurantId, isCurrent: true },
      select: { slug: true },
    });
    return row?.slug ?? null;
  }

  async createGenericQr(restaurantId: string): Promise<CreateGenericQrResult> {
    const existing = await this.getGenericQr(restaurantId);
    if (existing) {
      return { outcome: 'alreadyExists' };
    }
    try {
      const created = await this.prisma.qrCode.create({
        data: {
          publicCode: createQrPublicCode(),
          restaurantId,
          branchId: null,
          tableId: null,
          type: 'GENERIC',
          status: 'ACTIVE',
        },
        select: GENERIC_QR_SELECT,
      });
      return { outcome: 'created', data: { ...created, slug: await this.currentSlug(restaurantId) } };
    } catch (error) {
      // A concurrent double-create lost to the one-per-Restaurant index.
      if (isOneGenericQrConflict(error)) {
        return { outcome: 'alreadyExists' };
      }
      throw error;
    }
  }

  async updateStatus(restaurantId: string, status: QrStatus): Promise<UpdateGenericQrResult> {
    const existing = await this.prisma.qrCode.findFirst({
      where: { restaurantId, type: 'GENERIC' },
      select: { id: true },
    });
    if (!existing) {
      return { outcome: 'notFound' };
    }
    const updated = await this.prisma.qrCode.update({
      where: { id: existing.id },
      data: { status },
      select: GENERIC_QR_SELECT,
    });
    return { outcome: 'updated', data: { ...updated, slug: await this.currentSlug(restaurantId) } };
  }
}
