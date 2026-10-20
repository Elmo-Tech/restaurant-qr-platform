import { Injectable } from '@nestjs/common';
import { FEATURE_KEYS, type FeatureKey } from '../entitlements/features';
import { templateTierCountsOf } from '../entitlements/templates';
import { PrismaService } from '../database/prisma.service';
import {
  calculatePrice,
  listPriceFor,
  offerIsActive,
  type BillingCurrency,
  type BillingPeriodKey,
} from '../platform/billing/pricing';
import { todayInCairo } from '../platform/billing/subscription-dates';

/** Days of free trial a visitor can ask for on the landing page (DEC-053). */
export const TRIAL_DAYS = 15;

/** One price on the landing page: what the visitor pays after the package offer, and the list price. */
export interface LandingPrice {
  currencyCode: BillingCurrency;
  period: BillingPeriodKey;
  /** After the package offer. */
  amount: string;
  /** Before the offer; the same as `amount` when there is no offer. */
  listAmount: string;
}

export interface LandingPlan {
  id: string;
  name: string;
  description: string | null;
  features: FeatureKey[];
  /** Standard and premium menu designs it includes (Classic counts as standard). */
  designs: { standard: number; premium: number };
  prices: LandingPrice[];
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
}

export interface LeadInput {
  kind: 'SUBSCRIBE' | 'TRIAL';
  packageId: string | null;
  name: string;
  email: string;
  phone: string;
  restaurantName: string | null;
  message: string | null;
  locale: 'ar' | 'en';
}

/** The public landing page's data and its subscription requests (DEC-053). */
@Injectable()
export class PublicLandingService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active packages with their prices (offer applied) and what they include, cheapest first. */
  async plans(): Promise<LandingPlan[]> {
    const today = todayInCairo();
    const rows = await this.prisma.package.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        description: true,
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

    const plans = rows.map((row): LandingPlan => {
      const offerPercent = offerIsActive(row, today) ? row.offerPercent : null;
      const prices: LandingPrice[] = [];
      for (const currency of ['EGP', 'USD'] as const) {
        for (const period of ['MONTHLY', 'YEARLY'] as const) {
          const list = listPriceFor(row, currency, period);
          if (list === null) continue;
          const breakdown = calculatePrice({
            currencyCode: currency,
            listPrice: list,
            offer: offerPercent
              ? { label: row.offerLabel, percent: offerPercent }
              : null,
            discount: null,
          });
          prices.push({
            currencyCode: currency,
            period,
            amount: breakdown.finalPrice.toFixed(2),
            listAmount: breakdown.listPrice.toFixed(2),
          });
        }
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        features: FEATURE_KEYS.filter((key) =>
          row.features.some((f) => f.feature === key),
        ),
        designs: templateTierCountsOf({
          includesFeature: row.features.some(
            (f) => f.feature === 'MENU_TEMPLATES',
          ),
          all: row.allTemplates,
          allStandard: row.allStandardTemplates,
          selected: row.templates.map((t) => t.template),
        }),
        prices,
        offer: offerPercent
          ? {
              percent: offerPercent.toFixed(2),
              label: row.offerLabel,
              endsAt: row.offerEndsAt
                ? row.offerEndsAt.toISOString().slice(0, 10)
                : null,
            }
          : null,
      };
    });

    // cheapest first (monthly EGP); packages without a monthly EGP price last
    const rank = (plan: LandingPlan) => {
      const monthly = plan.prices.find(
        (p) => p.currencyCode === 'EGP' && p.period === 'MONTHLY',
      );
      return monthly ? Number(monthly.amount) : Number.MAX_SAFE_INTEGER;
    };
    return plans.sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }

  /**
   * Records a request. The same e-mail asking again while its earlier request is still open does not
   * create another row (a double click, or a visitor who is not sure it went through).
   */
  async createLead(input: LeadInput): Promise<'created' | 'duplicate'> {
    const email = input.email.trim().toLowerCase();
    const open = await this.prisma.signupLead.findFirst({
      where: {
        email,
        status: { in: ['NEW', 'CONTACTED'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (open) return 'duplicate';

    let packageId: string | null = null;
    let packageName: string | null = null;
    if (input.packageId) {
      const pkg = await this.prisma.package.findFirst({
        where: { id: input.packageId, status: 'ACTIVE' },
        select: { id: true, name: true },
      });
      // an unknown or archived package is not an error for the visitor: the team follows up anyway
      packageId = pkg?.id ?? null;
      packageName = pkg?.name ?? null;
    }
    await this.prisma.signupLead.create({
      data: {
        kind: input.kind,
        packageId,
        packageName,
        name: input.name.trim(),
        email,
        phone: input.phone.trim(),
        restaurantName: input.restaurantName?.trim() || null,
        message: input.message?.trim() || null,
        locale: input.locale,
      },
    });
    return 'created';
  }
}
