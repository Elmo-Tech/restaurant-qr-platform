import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import {
  planNameTranslations,
  type NameTranslationView,
} from '../common/name-translations';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { BranchStatus, DeliveryZoneStatus } from '../generated/prisma/client';

/** Safe Staff-facing Delivery zone. Money is always an exact decimal string. */
export interface DeliveryZoneView {
  id: string;
  /** The default-locale name (also the legacy single-language value). */
  name: string;
  /** Per-locale display names; always includes the default locale. */
  translations: NameTranslationView[];
  deliveryFee: string;
  minimumOrder: string;
  status: DeliveryZoneStatus;
  displayOrder: number;
  /** True only when no Order has ever referenced this zone -- otherwise it can only be deactivated (history stays intact). */
  canDelete: boolean;
}

export interface DeliveryBranchView {
  id: string;
  name: string;
  /** The Branch's per-locale names, so the Delivery screen can show the right language. */
  translations: NameTranslationView[];
  status: BranchStatus;
  zones: DeliveryZoneView[];
}

/** Exactly the fields `RestaurantAccessGuard` already produced -- never client input. */
export interface AuthorizedDeliveryScope {
  restaurantId: string;
  membershipId: string;
  allBranches: boolean;
}

export interface CreateDeliveryZoneInput {
  restaurantId: string;
  branchId: string;
  name: string;
  translations?: NameTranslationView[];
  deliveryFee: string;
  minimumOrder: string;
  status: DeliveryZoneStatus;
  displayOrder?: number;
}

export interface UpdateDeliveryZoneInput {
  restaurantId: string;
  zoneId: string;
  name?: string;
  translations?: NameTranslationView[];
  deliveryFee?: string;
  minimumOrder?: string;
  status?: DeliveryZoneStatus;
  displayOrder?: number;
}

export type CreateDeliveryZoneResult =
  | { outcome: 'created'; data: DeliveryZoneView }
  | { outcome: 'branchNotFound' }
  | { outcome: 'defaultNameRequired' };

export type UpdateDeliveryZoneResult =
  | { outcome: 'updated'; data: DeliveryZoneView }
  | { outcome: 'zoneNotFound' }
  | { outcome: 'defaultNameRequired' };

/**
 * `hasOrders` wins over `usedByPromotions` when both apply: Orders block the deletion for good (deactivate
 * instead), whereas promotion targets could be edited -- and doing so would still not make the zone deletable.
 */
export type DeleteDeliveryZoneResult =
  | { outcome: 'deleted' }
  | { outcome: 'zoneNotFound' }
  | { outcome: 'hasOrders' }
  | { outcome: 'usedByPromotions' };

const TRANSLATIONS_SELECT = {
  select: { locale: true, name: true },
  orderBy: { locale: 'asc' },
} as const;

const ZONE_SELECT = {
  id: true,
  name: true,
  translations: TRANSLATIONS_SELECT,
  deliveryFee: true,
  minimumOrder: true,
  status: true,
  displayOrder: true,
  _count: { select: { orders: true, promotionLinks: true } },
} satisfies Prisma.DeliveryZoneSelect;

function toZoneView(zone: {
  id: string;
  name: string;
  translations: NameTranslationView[];
  deliveryFee: Prisma.Decimal;
  minimumOrder: Prisma.Decimal;
  status: DeliveryZoneStatus;
  displayOrder: number;
  _count: { orders: number; promotionLinks: number };
}): DeliveryZoneView {
  return {
    id: zone.id,
    name: zone.name,
    translations: zone.translations,
    deliveryFee: zone.deliveryFee.toFixed(2),
    minimumOrder: zone.minimumOrder.toFixed(2),
    status: zone.status,
    displayOrder: zone.displayOrder,
    canDelete: zone._count.orders === 0 && zone._count.promotionLinks === 0,
  };
}

/**
 * Unified Promotions (DEC-075): `promotion_delivery_zones` references a zone ON DELETE RESTRICT, so a zone targeted
 * by a promotion is never silently removed (an empty zone list means "all zones" and would widen the promotion).
 */
const PROMOTION_ZONE_FOREIGN_KEY = 'promotion_delivery_zones_zone_scope_fkey';

/**
 * Which reference refused the delete. The driver-adapter client reports the violated constraint name at
 * `meta.driverAdapterError.cause.constraint.index` (same shape as the P2002 handling in `tables.service.ts`,
 * verified for this P2003 against real PostgreSQL in `delivery-zone-delete-postgres.e2e-spec.ts`). Only the
 * promotion constraint maps to `usedByPromotions`; any other foreign key (the Order one) keeps the existing
 * `hasOrders` answer.
 */
function foreignKeyViolationOutcome(
  error: unknown,
): 'hasOrders' | 'usedByPromotions' | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2003'
  ) {
    return null;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index ===
    PROMOTION_ZONE_FOREIGN_KEY
    ? 'usedByPromotions'
    : 'hasOrders';
}

/**
 * FT-8: Staff management of Branch Delivery zones. Every query is explicitly
 * scoped by the authorized `restaurantId` (Tenant authority comes only from
 * the authenticated context); a foreign Restaurant's Branch or zone is
 * indistinguishable from a nonexistent one. Zones are never hard-deleted
 * once an Order references them (deactivate instead) -- the Order FK is
 * Restrict as a backstop, and Orders carry their own snapshots anyway.
 * Likewise a zone targeted by a promotion (`promotion_delivery_zones`,
 * Restrict) is refused with its own outcome, never reported as "has orders".
 */
