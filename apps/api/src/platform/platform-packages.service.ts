import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FEATURE_KEYS, type FeatureKey } from '../entitlements/features';
import { Prisma, type PackageStatus } from '../generated/prisma/client';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';

export interface PackageView {
  id: string;
  name: string;
  description: string | null;
  status: PackageStatus;
  /** Money as strings (API_CONVENTIONS), display only: there is no billing yet. */
  monthlyPrice: string | null;
  yearlyPrice: string | null;
  currencyCode: string | null;
  /** The features this package includes. */
  features: FeatureKey[];
  restaurantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackageDetail extends PackageView {
  restaurants: { id: string; name: string; status: string }[];
}

export interface PackageInput {
  name: string;
  description: string | null;
  monthlyPrice: string | null;
  yearlyPrice: string | null;
  currencyCode: string | null;
  features: FeatureKey[];
  status: PackageStatus;
}

/** Why a package or Restaurant change was refused (the controller maps these to HTTP errors). */
export type PackageRefusal =
  | 'NOT_FOUND'
  | 'RESTAURANT_NOT_FOUND'
  | 'NAME_TAKEN'
  | 'CURRENCY_REQUIRED'
  | 'IN_USE'
  | 'ARCHIVED';

export type PackageOutcome<T> =
  { outcome: 'ok'; data: T } | { outcome: PackageRefusal };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_RESTAURANTS = 100;

const packageSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  monthlyPrice: true,
  yearlyPrice: true,
  currencyCode: true,
  createdAt: true,
  updatedAt: true,
  features: { select: { feature: true } },
  _count: { select: { restaurants: true } },
} satisfies Prisma.PackageSelect;

type PackageRow = Prisma.PackageGetPayload<{ select: typeof packageSelect }>;

/** "Pizza  Plus" and "pizza plus" are the same package name. */
const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

const toView = (row: PackageRow): PackageView => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  monthlyPrice: row.monthlyPrice ? row.monthlyPrice.toFixed(2) : null,
  yearlyPrice: row.yearlyPrice ? row.yearlyPrice.toFixed(2) : null,
  currencyCode: row.currencyCode,
  // keep the documented feature order, not the storage order
  features: FEATURE_KEYS.filter((key) =>
    row.features.some((f) => f.feature === key),
  ),
  restaurantCount: row._count.restaurants,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Packages (DEC-046): named bundles of the platform features that the platform team creates and
 * assigns to Restaurants. Editing a package applies to every Restaurant on it at once. Money
 * values are only shown; nothing here bills anyone.
 */
@Injectable()
export class PlatformPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(): Promise<PackageView[]> {
    const rows = await this.prisma.package.findMany({
      select: packageSelect,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toView);
  }

