import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FEATURE_KEYS, type FeatureKey } from '../entitlements/features';
import {
  MENU_TEMPLATE_KEYS,
  type MenuTemplateKey,
} from '../entitlements/templates';
import { Prisma, type PackageStatus } from '../generated/prisma/client';
import {
  formatDateOnly,
  parseDateOnly,
  todayInCairo,
} from './billing/subscription-dates';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';

/** List prices per billing currency and period (DEC-049); null = not offered. Money as strings. */
export interface PackagePriceView {
  egpMonthly: string | null;
  egpYearly: string | null;
  usdMonthly: string | null;
  usdYearly: string | null;
}

export interface PackageOfferView {
  percent: string;
  label: string | null;
  /** Last day the offer applies (inclusive), YYYY-MM-DD; null = no end date. */
  endsAt: string | null;
  /** Whether the offer applies today. */
  active: boolean;
}

/** The Guest menu templates a package allows (DEC-051): every one, or a chosen list. Classic is implied. */
export interface PackageTemplatesView {
  /** Every template, including ones added later. */
  all: boolean;
  /** The chosen templates (never Classic; empty when `all`). */
  selected: MenuTemplateKey[];
}

/** `all` wins and Classic is implied: the list is stored in the documented order without Classic. */
export function normalizeTemplates(input: {
  all: boolean;
  selected: readonly string[];
}): PackageTemplatesView {
  if (input.all) return { all: true, selected: [] };
  return {
    all: false,
    selected: MENU_TEMPLATE_KEYS.filter(
      (key) => key !== 'CLASSIC' && input.selected.includes(key),
    ),
  };
}

export interface PackageView {
  id: string;
  name: string;
  description: string | null;
  status: PackageStatus;
  prices: PackagePriceView;
  offer: PackageOfferView | null;
  /** The templates it allows (meaningful when the package includes Menu designs). */
  templates: PackageTemplatesView;
  /** The features this package includes. */
  features: FeatureKey[];
  restaurantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackageDetail extends PackageView {
  restaurants: { id: string; name: string; status: string }[];
}

/** An edit: only what is present changes; prices can be changed one by one. */
export type PackageUpdate = Omit<Partial<PackageInput>, 'prices'> & {
  prices?: Partial<PackagePriceView>;
};

export interface PackageInput {
  name: string;
  description: string | null;
  prices: PackagePriceView;
  offer: {
    percent: string;
    label: string | null;
    endsAt: string | null;
  } | null;
  templates: PackageTemplatesView;
  features: FeatureKey[];
  status: PackageStatus;
}

/** Why a package or Restaurant change was refused (the controller maps these to HTTP errors). */
export type PackageRefusal =
  | 'NOT_FOUND'
  | 'RESTAURANT_NOT_FOUND'
  | 'NAME_TAKEN'
  | 'INVALID_OFFER'
  | 'IN_USE'
  | 'ARCHIVED'
  | 'SUBSCRIPTION_ACTIVE';

export type PackageOutcome<T> =
  { outcome: 'ok'; data: T } | { outcome: PackageRefusal };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_RESTAURANTS = 100;

const packageSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  priceEgpMonthly: true,
  priceEgpYearly: true,
  priceUsdMonthly: true,
  priceUsdYearly: true,
  offerPercent: true,
  offerLabel: true,
  offerEndsAt: true,
  createdAt: true,
  updatedAt: true,
  allTemplates: true,
  templates: { select: { template: true } },
  features: { select: { feature: true } },
  _count: { select: { restaurants: true, subscriptions: true } },
} satisfies Prisma.PackageSelect;

type PackageRow = Prisma.PackageGetPayload<{ select: typeof packageSelect }>;

/** "Pizza  Plus" and "pizza plus" are the same package name. */
const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

const money = (value: Prisma.Decimal | null) =>
  value ? value.toFixed(2) : null;

const toView = (row: PackageRow): PackageView => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  prices: {
    egpMonthly: money(row.priceEgpMonthly),
    egpYearly: money(row.priceEgpYearly),
    usdMonthly: money(row.priceUsdMonthly),
    usdYearly: money(row.priceUsdYearly),
  },
  offer: row.offerPercent
    ? {
        percent: row.offerPercent.toFixed(2),
        label: row.offerLabel,
        endsAt: row.offerEndsAt ? formatDateOnly(row.offerEndsAt) : null,
        active:
          row.offerEndsAt === null ||
          row.offerEndsAt.getTime() >= todayInCairo().getTime(),
      }
    : null,
  templates: normalizeTemplates({
    all: row.allTemplates,
    selected: row.templates.map((t) => t.template),
  }),
  // keep the documented feature order, not the storage order
  features: FEATURE_KEYS.filter((key) =>
    row.features.some((f) => f.feature === key),
  ),
  restaurantCount: row._count.restaurants,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** A view back to the editable input, for merging a partial update. */
