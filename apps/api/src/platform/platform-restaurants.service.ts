import { Injectable } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import {
  subscriptionBrief,
  type SubscriptionBrief,
} from './billing/subscription-brief';
import { todayInCairo } from './billing/subscription-dates';
import {
  CUSTOMER_FEATURE_KEYS,
  FEATURE_KEYS,
  resolveFeatures,
  type FeatureKey,
  type FeatureSource,
} from '../entitlements/features';
import type { Prisma, RestaurantStatus } from '../generated/prisma/client';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';
import type { MenuTemplateKey } from '../entitlements/templates';
import {
  VERIFIED_EXCLUSIVE_RENDERERS,
  type ExclusiveDesignMode,
  type VerifiedExclusiveRenderer,
} from './dto/exclusive-design.dto';
import type { NormalizedOwnerContact } from './restaurant-owner-contact';
import {
  changeRestaurantSlug,
  type ChangeSlugResult,
} from '../restaurants/restaurant-slug-store';
import type { AcquisitionSourceType } from './restaurant-acquisition';
import { restaurantMenuUrl } from '../restaurants/menu-link';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OwnerContactView {
  fullName: string;
  phone: string;
  facebookUrl: string | null;
}

export interface RestaurantSummary {
  /** Private to Platform Administrators; never part of Staff/Guest contracts. */
  ownerContact: OwnerContactView | null;
  id: string;
  publicId: string;
  name: string;
  status: RestaurantStatus;
  defaultLocale: string;
  currencyCode: string;
  createdAt: string;
  counts: {
    branches: number;
    products: number;
    staff: number;
    orders30d: number;
  };
  /** The package the platform assigned (DEC-046); null = no package, every feature. */
  package: { id: string; name: string } | null;
  /** The features this Restaurant effectively does not have (package and overrides applied). */
  disabledFeatures: FeatureKey[];
  /** Where its subscription stands today (DEC-049); null = it never had one. */
  subscription: SubscriptionBrief | null;
}

