import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import {
  FEATURE_KEYS,
  resolveFeatures,
  type FeatureKey,
} from '../entitlements/features';
import { Prisma } from '../generated/prisma/client';
import {
  currencyForCountry,
  listPriceFor,
  paymentSummary,
  type BillingCurrency,
  type BillingPeriodKey,
  type PaymentStatus,
} from '../platform/billing/pricing';
import {
  formatDateOnly,
  pickCurrent,
  subscriptionPhase,
  todayInCairo,
  type SubscriptionPhase,
} from '../platform/billing/subscription-dates';
import {
  allowedTemplates,
  MENU_TEMPLATE_KEYS,
  PREMIUM_TEMPLATE_KEYS,
  STANDARD_TEMPLATE_KEYS,
  templateCountOf,
  templateTierCountsOf,
  tierCounts,
  type PackageTemplateRule,
} from '../entitlements/templates';
import { PlatformAuditService } from '../platform/platform-audit.service';
import { upgradeCandidates } from './plan-options';

export interface PlanSubscriptionView {
  phase: SubscriptionPhase;
  packageName: string;
  period: BillingPeriodKey;
  startsAt: string;
  endsAt: string;
  daysLeft: number;
  graceDaysLeft: number;
  currencyCode: string;
  /** What was agreed, after the offer and the discount (money as a string). */
  finalPrice: string;
  paid: string;
  balance: string;
  paymentStatus: PaymentStatus;
}

export interface UpgradeOptionView {
  id: string;
  name: string;
  description: string | null;
  /** Everything the package includes. */
  features: FeatureKey[];
  /** What it would add to what the restaurant has now. */
  adds: FeatureKey[];
  /** How many Guest menu templates it gives (Classic counts, DEC-051). */
  templateCount: number;
  /** The same, split by tier (DEC-052). */
  templateStandard: number;
  templatePremium: number;
  priceMonthly: string | null;
  priceYearly: string | null;
  /** An offer that is on today, or null. */
  offer: {
    percent: string;
    label: string | null;
    endsAt: string | null;
  } | null;
}

export interface OpenRequestView {
  id: string;
  kind: 'UPGRADE' | 'RENEWAL';
  packageName: string | null;
  message: string | null;
  status: 'NEW' | 'CONTACTED';
  createdAt: string;
}

export interface MySubscriptionView {
  billingCurrency: BillingCurrency;
  graceDays: number;
  package: { id: string; name: string } | null;
  /** What the restaurant effectively has (package, exceptions and defaults applied). */
  features: { key: FeatureKey; included: boolean }[];
  /** The Guest menu templates it may use now, out of all of them (DEC-051). */
  templates: {
    current: number;
    total: number;
    /** Standard / premium split of what it may use now and of everything that exists (DEC-052). */
    currentStandard: number;
    currentPremium: number;
    totalStandard: number;
    totalPremium: number;
  };
  subscription: PlanSubscriptionView | null;
  upgrades: UpgradeOptionView[];
  openRequest: OpenRequestView | null;
}

export interface RequestInput {
  kind: 'UPGRADE' | 'RENEWAL';
  packageId: string | null;
  message: string | null;
}

export type RequestRefusal =
  | 'PACKAGE_REQUIRED'
  | 'PACKAGE_NOT_AVAILABLE'
  | 'REQUEST_ALREADY_OPEN'
  | 'RESTAURANT_NOT_FOUND';

export type RequestOutcome =
  | { outcome: 'ok'; data: OpenRequestView }
  | { outcome: RequestRefusal; existing?: OpenRequestView };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const openRequestSelect = {
  id: true,
  kind: true,
  packageName: true,
  message: true,
  status: true,
  createdAt: true,
} satisfies Prisma.SubscriptionRequestSelect;