@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every Branch the Membership may see, each with all of its zones (ACTIVE and INACTIVE). */
  async listDeliveryBranches(scope: AuthorizedDeliveryScope): Promise<DeliveryBranchView[]> {
    let assignedBranchIds: string[] | undefined;
    if (!scope.allBranches) {
      const assignments = await this.prisma.restaurantMembershipBranch.findMany({
        where: {
          restaurantMembershipId: scope.membershipId,
          branch: { restaurantId: scope.restaurantId },
        },
        select: { branchId: true },
      });
      assignedBranchIds = assignments.map((row) => row.branchId);
    }

    const branches = await this.prisma.branch.findMany({
      where: {
        restaurantId: scope.restaurantId,
        ...(assignedBranchIds ? { id: { in: assignedBranchIds } } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        translations: TRANSLATIONS_SELECT,
        status: true,
        deliveryZones: {
          where: { restaurantId: scope.restaurantId },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: ZONE_SELECT,
        },
      },
    });

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      translations: branch.translations,
      status: branch.status,
      zones: branch.deliveryZones.map(toZoneView),
    }));
  }

  async createZone(input: CreateDeliveryZoneInput): Promise<CreateDeliveryZoneResult> {
    if (!isWellFormedUuid(input.branchId)) {
      return { outcome: 'branchNotFound' };
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, restaurantId: input.restaurantId },
      select: {
        id: true,
        restaurant: { select: { defaultLocale: true } },
        _count: { select: { deliveryZones: true } },
      },
    });
    if (!branch) {
      return { outcome: 'branchNotFound' };
    }
    const planned = planNameTranslations({
      defaultLocale: branch.restaurant.defaultLocale,
      name: input.name,
      translations: input.translations,
    });
    if (!planned.ok) {
      return { outcome: 'defaultNameRequired' };
    }

    const created = await this.prisma.deliveryZone.create({
      data: {
        restaurantId: input.restaurantId,
        branchId: branch.id,
        name: planned.plan.name ?? input.name,
        translations: { create: planned.plan.upserts },
        deliveryFee: new Prisma.Decimal(input.deliveryFee),
        minimumOrder: new Prisma.Decimal(input.minimumOrder),
        status: input.status,
        displayOrder: input.displayOrder ?? branch._count.deliveryZones,
      },
      select: ZONE_SELECT,
    });
    return { outcome: 'created', data: toZoneView(created) };
  }

  async updateZone(input: UpdateDeliveryZoneInput): Promise<UpdateDeliveryZoneResult> {
    if (!isWellFormedUuid(input.zoneId)) {
      return { outcome: 'zoneNotFound' };
    }
    const existing = await this.prisma.deliveryZone.findFirst({
      where: { id: input.zoneId, restaurantId: input.restaurantId },
      select: { id: true, restaurant: { select: { defaultLocale: true } } },
    });
    if (!existing) {
      return { outcome: 'zoneNotFound' };
    }
    const planned = planNameTranslations({
      defaultLocale: existing.restaurant.defaultLocale,
      name: input.name,
      translations: input.translations,
    });
    if (!planned.ok) {
      return { outcome: 'defaultNameRequired' };
    }
    const { plan } = planned;

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const row of plan.upserts) {
        await tx.deliveryZoneTranslation.upsert({
          where: {
            deliveryZoneId_locale: { deliveryZoneId: existing.id, locale: row.locale },
          },
          create: { deliveryZoneId: existing.id, locale: row.locale, name: row.name },
          update: { name: row.name },
        });
      }
      if (plan.deleteLocales.length > 0) {
        await tx.deliveryZoneTranslation.deleteMany({
          where: { deliveryZoneId: existing.id, locale: { in: plan.deleteLocales } },
        });
      }
      return tx.deliveryZone.update({
      where: { id: existing.id },
      data: {
        ...(plan.name !== undefined ? { name: plan.name } : {}),
        ...(input.deliveryFee !== undefined
          ? { deliveryFee: new Prisma.Decimal(input.deliveryFee) }
          : {}),
        ...(input.minimumOrder !== undefined
          ? { minimumOrder: new Prisma.Decimal(input.minimumOrder) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      },
      select: ZONE_SELECT,
      });
    });
    return { outcome: 'updated', data: toZoneView(updated) };
  }

  async deleteZone(scope: { restaurantId: string; zoneId: string }): Promise<DeleteDeliveryZoneResult> {
    if (!isWellFormedUuid(scope.zoneId)) {
      return { outcome: 'zoneNotFound' };
    }
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id: scope.zoneId, restaurantId: scope.restaurantId },
      select: {
        id: true,
        _count: { select: { orders: true, promotionLinks: true } },
      },
    });
    if (!zone) {
      return { outcome: 'zoneNotFound' };
    }
    if (zone._count.orders > 0) {
      return { outcome: 'hasOrders' };
    }
    if (zone._count.promotionLinks > 0) {
      return { outcome: 'usedByPromotions' };
    }

    try {
      await this.prisma.deliveryZone.delete({ where: { id: zone.id } });
    } catch (error) {
      // An Order or a promotion target referenced the zone between the check and the delete.
      const outcome = foreignKeyViolationOutcome(error);
      if (outcome) {
        return { outcome };
      }
      throw error;
    }
    return { outcome: 'deleted' };
  }
}