const toInput = (view: PackageView): PackageInput => ({
  name: view.name,
  description: view.description,
  prices: view.prices,
  offer: view.offer && {
    percent: view.offer.percent,
    label: view.offer.label,
    endsAt: view.offer.endsAt,
  },
  templates: view.templates,
  features: view.features,
  status: view.status,
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** The database columns of an offer (an unknown date is refused by the caller first). */
function offerColumns(offer: PackageInput['offer']) {
  return {
    offerPercent: offer ? new Prisma.Decimal(offer.percent) : null,
    offerLabel: offer?.label ?? null,
    offerEndsAt: offer?.endsAt ? parseDateOnly(offer.endsAt) : null,
  };
}

function offerIsValid(offer: PackageInput['offer']): boolean {
  if (!offer) return true;
  const percent = Number(offer.percent);
  if (!(percent > 0 && percent <= 100)) return false;
  return offer.endsAt === null || parseDateOnly(offer.endsAt) !== null;
}

/**
 * Packages (DEC-046): named bundles of the platform features that the platform team creates and
 * assigns to Restaurants. Editing a package applies to every Restaurant on it at once. Prices and the
 * offer (DEC-049) are what NEW subscriptions are priced from; an existing subscription keeps the
 * numbers it was created with.
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
    if (!offerIsValid(input.offer)) return { outcome: 'INVALID_OFFER' };
    try {
      const row = await this.prisma.package.create({
        data: {
          name: input.name,
          nameNormalized: normalizeName(input.name),
          description: input.description,
          status: input.status,
          priceEgpMonthly: input.prices.egpMonthly,
          priceEgpYearly: input.prices.egpYearly,
          priceUsdMonthly: input.prices.usdMonthly,
          priceUsdYearly: input.prices.usdYearly,
          ...offerColumns(input.offer),
          allTemplates: input.templates.all,
          templates: {
            create: input.templates.selected.map((template) => ({ template })),
          },
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
    patch: PackageUpdate,
  ): Promise<PackageOutcome<PackageView>> {
    if (!UUID.test(packageId)) return { outcome: 'NOT_FOUND' };
    const before = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: packageSelect,
    });
    if (!before) return { outcome: 'NOT_FOUND' };
    const current = toView(before);
    const base = toInput(current);
    const next: PackageInput = {
      name: patch.name ?? base.name,
      description:
        patch.description === undefined ? base.description : patch.description,
      prices: { ...base.prices, ...patch.prices },
      offer: patch.offer === undefined ? base.offer : patch.offer,
      templates: patch.templates ?? base.templates,
      features: patch.features ?? base.features,
      status: patch.status ?? base.status,
    };
    if (!offerIsValid(next.offer)) return { outcome: 'INVALID_OFFER' };

    const templatesChanged =
      JSON.stringify(base.templates) !== JSON.stringify(next.templates);
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
        if (templatesChanged) {
          await tx.packageTemplate.deleteMany({ where: { packageId } });
          await tx.packageTemplate.createMany({
            data: next.templates.selected.map((template) => ({
              packageId,
              template,
            })),
          });
        }
        return tx.package.update({
          where: { id: packageId },
          data: {
            allTemplates: next.templates.all,
            name: next.name,
            nameNormalized: normalizeName(next.name),
            description: next.description,
            status: next.status,
            priceEgpMonthly: next.prices.egpMonthly,
            priceEgpYearly: next.prices.egpYearly,
            priceUsdMonthly: next.prices.usdMonthly,
            priceUsdYearly: next.prices.usdYearly,
            ...offerColumns(next.offer),
          },
          select: packageSelect,
        });
      });
      const changes = changedFields(base, next);
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
        _count: { select: { restaurants: true, subscriptions: true } },
      },
    });
    if (!row) return { outcome: 'NOT_FOUND' };
    if (row._count.restaurants > 0 || row._count.subscriptions > 0) {
      return { outcome: 'IN_USE' };
    }
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

  /**
   * Put a Restaurant on a package, or take it off (`null`: back to every feature, DEC-043). While a
   * subscription covers today the subscription decides the package (DEC-049), so this is refused.
   */
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

    const today = todayInCairo();
    const covering = await this.prisma.subscription.count({
      where: {
        restaurantId,
        status: 'ACTIVE',
        startsAt: { lte: today },
        endsAt: { gt: today },
      },
    });
    if (covering > 0) return { outcome: 'SUBSCRIPTION_ACTIVE' };

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

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** Which parts of a package changed, for the audit entry. */
function changedFields(before: PackageInput, after: PackageInput): string[] {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push('name');
  if (before.description !== after.description) changes.push('description');
  if (before.status !== after.status) changes.push('status');
  if (JSON.stringify(before.prices) !== JSON.stringify(after.prices)) {
    changes.push('prices');
  }
  if (JSON.stringify(before.offer) !== JSON.stringify(after.offer)) {
    changes.push('offer');
  }
  if (JSON.stringify(before.templates) !== JSON.stringify(after.templates)) {
    changes.push('templates');
  }
  if (!sameSet(before.features, after.features)) changes.push('features');
  return changes;
}