export interface RestaurantPage {
  items: RestaurantSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FeatureState {
  key: FeatureKey;
  /** What the Restaurant effectively gets. */
  enabled: boolean;
  /** True when a stored override decides it (false = the package, or the default). */
  overridden: boolean;
  /** What decides it: the Restaurant's own override, its package, or the default. */
  source: FeatureSource;
  /** What the Restaurant would get without its override (its package, or the default). */
  baseEnabled: boolean;
}

export interface ExclusiveDesignView {
  baseTemplate: MenuTemplateKey;
  status: ExclusiveDesignMode;
  rendererKey?: VerifiedExclusiveRenderer;
}

export interface RestaurantAcquisitionView {
  sourceType: AcquisitionSourceType;
  referringRestaurantId: string | null;
  referringRestaurantName: string | null;
  sourceName: string | null;
  sourcePlatform: string | null;
  sourceDetail: string | null;
  campaign: string | null;
  recordedAt: string;
}

export interface RestaurantDetail extends RestaurantSummary {
  /** The readable Guest Menu link (DEC-066): `/q/{slug}`; null only before the backfill ran. Former slugs keep redirecting. */
  menuLink: { slug: string | null; formerSlugs: string[]; url: string | null };
  exclusiveDesign: ExclusiveDesignView | null;
  /** Private ElmoTech attribution, never exposed through restaurant or public APIs. */
  acquisition: RestaurantAcquisitionView | null;
  /** The Restaurant's own settings (read only here). */
  settings: {
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    tableOrderingEnabled: boolean;
    whatsappOrderingEnabled: boolean;
    menuTemplate: string;
    suggestionsMode: string;
  };
  owners: { email: string; status: string }[];
  features: FeatureState[];
  totals: { orders: number; activeBranches: number; tables: number };
}

export type RestaurantLookup<T> =
  { outcome: 'ok'; data: T } | { outcome: 'notFound' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The platform team's view of every Restaurant (DEC-045). Cross-tenant by design: it is reachable only
 * through the platform guards, never from a restaurant session. It returns operational facts and
 * counts, never a guest's personal data or any order content.
 */
@Injectable()
export class PlatformRestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** The Guest Menu link the Platform team shares: `{web origin}/q/{slug}` (the web origin is the API's CORS origin, as for demo links). */
  private menuLinkOf(
    slugs: { slug: string; isCurrent: boolean }[],
  ): RestaurantDetail['menuLink'] {
    const current = slugs.find((s) => s.isCurrent)?.slug ?? null;
    const origin = String(
      this.config.get('CORS_ORIGIN', { infer: true }) ?? '',
    ).replace(/\/+$/, '');
    return {
      slug: current,
      formerSlugs: slugs.filter((s) => !s.isCurrent).map((s) => s.slug),
      url:
        current && origin
          ? restaurantMenuUrl(
              current,
              origin,
              this.config.get('MENU_SUBDOMAIN_ORIGIN', { infer: true }),
            )
          : null,
    };
  }

  private briefOf(
    rows: Parameters<typeof subscriptionBrief>[0],
  ): SubscriptionBrief | null {
    return subscriptionBrief(
      rows,
      todayInCairo(),
      this.config.get('SUBSCRIPTION_GRACE_DAYS', { infer: true }),
    );
  }

  async list(input: {
    search?: string;
    status?: RestaurantStatus;
    subscription?: 'TRIAL' | 'PAID' | 'NONE';
    page: number;
    pageSize: number;
  }): Promise<RestaurantPage> {
    const search = input.search?.trim();
    const today = todayInCairo();
    const covering = {
      status: 'ACTIVE' as const,
      startsAt: { lte: today },
      endsAt: { gt: today },
    };
    const where: Prisma.RestaurantWhereInput = {
      // Temporary demo restaurants (DEC-060) have their own Demos section.
      isDemo: false,
      ...(input.status ? { status: input.status } : {}),
      ...(input.subscription === 'TRIAL'
        ? { subscriptions: { some: { ...covering, kind: 'TRIAL' } } }
        : input.subscription === 'PAID'
          ? { subscriptions: { some: { ...covering, kind: 'PAID' } } }
          : input.subscription === 'NONE'
            ? { subscriptions: { none: covering } }
            : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { publicId: { contains: search, mode: 'insensitive' } },
              {
                ownerContact: {
                  is: { fullName: { contains: search, mode: 'insensitive' } },
                },
              },
              {
                ownerContact: {
                  is: { phone: { contains: search.replace(/[\s().-]/g, '') } },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.restaurant.count({ where }),
      this.prisma.restaurant.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          publicId: true,
          name: true,
          status: true,
          defaultLocale: true,
          currencyCode: true,
          createdAt: true,
          ownerContact: {
            select: { fullName: true, phone: true, facebookUrl: true },
          },
          _count: {
            select: { branches: true, products: true, memberships: true },
          },
          features: { select: { feature: true, enabled: true } },
          package: {
            select: {
              id: true,
              name: true,
              features: { select: { feature: true } },
            },
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            select: {
              status: true,
              kind: true,
              startsAt: true,
              endsAt: true,
              packageName: true,
              period: true,
              currencyCode: true,
              finalPrice: true,
              payments: { where: { voidedAt: null }, select: { amount: true } },
            },
          },
        },
      }),
    ]);
    const orders = await this.recentOrderCounts(rows.map((row) => row.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        name: row.name,
        status: row.status,
        defaultLocale: row.defaultLocale,
        currencyCode: row.currencyCode,
        createdAt: row.createdAt.toISOString(),
        ownerContact: row.ownerContact,
        counts: {
          branches: row._count.branches,
          products: row._count.products,
          staff: row._count.memberships,
          orders30d: orders.get(row.id) ?? 0,
        },
        package: row.package && { id: row.package.id, name: row.package.name },
        disabledFeatures: disabledFeatures(row.features, row.package),
        subscription: this.briefOf(row.subscriptions),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async detail(
    restaurantId: string,
  ): Promise<RestaurantLookup<RestaurantDetail>> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const row = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        publicId: true,
        name: true,
        status: true,
        defaultLocale: true,
        currencyCode: true,
        createdAt: true,
        pickupEnabled: true,
        deliveryEnabled: true,
        tableOrderingEnabled: true,
        whatsappOrderingEnabled: true,
        menuTemplate: true,
        suggestionsMode: true,
        exclusiveDesign: {
          select: { baseTemplate: true, status: true, rendererKey: true },
        },
        slugs: {
          select: { slug: true, isCurrent: true },
          orderBy: { createdAt: 'asc' },
        },
        ownerContact: {
          select: { fullName: true, phone: true, facebookUrl: true },
        },
        acquisition: {
          select: {
            sourceType: true,
            referringRestaurantId: true,
            referringRestaurantName: true,
            sourceName: true,
            sourcePlatform: true,
            sourceDetail: true,
            campaign: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            branches: true,
            products: true,
            memberships: true,
            orders: true,
            tables: true,
          },
        },
        memberships: {
          where: { role: 'OWNER' },
          select: { status: true, user: { select: { email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        features: { select: { feature: true, enabled: true } },
        package: {
          select: {
            id: true,
            name: true,
            features: { select: { feature: true } },
          },
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: {
            status: true,
            kind: true,
            startsAt: true,
            endsAt: true,
            packageName: true,
            period: true,
            currencyCode: true,
            finalPrice: true,
            payments: { where: { voidedAt: null }, select: { amount: true } },
          },
        },
      },
    });
    if (!row) return { outcome: 'notFound' };
    const [orders, activeBranches] = await Promise.all([
      this.recentOrderCounts([row.id]),
      this.prisma.branch.count({
        where: { restaurantId: row.id, status: 'ACTIVE' },
      }),
    ]);
    return {
      outcome: 'ok',
      data: {
        id: row.id,
        publicId: row.publicId,
        name: row.name,
        status: row.status,
        defaultLocale: row.defaultLocale,
        currencyCode: row.currencyCode,
        createdAt: row.createdAt.toISOString(),
        counts: {
          branches: row._count.branches,
          products: row._count.products,
          staff: row._count.memberships,
          orders30d: orders.get(row.id) ?? 0,
        },
        package: row.package && { id: row.package.id, name: row.package.name },
        disabledFeatures: disabledFeatures(row.features, row.package),
        subscription: this.briefOf(row.subscriptions),
        exclusiveDesign: row.exclusiveDesign
          ? {
              baseTemplate: row.exclusiveDesign.baseTemplate,
              status: row.exclusiveDesign.status,
              ...(VERIFIED_EXCLUSIVE_RENDERERS.find(
                (key) => key === row.exclusiveDesign?.rendererKey,
              )
                ? {
                    rendererKey: row.exclusiveDesign
                      .rendererKey as VerifiedExclusiveRenderer,
                  }
                : {}),
            }
          : null,
        ownerContact: row.ownerContact,
        menuLink: this.menuLinkOf(row.slugs),
        acquisition: row.acquisition
          ? {
              sourceType: row.acquisition.sourceType,
              referringRestaurantId: row.acquisition.referringRestaurantId,
              referringRestaurantName: row.acquisition.referringRestaurantName,
              sourceName: row.acquisition.sourceName,
              sourcePlatform: row.acquisition.sourcePlatform,
              sourceDetail: row.acquisition.sourceDetail,
              campaign: row.acquisition.campaign,
              recordedAt: row.acquisition.createdAt.toISOString(),
            }
          : null,
        settings: {
          pickupEnabled: row.pickupEnabled,
          deliveryEnabled: row.deliveryEnabled,
          tableOrderingEnabled: row.tableOrderingEnabled,
          whatsappOrderingEnabled: row.whatsappOrderingEnabled,
          menuTemplate: row.menuTemplate,
          suggestionsMode: row.suggestionsMode,
        },
        owners: row.memberships.map((membership) => ({
          email: membership.user.email,
          status: membership.status,
        })),
        features: FEATURE_KEYS.map((key) =>
          featureState(key, row.features, row.package),
        ),
        totals: {
          orders: row._count.orders,
          activeBranches,
          tables: row._count.tables,
        },
      },
    };
  }

  /**
   * Only Platform Admins can configure a Restaurant's private design slot.
   * No new global template key is created. RESERVED never changes the Guest
   * layout; ACTIVE_BASE uses this Restaurant's one selected stock renderer.
   */
  async setExclusiveDesign(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    input: ExclusiveDesignView,
  ): Promise<RestaurantLookup<ExclusiveDesignView>> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });
    if (!restaurant) return { outcome: 'notFound' };

    // Never accept a client-provided arbitrary renderer. The compiled registry is
    // intentionally small: this exact key is only present in Wayta's trusted build.
    if (
      input.status === 'ACTIVE_CUSTOM' &&
      !VERIFIED_EXCLUSIVE_RENDERERS.some((key) => key === input.rendererKey)
    ) {
      throw new BadRequestException('A verified custom renderer is required.');
    }
    const before = await this.prisma.restaurantExclusiveDesign.findUnique({
      where: { restaurantId },
      select: { baseTemplate: true, status: true, rendererKey: true },
    });
    const rendererKey =
      input.status === 'ACTIVE_CUSTOM' ? input.rendererKey : undefined;
    if (rendererKey && rendererKey !== before?.rendererKey) {
      const assigned = await this.prisma.restaurantExclusiveDesign.findUnique({
        where: { rendererKey },
        select: { restaurantId: true },
      });
      if (assigned && assigned.restaurantId !== restaurantId) {
        throw new ConflictException(
          'This bespoke design already belongs to another Restaurant.',
        );
      }
    }
    if (
      !before ||
      before.baseTemplate !== input.baseTemplate ||
      before.status !== input.status ||
      (rendererKey && rendererKey !== before.rendererKey)
    ) {
      await this.prisma.restaurantExclusiveDesign.upsert({
        where: { restaurantId },
        create: {
          restaurantId,
          baseTemplate: input.baseTemplate,
          status: input.status,
          ...(rendererKey ? { rendererKey } : {}),
        },
        update: {
          baseTemplate: input.baseTemplate,
          status: input.status,
          ...(rendererKey ? { rendererKey } : {}),
        },
      });
      await this.audit.record({
        admin,
        action: 'restaurant.exclusive_design_updated',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: {
          from: before
            ? {
                template: before.baseTemplate,
                status: before.status,
                ...(before.rendererKey
                  ? { rendererKey: before.rendererKey }
                  : {}),
              }
            : null,
          to: {
            template: input.baseTemplate,
            status: input.status,
            ...(rendererKey ? { rendererKey } : {}),
          },
        },
      });
    }
    return { outcome: 'ok', data: input };
  }

  /**
   * Edits the Restaurant's readable menu link (DEC-066). The previous link keeps redirecting. Validation,
   * uniqueness (current AND former slugs of every Restaurant) and the swap live in `changeRestaurantSlug`.
   */
  async setMenuSlug(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    requested: string,
  ): Promise<ChangeSlugResult> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const result = await changeRestaurantSlug(
      this.prisma,
      restaurantId,
      requested,
    );
    if (result.outcome === 'updated') {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true },
      });
      await this.audit.record({
        admin,
        action: 'restaurant.menu_link_changed',
        restaurant: restaurant ?? undefined,
        details: { from: result.previousSlug, to: result.slug },
      });
    }
    return result;
  }

  /** Platform-only primary contact correction; never changes a login User. */
  async setOwnerContact(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    contact: NormalizedOwnerContact,
  ): Promise<RestaurantLookup<OwnerContactView>> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        ownerContact: {
          select: { fullName: true, phone: true, facebookUrl: true },
        },
      },
    });
    if (!restaurant) return { outcome: 'notFound' };
    const before = restaurant.ownerContact;
    if (
      !before ||
      before.fullName !== contact.fullName ||
      before.phone !== contact.phone ||
      before.facebookUrl !== contact.facebookUrl
    ) {
      await this.prisma.restaurantOwnerContact.upsert({
        where: { restaurantId },
        create: { restaurantId, ...contact },
        update: contact,
      });
      // Don't put customer phone numbers or social profile URLs in audit logs.
      await this.audit.record({
        admin,
        action: 'restaurant.owner_contact_updated',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: { contactUpdated: true },
      });
    }
    return { outcome: 'ok', data: contact };
  }

  /** Switch an account on or off. A suspended Restaurant's Staff and Guests are refused by the existing status checks. */
  async setStatus(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<RestaurantLookup<{ status: RestaurantStatus }>> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const current = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, status: true },
    });
    if (!current) return { outcome: 'notFound' };
    if (current.status !== status) {
      await this.prisma.restaurant.update({
        where: { id: current.id },
        data: {
          status,
          // a hand-made change always wins (DEC-049): the platform's own suspension mark goes, and a
          // reactivation records when, so the hourly check does not undo it for the same lapse
          subscriptionSuspendedAt: null,
          ...(status === 'ACTIVE'
            ? { subscriptionOverrideAt: new Date() }
            : {}),
        },
      });
      await this.audit.record({
        admin,
        action: 'restaurant.status_changed',
        restaurant: { id: current.id, name: current.name },
        details: { from: current.status, to: status },
      });
    }
    return { outcome: 'ok', data: { status } };
  }

  /** Allow (`true`), remove (`false`) a feature, or go back to the default (`null`). */
  async setFeature(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    feature: FeatureKey,
    enabled: boolean | null,
  ): Promise<RestaurantLookup<FeatureState>> {
    if (!UUID.test(restaurantId)) return { outcome: 'notFound' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        package: { select: { features: { select: { feature: true } } } },
      },
    });
    if (!restaurant) return { outcome: 'notFound' };
    const before = await this.prisma.restaurantFeature.findUnique({
      where: { restaurantId_feature: { restaurantId, feature } },
      select: { enabled: true },
    });
    if (enabled === null) {
      await this.prisma.restaurantFeature.deleteMany({
        where: { restaurantId, feature },
      });
    } else {
      await this.prisma.restaurantFeature.upsert({
        where: { restaurantId_feature: { restaurantId, feature } },
        create: { restaurantId, feature, enabled },
        update: { enabled },
      });
    }
    const state = featureState(
      feature,
      enabled === null ? [] : [{ feature, enabled }],
      restaurant.package,
    );
    if (before?.enabled !== enabled && !(before === null && enabled === null)) {
      await this.audit.record({
        admin,
        action: 'restaurant.feature_changed',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: {
          feature,
          from: before ? before.enabled : 'default',
          to: enabled === null ? 'default' : enabled,
        },
      });
    }
    return { outcome: 'ok', data: state };
  }

  private async recentOrderCounts(
    restaurantIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (restaurantIds.length === 0) return new Map();
    const grouped = await this.prisma.order.groupBy({
      by: ['restaurantId'],
      where: {
        restaurantId: { in: [...restaurantIds] },
        createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
      },
      _count: { _all: true },
    });
    return new Map(
      grouped.map((group) => [group.restaurantId, group._count._all]),
    );
  }
}

type OverrideRows = ReadonlyArray<{ feature: string; enabled: boolean }>;
type PackageRows = { features: ReadonlyArray<{ feature: string }> } | null;

/** One feature's effective value and what decides it (override, then package, then default). */
function featureState(
  key: FeatureKey,
  overrides: OverrideRows,
  pkg: PackageRows,
): FeatureState {
  const packageFeatures = pkg?.features.map((f) => f.feature);
  const baseEnabled = resolveFeatures([], packageFeatures)[key];
  const override = overrides.find((row) => row.feature === key);
  return {
    key,
    enabled: override ? override.enabled : baseEnabled,
    overridden: override !== undefined,
    source: override ? 'override' : pkg ? 'package' : 'default',
    baseEnabled,
  };
}

function disabledFeatures(
  overrides: OverrideRows,
  pkg: PackageRows,
): FeatureKey[] {
  const effective = resolveFeatures(
    overrides,
    pkg?.features.map((f) => f.feature),
  );
  return CUSTOMER_FEATURE_KEYS.filter((key) => !effective[key]);
}