  async detail(packageId: string): Promise<PackageOutcome<PackageDetail>> {
    if (!UUID.test(packageId)) return { outcome: 'NOT_FOUND' };
    const row = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: {
        ...packageSelect,
        restaurants: {
          select: { id: true, name: true, status: true },
          orderBy: { name: 'asc' },
          take: DETAIL_RESTAURANTS,
        },
      },
    });
    if (!row) return { outcome: 'NOT_FOUND' };
    return {
      outcome: 'ok',
      data: { ...toView(row), restaurants: row.restaurants },
    };
  }

  async create(
    admin: PlatformAdminPrincipal,
    input: PackageInput,
  ): Promise<PackageOutcome<PackageView>> {
    if (hasPriceWithoutCurrency(input)) return { outcome: 'CURRENCY_REQUIRED' };
    try {
      const row = await this.prisma.package.create({
        data: {
          name: input.name,
          nameNormalized: normalizeName(input.name),
          description: input.description,
          status: input.status,
          monthlyPrice: input.monthlyPrice,
          yearlyPrice: input.yearlyPrice,
          currencyCode: input.currencyCode,
          features: { create: input.features.map((feature) => ({ feature })) },
        },
        select: packageSelect,
      });
      await this.audit.record({
        admin,
        action: 'package.created',
        details: { packageId: row.id, name: row.name },
      });
      return { outcome: 'ok', data: toView(row) };
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'NAME_TAKEN' };
      throw error;
    }
  }

  async update(
    admin: PlatformAdminPrincipal,
    packageId: string,
    patch: Partial<PackageInput>,
  ): Promise<PackageOutcome<PackageView>> {
    if (!UUID.test(packageId)) return { outcome: 'NOT_FOUND' };
    const before = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: packageSelect,
    });
    if (!before) return { outcome: 'NOT_FOUND' };
    const current = toView(before);
    const next: PackageInput = {
      name: patch.name ?? current.name,
      description:
        patch.description === undefined
          ? current.description
          : patch.description,
      monthlyPrice:
        patch.monthlyPrice === undefined
          ? current.monthlyPrice
          : patch.monthlyPrice,
      yearlyPrice:
        patch.yearlyPrice === undefined
          ? current.yearlyPrice
          : patch.yearlyPrice,
      currencyCode:
        patch.currencyCode === undefined
          ? current.currencyCode
          : patch.currencyCode,
      features: patch.features ?? current.features,
      status: patch.status ?? current.status,
    };
    if (hasPriceWithoutCurrency(next)) return { outcome: 'CURRENCY_REQUIRED' };

    const featuresChanged =
      patch.features !== undefined && !sameSet(current.features, next.features);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (featuresChanged) {
          await tx.packageFeature.deleteMany({ where: { packageId } });
          await tx.packageFeature.createMany({
            data: next.features.map((feature) => ({ packageId, feature })),
          });
        }
        return tx.package.update({
          where: { id: packageId },
          data: {
            name: next.name,
            nameNormalized: normalizeName(next.name),
            description: next.description,
            status: next.status,
            monthlyPrice: next.monthlyPrice,
            yearlyPrice: next.yearlyPrice,
            currencyCode: next.currencyCode,
          },
          select: packageSelect,
        });
      });
      const changes = changedFields(current, next);
      if (changes.length > 0) {
        await this.audit.record({
          admin,
          action: 'package.updated',
          details: {
            packageId,
            name: row.name,
            changes,
            featuresAdded: next.features.filter(
              (f) => !current.features.includes(f),
            ),
            featuresRemoved: current.features.filter(
              (f) => !next.features.includes(f),
            ),
            restaurants: current.restaurantCount,
          },
        });
      }
      return { outcome: 'ok', data: toView(row) };
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'NAME_TAKEN' };
      throw error;
    }
  }

  /** Delete a package nobody uses; a package in use is archived instead. */
  async remove(
    admin: PlatformAdminPrincipal,
    packageId: string,
  ): Promise<PackageOutcome<null>> {
    if (!UUID.test(packageId)) return { outcome: 'NOT_FOUND' };
    const row = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: {
        id: true,
        name: true,
        _count: { select: { restaurants: true } },
      },
    });
    if (!row) return { outcome: 'NOT_FOUND' };
    if (row._count.restaurants > 0) return { outcome: 'IN_USE' };
    try {
      await this.prisma.package.delete({ where: { id: packageId } });
    } catch (error) {
      // a Restaurant was assigned between the check and the delete (RESTRICT)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        return { outcome: 'IN_USE' };
      }
      throw error;
    }
    await this.audit.record({
      admin,
      action: 'package.deleted',
      details: { packageId: row.id, name: row.name },
    });
    return { outcome: 'ok', data: null };
  }

  /** Put a Restaurant on a package, or take it off (`null`: back to every feature, DEC-043). */
  async assign(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    packageId: string | null,
  ): Promise<PackageOutcome<{ packageId: string | null }>> {
    if (!UUID.test(restaurantId)) return { outcome: 'RESTAURANT_NOT_FOUND' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        packageId: true,
        package: { select: { name: true } },
      },
    });
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' };

    let target: { id: string; name: string } | null = null;
    if (packageId !== null) {
      if (!UUID.test(packageId)) return { outcome: 'NOT_FOUND' };
      const found = await this.prisma.package.findUnique({
        where: { id: packageId },
        select: { id: true, name: true, status: true },
      });
      if (!found) return { outcome: 'NOT_FOUND' };
      // an archived package may stay where it is but is not handed out any more
      if (found.status === 'ARCHIVED' && restaurant.packageId !== found.id) {
        return { outcome: 'ARCHIVED' };
      }
      target = { id: found.id, name: found.name };
    }
    if (restaurant.packageId !== (target?.id ?? null)) {
      await this.prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { packageId: target?.id ?? null },
      });
      await this.audit.record({
        admin,
        action: 'restaurant.package_changed',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: {
          from: restaurant.package?.name ?? null,
          to: target?.name ?? null,
        },
      });
    }
    return { outcome: 'ok', data: { packageId: target?.id ?? null } };
  }
}

function hasPriceWithoutCurrency(input: PackageInput): boolean {
  return (
    (input.monthlyPrice !== null || input.yearlyPrice !== null) &&
    input.currencyCode === null
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** Which parts of a package changed, for the audit entry. */
function changedFields(before: PackageView, after: PackageInput): string[] {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push('name');
  if (before.description !== after.description) changes.push('description');
  if (before.status !== after.status) changes.push('status');
  if (
    before.monthlyPrice !== after.monthlyPrice ||
    before.yearlyPrice !== after.yearlyPrice ||
    before.currencyCode !== after.currencyCode
  ) {
    changes.push('prices');
  }
  if (!sameSet(before.features, after.features)) changes.push('features');
  return changes;
}
