import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import { FEATURE_KEYS, type FeatureKey } from '../../entitlements/features';
import { Prisma } from '../../generated/prisma/client';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';
import {
  calculatePrice,
  currencyForCountry,
  listPriceFor,
  offerIsActive,
  paymentSummary,
  type BillingCurrency,
  type BillingPeriodKey,
  type DiscountKind,
  type PaymentStatus,
  type PriceBreakdown,
} from './pricing';
import {
  formatDateOnly,
  parseDateOnly,
  periodEnd,
  subscriptionPhase,
  todayInCairo,
  type SubscriptionPhase,
} from './subscription-dates';
import { SubscriptionSyncService } from './subscription-sync.service';

const Decimal = Prisma.Decimal;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

export type BillingRefusal =
  | 'RESTAURANT_NOT_FOUND'
  | 'PACKAGE_NOT_FOUND'
  | 'PACKAGE_ARCHIVED'
  | 'PRICE_NOT_SET'
  | 'OVERLAP'
  | 'INVALID_DATE'
  | 'INVALID_DISCOUNT'
  | 'INVALID_AMOUNT'
  | 'INVALID_COUNTRY'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'SUBSCRIPTION_CANCELLED'
  | 'ALREADY_CANCELLED'
  | 'PAYMENT_NOT_FOUND'
  | 'ALREADY_VOIDED';

export type BillingOutcome<T> =
  { outcome: 'ok'; data: T } | { outcome: BillingRefusal };

export interface SubscriptionInput {
  packageId: string;
  period: BillingPeriodKey;
  /** YYYY-MM-DD; missing = today, or the day the last subscription ends when it is still running. */
  startsAt: string | null;
  discount: { type: DiscountKind; value: string } | null;
  notes: string | null;
}

export interface PaymentInput {
  amount: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'INSTAPAY' | 'MOBILE_WALLET' | 'OTHER';
  paidAt: string;
  reference: string | null;
  notes: string | null;
}

export interface PriceView {
  currencyCode: BillingCurrency;
  listPrice: string;
  offer: { label: string | null; percent: string; amount: string } | null;
  discount: { type: DiscountKind; value: string; amount: string } | null;
  finalPrice: string;
}

export interface SubscriptionPreview extends PriceView {
  packageId: string;
  packageName: string;
  period: BillingPeriodKey;
  startsAt: string;
  endsAt: string;
}

export interface PaymentView {
  id: string;
  amount: string;
  method: PaymentInput['method'];
  paidAt: string;
  reference: string | null;
  notes: string | null;
  recordedByEmail: string;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByEmail: string | null;
  createdAt: string;
}

export interface SubscriptionView extends PriceView {
  id: string;
  packageId: string;
  packageName: string;
  period: BillingPeriodKey;
  startsAt: string;
  endsAt: string;
  status: 'ACTIVE' | 'CANCELLED';
  phase: SubscriptionPhase;
  /** Days the subscription still covers (0 once ended). */
  daysLeft: number;
  /** Days before the Restaurant is suspended, while the subscription is in its grace period. */
  graceDaysLeft: number;
  paid: string;
  balance: string;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdByEmail: string;
  createdAt: string;
  cancelledAt: string | null;
  contractNumber: string | null;
  payments: PaymentView[];
}

export interface BillingView {
  restaurant: {
    id: string;
    name: string;
    status: string;
    countryCode: string;
    /** The currency this Restaurant is billed in (from its country). */
    billingCurrency: BillingCurrency;
  };
  graceDays: number;
  /** The subscription that matters now: running, else in grace, else the next one, else the latest. */
  currentId: string | null;
  subscriptions: SubscriptionView[];
}

export interface ContractTerms {
  number: string;
  restaurant: { name: string; countryCode: string; ownerEmails: string[] };
  package: { name: string; features: FeatureKey[] };
  period: BillingPeriodKey;
  startsAt: string;
  endsAt: string;
  pricing: PriceView;
  graceDays: number;
  notes: string | null;
  issuedBy: string;
}

export interface ContractView {
  number: string;
  issuedAt: string;
  subscriptionId: string;
  terms: ContractTerms;
}

interface Refused {
  outcome: BillingRefusal;
}

interface Resolved {
  restaurant: {
    id: string;
    name: string;
    countryCode: string;
    ownerEmails: string[];
  };
  pkg: { id: string; name: string; features: FeatureKey[] };
  startsAt: Date;
  endsAt: Date;
  breakdown: PriceBreakdown;
}