function toOpenView(
  row: Prisma.SubscriptionRequestGetPayload<{
    select: typeof openRequestSelect;
  }>,
): OpenRequestView {
  return {
    id: row.id,
    kind: row.kind,
    packageName: row.packageName,
    message: row.message,
    status: row.status === 'CONTACTED' ? 'CONTACTED' : 'NEW',
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * "My subscription" for a Restaurant (DEC-050): what it has, what it pays, what it could upgrade to, and
 * the request that reaches the platform team. Every query is scoped to the Restaurant of the authorized
 * request; the Package prices shown are the public list prices in the Restaurant's billing currency.
 */
@Injectable()
export class MySubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private get graceDays(): number {
    return this.config.get('SUBSCRIPTION_GRACE_DAYS', { infer: true });
  }

  async view(restaurantId: string): Promise<MySubscriptionView | null> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        countryCode: true,
        packageId: true,
        package: {
          select: {
            id: true,
            name: true,
            allTemplates: true,
            allStandardTemplates: true,
            features: { select: { feature: true } },
            templates: { select: { template: true } },
          },
        },
        features: { select: { feature: true, enabled: true } },
        subscriptions: {
          include: {
            payments: { where: { voidedAt: null }, select: { amount: true } },
          },
          orderBy: { startsAt: 'asc' },
        },
        subscriptionRequests: {
          where: { status: { in: ['NEW', 'CONTACTED'] } },
          select: openRequestSelect,
          take: 1,
        },
      },
    });
    if (!restaurant) return null;

    const effective = resolveFeatures(
      restaurant.features,
      restaurant.package?.features.map((f) => f.feature),
    );
    const currentTemplates = allowedTemplates({
      featureEnabled: effective.MENU_TEMPLATES,
      rule: restaurant.package
        ? {
            includesFeature: restaurant.package.features.some(
              (f) => f.feature === 'MENU_TEMPLATES',
            ),
            all: restaurant.package.allTemplates,
            allStandard: restaurant.package.allStandardTemplates,
            selected: restaurant.package.templates.map((t) => t.template),
          }
        : null,
    });
    const currency = currencyForCountry(restaurant.countryCode);
    const today = todayInCairo();

    const rows = restaurant.subscriptions.map((row) => {
      const info = subscriptionPhase(row, today, this.graceDays);
      return {
        row,
        info,
        phase: info.phase,
        startsAt: formatDateOnly(row.startsAt),
        status: row.status,
      };
    });
    const current = pickCurrent(rows);
    let subscription: PlanSubscriptionView | null = null;
    if (current) {
      const { row } = current;
      const summary = paymentSummary(
        row.finalPrice,
        row.payments.map((p) => p.amount),
      );
      subscription = {
        phase: current.phase,
        packageName: row.packageName,
        period: row.period,
        startsAt: formatDateOnly(row.startsAt),
        endsAt: formatDateOnly(row.endsAt),
        daysLeft: current.info.daysLeft,
        graceDaysLeft: current.info.graceDaysLeft,
        currencyCode: row.currencyCode,
        finalPrice: row.finalPrice.toFixed(2),
        paid: summary.paid.toFixed(2),
        balance: summary.balance.toFixed(2),
        paymentStatus: summary.status,
      };
    }

    const packages = await this.prisma.package.findMany({
      where: { status: 'ACTIVE' },
      select: {
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
        allTemplates: true,
        allStandardTemplates: true,
        features: { select: { feature: true } },
        templates: { select: { template: true } },
      },
    });
    const upgrades = upgradeCandidates({
      currentPackageId: restaurant.packageId,
      effective,
      currentTemplateCount: currentTemplates.length,
      currentPremiumCount: tierCounts(currentTemplates).premium,
      packages: packages.map((pkg) => {
        const rule: PackageTemplateRule = {
          includesFeature: pkg.features.some(
            (f) => f.feature === 'MENU_TEMPLATES',
          ),
          all: pkg.allTemplates,
          allStandard: pkg.allStandardTemplates,
          selected: pkg.templates.map((t) => t.template),
        };
        return {
          ...pkg,
          features: FEATURE_KEYS.filter((key) =>
            pkg.features.some((f) => f.feature === key),
          ),
          templateCount: templateCountOf(rule),
          templateTiers: templateTierCountsOf(rule),
          templatePremium: templateTierCountsOf(rule).premium,
        };
      }),
    }).map(({ pkg, adds }): UpgradeOptionView => {
      const offerOn =
        pkg.offerPercent !== null &&
        pkg.offerPercent.gt(0) &&
        (pkg.offerEndsAt === null ||
          pkg.offerEndsAt.getTime() >= today.getTime());
      const monthly = listPriceFor(pkg, currency, 'MONTHLY');
      const yearly = listPriceFor(pkg, currency, 'YEARLY');
      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        features: pkg.features,
        adds,
        templateCount: pkg.templateCount,
        templateStandard: pkg.templateTiers.standard,
        templatePremium: pkg.templateTiers.premium,
        priceMonthly: monthly?.toFixed(2) ?? null,
        priceYearly: yearly?.toFixed(2) ?? null,
        offer:
          offerOn && pkg.offerPercent
            ? {
                percent: pkg.offerPercent.toFixed(2),
                label: pkg.offerLabel,
                endsAt: pkg.offerEndsAt
                  ? formatDateOnly(pkg.offerEndsAt)
                  : null,
              }
            : null,
      };
    });

    return {
      billingCurrency: currency,
      graceDays: this.graceDays,
      package: restaurant.package && {
        id: restaurant.package.id,
        name: restaurant.package.name,
      },
      features: FEATURE_KEYS.map((key) => ({ key, included: effective[key] })),
      templates: {
        current: currentTemplates.length,
        total: MENU_TEMPLATE_KEYS.length,
        currentStandard: tierCounts(currentTemplates).standard,
        currentPremium: tierCounts(currentTemplates).premium,
        totalStandard: STANDARD_TEMPLATE_KEYS.length,
        totalPremium: PREMIUM_TEMPLATE_KEYS.length,
      },
      subscription,
      upgrades,
      openRequest: restaurant.subscriptionRequests[0]
        ? toOpenView(restaurant.subscriptionRequests[0])
        : null,
    };
  }

  async createRequest(
    restaurantId: string,
    userId: string,
    input: RequestInput,
  ): Promise<RequestOutcome> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, packageId: true },
    });
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return { outcome: 'RESTAURANT_NOT_FOUND' };

    let target: { id: string; name: string } | null = null;
    if (input.packageId) {
      if (!UUID.test(input.packageId))
        return { outcome: 'PACKAGE_NOT_AVAILABLE' };
      const found = await this.prisma.package.findUnique({
        where: { id: input.packageId },
        select: { id: true, name: true, status: true },
      });
      // only a package that is handed out today, and never the one it is already on
      if (
        !found ||
        found.status !== 'ACTIVE' ||
        found.id === restaurant.packageId
      ) {
        return { outcome: 'PACKAGE_NOT_AVAILABLE' };
      }
      target = { id: found.id, name: found.name };
    }
    if (input.kind === 'UPGRADE' && !target)
      return { outcome: 'PACKAGE_REQUIRED' };

    const open = await this.openRequest(restaurantId);
    if (open) return { outcome: 'REQUEST_ALREADY_OPEN', existing: open };

    try {
      const row = await this.prisma.subscriptionRequest.create({
        data: {
          restaurantId,
          kind: input.kind,
          packageId: target?.id ?? null,
          packageName: target?.name ?? null,
          message: input.message,
          requestedByUserId: user.id,
          requestedByEmail: user.email,
        },
        select: openRequestSelect,
      });
      await this.audit.record({
        admin: null,
        actorEmail: user.email,
        action: 'subscription_request.created',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: { kind: input.kind, package: target?.name ?? null },
      });
      return { outcome: 'ok', data: toOpenView(row) };
    } catch (error) {
      // two requests at once: the partial unique index lets only one through
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return {
          outcome: 'REQUEST_ALREADY_OPEN',
          existing: (await this.openRequest(restaurantId)) ?? undefined,
        };
      }
      throw error;
    }
  }

  private async openRequest(
    restaurantId: string,
  ): Promise<OpenRequestView | null> {
    const row = await this.prisma.subscriptionRequest.findFirst({
      where: { restaurantId, status: { in: ['NEW', 'CONTACTED'] } },
      select: openRequestSelect,
    });
    return row ? toOpenView(row) : null;
  }
}
