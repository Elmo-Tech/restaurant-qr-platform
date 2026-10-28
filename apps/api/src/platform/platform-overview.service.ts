import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { paymentSummary } from './billing/pricing';
import {
  addDays,
  formatDateOnly,
  subscriptionPhase,
  todayInCairo,
} from './billing/subscription-dates';
import {
  CUSTOMER_FEATURE_KEYS,
  resolveFeatures,
} from '../entitlements/features';
import {
  PlatformAuditService,
  type AuditEntryView,
} from './platform-audit.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlatformOverview {
  restaurants: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
  };
  last30Days: { newRestaurants: number; orders: number };
  totals: { branches: number; products: number; orders: number };
  /** Restaurants with at least one feature switched off by the platform. */
  restrictedRestaurants: number;
  /** Upgrade and renewal requests nobody has finished yet (DEC-050). */
  openRequests: number;
  /** Requests from the landing page nobody has finished yet (DEC-053). */
  openLeads: number;
  /** What needs the team's attention in billing (DEC-049): endings, money owed, money received. */
  billing: BillingOverview;
  recentRestaurants: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
  recentActivity: AuditEntryView[];
}

export interface MoneyTotal {
  currencyCode: string;
  amount: string;
}

export interface BillingOverview {
  /** Subscriptions ending within ENDING_SOON_DAYS, or already ended and inside the grace period; soonest first. */
  ending: {
    restaurantId: string;
    restaurantName: string;
    packageName: string;
    phase: 'ACTIVE' | 'GRACE';
    daysLeft: number;
    graceDaysLeft: number;
    endsAt: string;
  }[];
  /** Running or grace-period subscriptions with money still owed; the biggest balance first. */
  unpaid: {
    restaurantId: string;
    restaurantName: string;
    packageName: string;
    currencyCode: string;
    balance: string;
  }[];
  unpaidCount: number;
  /** Total still owed, per currency. */
  outstanding: MoneyTotal[];
  /** Payments received in the last 30 days (not voided), per currency. */
  received30d: MoneyTotal[];
}

const ENDING_SOON_DAYS = 14;
const LIST_LIMIT = 8;

/** The numbers on the platform home screen: aggregates only, no personal or order data. */
@Injectable()
export class PlatformOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async get(): Promise<PlatformOverview> {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [
      byStatus,
      newRestaurants,
      orders30d,
      branches,
      products,
      orders,
      restricted,
      openRequests,
      openLeads,
      recent,
      billing,
      activity,
    ] = await Promise.all([
      this.prisma.restaurant.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.restaurant.count({ where: { createdAt: { gte: since } } }),
      this.prisma.order.count({ where: { createdAt: { gte: since } } }),
      this.prisma.branch.count(),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.restrictedRestaurantCount(),
      this.prisma.subscriptionRequest.count({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
      }),
      this.prisma.signupLead.count({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
      }),
      this.prisma.restaurant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.billingOverview(),
      this.audit.recent({ limit: 8 }),
    ]);
    const count = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;
    return {
      restaurants: {
        total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        active: count('ACTIVE'),
        suspended: count('SUSPENDED'),
        inactive: count('INACTIVE'),
      },
      last30Days: { newRestaurants, orders: orders30d },
      totals: { branches, products, orders },
      restrictedRestaurants: restricted,
      openRequests,
      openLeads,
      billing,
      recentRestaurants: recent.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      recentActivity: activity,
    };
  }

  private async billingOverview(): Promise<BillingOverview> {
    const graceDays = this.config.get('SUBSCRIPTION_GRACE_DAYS', {
      infer: true,
    });
    const today = todayInCairo();
    const [live, paid] = await Promise.all([
      // everything that is running or inside its grace period today
      this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          startsAt: { lte: today },
          endsAt: { gt: addDays(today, -graceDays - 1) },
        },
        select: {
          kind: true,
          startsAt: true,
          endsAt: true,
          status: true,
          packageName: true,
          currencyCode: true,
          finalPrice: true,
          restaurant: { select: { id: true, name: true } },
          payments: { where: { voidedAt: null }, select: { amount: true } },
        },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { voidedAt: null, paidAt: { gte: addDays(today, -30) } },
        select: {
          amount: true,
          subscription: { select: { currencyCode: true } },
        },
      }),
    ]);

    const ending: BillingOverview['ending'] = [];
    const owed: BillingOverview['unpaid'] = [];
    const outstanding = new Map<string, Prisma.Decimal>();
    for (const sub of live) {
      const info = subscriptionPhase(
        sub,
        today,
        sub.kind === 'TRIAL' ? 0 : graceDays,
      );
      if (info.phase !== 'ACTIVE' && info.phase !== 'GRACE') continue;
      if (
        info.phase === 'GRACE' ||
        (info.phase === 'ACTIVE' && info.daysLeft <= ENDING_SOON_DAYS)
      ) {
        ending.push({
          restaurantId: sub.restaurant.id,
          restaurantName: sub.restaurant.name,
          packageName: sub.packageName,
          phase: info.phase,
          daysLeft: info.daysLeft,
          graceDaysLeft: info.graceDaysLeft,
          endsAt: formatDateOnly(sub.endsAt),
        });
      }
      const summary = paymentSummary(
        sub.finalPrice,
        sub.payments.map((p) => p.amount),
      );
      if (summary.balance.gt(0)) {
        owed.push({
          restaurantId: sub.restaurant.id,
          restaurantName: sub.restaurant.name,
          packageName: sub.packageName,
          currencyCode: sub.currencyCode,
          balance: summary.balance.toFixed(2),
        });
        outstanding.set(
          sub.currencyCode,
          (outstanding.get(sub.currencyCode) ?? new Prisma.Decimal(0)).add(
            summary.balance,
          ),
        );
      }
    }
    // the ones about to stop first: in grace (days before the pause), then by days left
    const urgency = (e: BillingOverview['ending'][number]) =>
      e.phase === 'GRACE' ? e.graceDaysLeft - 1000 : e.daysLeft;
    ending.sort((a, b) => urgency(a) - urgency(b));
    owed.sort((a, b) => Number(b.balance) - Number(a.balance));

    const received = new Map<string, Prisma.Decimal>();
    for (const payment of paid) {
      const currency = payment.subscription.currencyCode;
      received.set(
        currency,
        (received.get(currency) ?? new Prisma.Decimal(0)).add(payment.amount),
      );
    }
    const totals = (map: Map<string, Prisma.Decimal>): MoneyTotal[] =>
      [...map]
        .map(([currencyCode, amount]) => ({
          currencyCode,
          amount: amount.toFixed(2),
        }))
        .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

    return {
      ending: ending.slice(0, LIST_LIMIT),
      unpaid: owed.slice(0, LIST_LIMIT),
      unpaidCount: owed.length,
      outstanding: totals(outstanding),
      received30d: totals(received),
    };
  }

  /** Restaurants that effectively lack at least one feature (their package and overrides applied). */
  private async restrictedRestaurantCount(): Promise<number> {
    const rows = await this.prisma.restaurant.findMany({
      select: {
        features: { select: { feature: true, enabled: true } },
        package: { select: { features: { select: { feature: true } } } },
      },
    });
    return rows.filter((row) => {
      const effective = resolveFeatures(
        row.features,
        row.package?.features.map((f) => f.feature),
      );
      return CUSTOMER_FEATURE_KEYS.some((key) => !effective[key]);
    }).length;
  }
}