const subscriptionInclude = {
  payments: { orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] },
  contract: { select: { number: true } },
} satisfies Prisma.SubscriptionInclude;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

const money = (value: Prisma.Decimal): string => value.toFixed(2);

function priceView(row: {
  currencyCode: string;
  listPrice: Prisma.Decimal;
  offerLabel: string | null;
  offerPercent: Prisma.Decimal | null;
  offerAmount: Prisma.Decimal;
  discountType: DiscountKind | null;
  discountValue: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  finalPrice: Prisma.Decimal;
}): PriceView {
  return {
    currencyCode: row.currencyCode as BillingCurrency,
    listPrice: money(row.listPrice),
    offer: row.offerPercent
      ? {
          label: row.offerLabel,
          percent: row.offerPercent.toFixed(2),
          amount: money(row.offerAmount),
        }
      : null,
    discount:
      row.discountType && row.discountValue
        ? {
            type: row.discountType,
            value: money(row.discountValue),
            amount: money(row.discountAmount),
          }
        : null,
    finalPrice: money(row.finalPrice),
  };
}

function breakdownView(breakdown: PriceBreakdown): PriceView {
  return {
    currencyCode: breakdown.currencyCode,
    listPrice: money(breakdown.listPrice),
    offer: breakdown.offer && {
      label: breakdown.offer.label,
      percent: breakdown.offer.percent.toFixed(2),
      amount: money(breakdown.offer.amount),
    },
    discount: breakdown.discount && {
      type: breakdown.discount.type,
      value: money(breakdown.discount.value),
      amount: money(breakdown.discount.amount),
    },
    finalPrice: money(breakdown.finalPrice),
  };
}

function paymentView(row: SubscriptionRow['payments'][number]): PaymentView {
  return {
    id: row.id,
    amount: money(row.amount),
    method: row.method,
    paidAt: formatDateOnly(row.paidAt),
    reference: row.reference,
    notes: row.notes,
    recordedByEmail: row.recordedByEmail,
    voided: row.voidedAt !== null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    voidedByEmail: row.voidedByEmail,
    createdAt: row.createdAt.toISOString(),
  };
}

function subscriptionView(
  row: SubscriptionRow,
  today: Date,
  graceDays: number,
): SubscriptionView {
  const phase = subscriptionPhase(row, today, graceDays);
  const summary = paymentSummary(
    row.finalPrice,
    row.payments.filter((p) => p.voidedAt === null).map((p) => p.amount),
  );
  return {
    ...priceView(row),
    id: row.id,
    packageId: row.packageId,
    packageName: row.packageName,
    period: row.period,
    startsAt: formatDateOnly(row.startsAt),
    endsAt: formatDateOnly(row.endsAt),
    status: row.status,
    phase: phase.phase,
    daysLeft: phase.daysLeft,
    graceDaysLeft: phase.graceDaysLeft,
    paid: money(summary.paid),
    balance: money(summary.balance),
    paymentStatus: summary.status,
    notes: row.notes,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    contractNumber: row.contract?.number ?? null,
    payments: row.payments.map(paymentView),
  };
}

/** Running, else in grace, else the next one to start, else the most recent. */
function pickCurrent(subs: readonly SubscriptionView[]): string | null {
  const byStart = [...subs].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const running = byStart.find((s) => s.phase === 'ACTIVE');
  if (running) return running.id;
  const grace = byStart.find((s) => s.phase === 'GRACE');
  if (grace) return grace.id;
  const upcoming = byStart.find((s) => s.phase === 'UPCOMING');
  if (upcoming) return upcoming.id;
  const live = byStart.filter((s) => s.status === 'ACTIVE');
  return (live[live.length - 1] ?? byStart[byStart.length - 1])?.id ?? null;
}

const isOverlapViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('subscriptions_no_overlap');

/**
 * Manual billing (DEC-049): subscriptions with a price snapshot, a payment ledger and a contract.
 * Everything that is money or a date is decided here, never by the console. A subscription change
 * also re-syncs the Restaurant (its Package, and its suspension) through `SubscriptionSyncService`.
 */
@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly sync: SubscriptionSyncService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private get graceDays(): number {
    return this.config.get('SUBSCRIPTION_GRACE_DAYS', { infer: true });
  }

  async billing(restaurantId: string): Promise<BillingOutcome<BillingView>> {
    if (!UUID.test(restaurantId)) return { outcome: 'RESTAURANT_NOT_FOUND' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        status: true,
        countryCode: true,
        subscriptions: {
          include: subscriptionInclude,
          orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' };
    const today = todayInCairo();
    const subscriptions = restaurant.subscriptions.map((row) =>
      subscriptionView(row, today, this.graceDays),
    );
    return {
      outcome: 'ok',
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          status: restaurant.status,
          countryCode: restaurant.countryCode,
          billingCurrency: currencyForCountry(restaurant.countryCode),
        },
        graceDays: this.graceDays,
        currentId: pickCurrent(subscriptions),
        subscriptions,
      },
    };
  }

  async preview(
    restaurantId: string,
    input: SubscriptionInput,
  ): Promise<BillingOutcome<SubscriptionPreview>> {
    const resolved = await this.resolve(restaurantId, input);
    if ('outcome' in resolved) return { outcome: resolved.outcome };
    return {
      outcome: 'ok',
      data: {
        ...breakdownView(resolved.breakdown),
        packageId: resolved.pkg.id,
        packageName: resolved.pkg.name,
        period: input.period,
        startsAt: formatDateOnly(resolved.startsAt),
        endsAt: formatDateOnly(resolved.endsAt),
      },
    };
  }

  async create(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    input: SubscriptionInput,
  ): Promise<BillingOutcome<SubscriptionView>> {
    const resolved = await this.resolve(restaurantId, input);
    if ('outcome' in resolved) return { outcome: resolved.outcome };
    const { restaurant, pkg, startsAt, endsAt, breakdown } = resolved;
    const issueYear = todayInCairo().getUTCFullYear();

    let created: SubscriptionRow | 'OVERLAP';
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // serialize writers of one Restaurant so two simultaneous renewals cannot both pass the check
        await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
        const clash = await tx.subscription.findFirst({
          where: {
            restaurantId,
            status: 'ACTIVE',
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { id: true },
        });
        if (clash) return 'OVERLAP' as const;

        const [{ n }] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT nextval('contract_number_seq')::int AS n`;
        const number = `WAYTA-${issueYear}-${String(n).padStart(4, '0')}`;
        const view = breakdownView(breakdown);
        const terms: ContractTerms = {
          number,
          restaurant: {
            name: restaurant.name,
            countryCode: restaurant.countryCode,
            ownerEmails: restaurant.ownerEmails,
          },
          package: { name: pkg.name, features: pkg.features },
          period: input.period,
          startsAt: formatDateOnly(startsAt),
          endsAt: formatDateOnly(endsAt),
          pricing: view,
          graceDays: this.graceDays,
          notes: input.notes,
          issuedBy: admin.email,
        };
        return tx.subscription.create({
          data: {
            restaurantId,
            packageId: pkg.id,
            packageName: pkg.name,
            period: input.period,
            startsAt,
            endsAt,
            currencyCode: breakdown.currencyCode,
            listPrice: breakdown.listPrice,
            offerLabel: breakdown.offer?.label ?? null,
            offerPercent: breakdown.offer?.percent ?? null,
            offerAmount: breakdown.offer?.amount ?? 0,
            discountType: breakdown.discount?.type ?? null,
            discountValue: breakdown.discount?.value ?? null,
            discountAmount: breakdown.discount?.amount ?? 0,
            finalPrice: breakdown.finalPrice,
            notes: input.notes,
            createdByAdminId: admin.adminId,
            createdByEmail: admin.email,
            contract: {
              create: {
                number,
                terms: terms as unknown as Prisma.InputJsonObject,
              },
            },
          },
          include: subscriptionInclude,
        });
      });
    } catch (error) {
      if (isOverlapViolation(error)) return { outcome: 'OVERLAP' };
      throw error;
    }
    if (created === 'OVERLAP') return { outcome: 'OVERLAP' };

    await this.audit.record({
      admin,
      action: 'subscription.created',
      restaurant: { id: restaurant.id, name: restaurant.name },
      details: {
        subscriptionId: created.id,
        package: pkg.name,
        period: input.period,
        startsAt: formatDateOnly(startsAt),
        endsAt: formatDateOnly(endsAt),
        currency: breakdown.currencyCode,
        finalPrice: money(breakdown.finalPrice),
        contract: created.contract?.number ?? null,
      },
    });
    await this.sync.syncRestaurant(restaurantId);
    return {
      outcome: 'ok',
      data: subscriptionView(created, todayInCairo(), this.graceDays),
    };
  }

  async cancel(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
  ): Promise<BillingOutcome<SubscriptionView>> {
    const found = await this.findSubscription(subscriptionId);
    if (!found) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    if (found.status === 'CANCELLED') return { outcome: 'ALREADY_CANCELLED' };
    const row = await this.prisma.subscription.update({
      where: { id: found.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: subscriptionInclude,
    });
    await this.audit.record({
      admin,
      action: 'subscription.cancelled',
      restaurant: { id: found.restaurant.id, name: found.restaurant.name },
      details: { subscriptionId: row.id, package: row.packageName },
    });
    await this.sync.syncRestaurant(found.restaurant.id);
    return {
      outcome: 'ok',
      data: subscriptionView(row, todayInCairo(), this.graceDays),
    };
  }

  async recordPayment(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
    input: PaymentInput,
  ): Promise<BillingOutcome<SubscriptionView>> {
    const found = await this.findSubscription(subscriptionId);
    if (!found) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    if (found.status === 'CANCELLED')
      return { outcome: 'SUBSCRIPTION_CANCELLED' };
    if (!MONEY.test(input.amount) || new Decimal(input.amount).lte(0)) {
      return { outcome: 'INVALID_AMOUNT' };
    }
    const paidAt = parseDateOnly(input.paidAt);
    if (!paidAt) return { outcome: 'INVALID_DATE' };

    await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId: found.id,
        amount: new Decimal(input.amount),
        method: input.method,
        paidAt,
        reference: input.reference,
        notes: input.notes,
        recordedByAdminId: admin.adminId,
        recordedByEmail: admin.email,
      },
    });
    await this.audit.record({
      admin,
      action: 'payment.recorded',
      restaurant: { id: found.restaurant.id, name: found.restaurant.name },
      details: {
        subscriptionId: found.id,
        amount: money(new Decimal(input.amount)),
        currency: found.currencyCode,
        method: input.method,
      },
    });
    return this.reload(found.id);
  }

  async voidPayment(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
    paymentId: string,
    reason: string,
  ): Promise<BillingOutcome<SubscriptionView>> {
    const found = await this.findSubscription(subscriptionId);
    if (!found) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    if (!UUID.test(paymentId)) return { outcome: 'PAYMENT_NOT_FOUND' };
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, subscriptionId: found.id },
    });
    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };
    if (payment.voidedAt) return { outcome: 'ALREADY_VOIDED' };

    // compare-and-set: two voids at once record only one
    const changed = await this.prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, voidedAt: null },
      data: {
        voidedAt: new Date(),
        voidReason: reason,
        voidedByEmail: admin.email,
      },
    });
    if (changed.count === 0) return { outcome: 'ALREADY_VOIDED' };
    await this.audit.record({
      admin,
      action: 'payment.voided',
      restaurant: { id: found.restaurant.id, name: found.restaurant.name },
      details: {
        subscriptionId: found.id,
        paymentId: payment.id,
        amount: money(payment.amount),
        reason,
      },
    });
    return this.reload(found.id);
  }

  async contract(
    subscriptionId: string,
  ): Promise<BillingOutcome<ContractView>> {
    if (!UUID.test(subscriptionId))
      return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    const row = await this.prisma.contract.findUnique({
      where: { subscriptionId },
    });
    if (!row) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    return {
      outcome: 'ok',
      data: {
        number: row.number,
        issuedAt: row.issuedAt.toISOString(),
        subscriptionId,
        terms: row.terms as unknown as ContractTerms,
      },
    };
  }

  /** Change the billing country (EG = EGP, anything else = USD). Existing subscriptions keep their currency. */
  async setCountry(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    countryCode: string,
  ): Promise<
    BillingOutcome<{ countryCode: string; billingCurrency: BillingCurrency }>
  > {
    if (!UUID.test(restaurantId)) return { outcome: 'RESTAURANT_NOT_FOUND' };
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return { outcome: 'INVALID_COUNTRY' };
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, countryCode: true },
    });
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' };
    if (restaurant.countryCode !== code) {
      await this.prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { countryCode: code },
      });
      await this.audit.record({
        admin,
        action: 'restaurant.country_changed',
        restaurant: { id: restaurant.id, name: restaurant.name },
        details: { from: restaurant.countryCode, to: code },
      });
    }
    return {
      outcome: 'ok',
      data: { countryCode: code, billingCurrency: currencyForCountry(code) },
    };
  }

  // ----------------------------------------------------------------------------------- internals

  private async findSubscription(subscriptionId: string) {
    if (!UUID.test(subscriptionId)) return null;
    return this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        status: true,
        currencyCode: true,
        restaurant: { select: { id: true, name: true } },
      },
    });
  }

  private async reload(
    subscriptionId: string,
  ): Promise<BillingOutcome<SubscriptionView>> {
    const row = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: subscriptionInclude,
    });
    if (!row) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    return {
      outcome: 'ok',
      data: subscriptionView(row, todayInCairo(), this.graceDays),
    };
  }

  /** Validates a request and works out the dates and the price. Nothing is written. */
  private async resolve(
    restaurantId: string,
    input: SubscriptionInput,
  ): Promise<Refused | Resolved> {
    if (!UUID.test(restaurantId))
      return { outcome: 'RESTAURANT_NOT_FOUND' as const };
    if (!UUID.test(input.packageId))
      return { outcome: 'PACKAGE_NOT_FOUND' as const };

    const [restaurant, pkg] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          countryCode: true,
          packageId: true,
          memberships: {
            where: { role: 'OWNER' },
            select: { user: { select: { email: true } } },
            orderBy: { createdAt: 'asc' },
          },
          subscriptions: {
            where: { status: 'ACTIVE' },
            select: { startsAt: true, endsAt: true },
          },
        },
      }),
      this.prisma.package.findUnique({
        where: { id: input.packageId },
        select: {
          id: true,
          name: true,
          status: true,
          priceEgpMonthly: true,
          priceEgpYearly: true,
          priceUsdMonthly: true,
          priceUsdYearly: true,
          offerPercent: true,
          offerLabel: true,
          offerEndsAt: true,
          features: { select: { feature: true } },
        },
      }),
    ]);
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' as const };
    if (!pkg) return { outcome: 'PACKAGE_NOT_FOUND' as const };
    // an archived package is not handed out, but a customer already on it may renew
    if (pkg.status === 'ARCHIVED' && restaurant.packageId !== pkg.id) {
      return { outcome: 'PACKAGE_ARCHIVED' as const };
    }

    const today = todayInCairo();
    let startsAt: Date;
    if (input.startsAt) {
      const parsed = parseDateOnly(input.startsAt);
      if (!parsed) return { outcome: 'INVALID_DATE' as const };
      startsAt = parsed;
    } else {
      // chain onto the subscription that is still running or already booked
      const lastEnd = restaurant.subscriptions.reduce(
        (latest, sub) =>
          sub.endsAt.getTime() > latest.getTime() ? sub.endsAt : latest,
        today,
      );
      startsAt = lastEnd;
    }
    const endsAt = periodEnd(startsAt, input.period);

    // friendly early answer for the preview; `create` checks again under the Restaurant row lock
    const overlaps = restaurant.subscriptions.some(
      (sub) =>
        sub.startsAt.getTime() < endsAt.getTime() &&
        sub.endsAt.getTime() > startsAt.getTime(),
    );
    if (overlaps) return { outcome: 'OVERLAP' as const };

    const currencyCode = currencyForCountry(restaurant.countryCode);
    const listPrice = listPriceFor(pkg, currencyCode, input.period);
    if (!listPrice) return { outcome: 'PRICE_NOT_SET' as const };

    let discount: { type: DiscountKind; value: Prisma.Decimal } | null = null;
    if (input.discount) {
      const { type, value } = input.discount;
      const valid =
        type === 'PERCENT'
          ? PERCENT.test(value) &&
            new Decimal(value).gt(0) &&
            new Decimal(value).lte(100)
          : MONEY.test(value) && new Decimal(value).gt(0);
      if (!valid) return { outcome: 'INVALID_DISCOUNT' as const };
      discount = { type, value: new Decimal(value) };
    }

    const offer =
      offerIsActive(pkg, startsAt) && pkg.offerPercent
        ? { label: pkg.offerLabel, percent: pkg.offerPercent }
        : null;
    const breakdown = calculatePrice({
      currencyCode,
      listPrice,
      offer,
      discount,
    });

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        countryCode: restaurant.countryCode,
        ownerEmails: restaurant.memberships.map((m) => m.user.email),
      },
      pkg: {
        id: pkg.id,
        name: pkg.name,
        features: FEATURE_KEYS.filter((key) =>
          pkg.features.some((f) => f.feature === key),
        ),
      },
      startsAt,
      endsAt,
      breakdown,
    };
  }
}
