import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../database/prisma.service';
import { restaurantMenuUrl } from '../../restaurants/menu-link';
import {
  CUSTOMER_FEATURE_KEYS,
  type FeatureKey,
} from '../../entitlements/features';
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
  addDays,
  parseDateOnly,
  periodEnd,
  pickCurrent,
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
  | 'ALREADY_VOIDED'
  | 'TRIAL_DISABLED'
  | 'NOT_A_TRIAL'
  | 'TRIAL_PAYMENT_NOT_ALLOWED';

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

export interface TrialInput {
  packageId: string;
  startsAt: string | null;
  durationDays: number;
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
  kind: 'PAID' | 'TRIAL';
  period: BillingPeriodKey | null;
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
  trial: {
    enabled: boolean;
    defaultDays: number;
    defaultPackageId: string | null;
  };
  /** The subscription that matters now: running, else in grace, else the next one, else the latest. */
  currentId: string | null;
  subscriptions: SubscriptionView[];
}

export interface ContractTerms {
  number: string;
  restaurant: {
    name: string;
    countryCode: string;
    ownerEmails: string[];
    ownerContact?: { fullName: string; phone: string } | null;
    menuUrl?: string | null;
  };
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
  isDraft: boolean;
  documentText: string | null;
  documentLocale: string | null;
  revision: number;
  assets: { seal: string | null; signature: string | null };
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
    ownerContact: { fullName: string; phone: string } | null;
    menuUrl: string | null;
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
  const phase = subscriptionPhase(
    row,
    today,
    row.kind === 'TRIAL' ? 0 : graceDays,
  );
  const summary = paymentSummary(
    row.finalPrice,
    row.payments.filter((p) => p.voidedAt === null).map((p) => p.amount),
  );
  return {
    ...priceView(row),
    id: row.id,
    packageId: row.packageId,
    packageName: row.packageName,
    kind: row.kind,
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
    const trialSettings = await this.prisma.platformTrialSettings.findUnique({
      where: { id: 'trial' },
      select: { enabled: true, defaultDays: true, defaultPackageId: true },
    });
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
        trial: {
          enabled: trialSettings?.enabled ?? true,
          defaultDays: trialSettings?.defaultDays ?? 15,
          defaultPackageId: trialSettings?.defaultPackageId ?? null,
        },
        currentId: pickCurrent(subscriptions)?.id ?? null,
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
            ownerContact: restaurant.ownerContact,
            menuUrl: restaurant.menuUrl,
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
                isDraft: true,
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

  async createTrial(
    admin: PlatformAdminPrincipal,
    restaurantId: string,
    input: TrialInput,
  ): Promise<BillingOutcome<SubscriptionView>> {
    if (!UUID.test(restaurantId)) return { outcome: 'RESTAURANT_NOT_FOUND' };
    if (!UUID.test(input.packageId)) return { outcome: 'PACKAGE_NOT_FOUND' };
    if (
      !Number.isInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > 365
    ) {
      return { outcome: 'INVALID_DATE' };
    }

    const [restaurant, pkg, settings] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          countryCode: true,
          subscriptions: {
            where: { status: 'ACTIVE' },
            select: { startsAt: true, endsAt: true },
          },
        },
      }),
      this.prisma.package.findUnique({
        where: { id: input.packageId },
        select: { id: true, name: true, status: true },
      }),
      this.prisma.platformTrialSettings.findUnique({
        where: { id: 'trial' },
        select: { enabled: true },
      }),
    ]);
    if (!restaurant) return { outcome: 'RESTAURANT_NOT_FOUND' };
    if (!pkg) return { outcome: 'PACKAGE_NOT_FOUND' };
    if (pkg.status !== 'ACTIVE') return { outcome: 'PACKAGE_ARCHIVED' };
    if (settings?.enabled === false) return { outcome: 'TRIAL_DISABLED' };

    const startsAt = input.startsAt
      ? parseDateOnly(input.startsAt)
      : todayInCairo();
    if (!startsAt) return { outcome: 'INVALID_DATE' };
    const endsAt = addDays(startsAt, input.durationDays);
    const overlaps = restaurant.subscriptions.some(
      (sub) => sub.startsAt < endsAt && sub.endsAt > startsAt,
    );
    if (overlaps) return { outcome: 'OVERLAP' };

    const currencyCode = currencyForCountry(restaurant.countryCode);
    let created: SubscriptionRow | 'OVERLAP';
    try {
      created = await this.prisma.$transaction(async (tx) => {
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
        return tx.subscription.create({
          data: {
            restaurantId,
            packageId: pkg.id,
            packageName: pkg.name,
            kind: 'TRIAL',
            period: null,
            startsAt,
            endsAt,
            currencyCode,
            listPrice: 0,
            offerAmount: 0,
            discountAmount: 0,
            finalPrice: 0,
            notes: input.notes,
            createdByAdminId: admin.adminId,
            createdByEmail: admin.email,
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
      action: 'trial.created',
      restaurant: { id: restaurant.id, name: restaurant.name },
      details: {
        subscriptionId: created.id,
        package: pkg.name,
        startsAt: formatDateOnly(startsAt),
        endsAt: formatDateOnly(endsAt),
        durationDays: input.durationDays,
      },
    });
    await this.sync.syncRestaurant(restaurantId);
    return {
      outcome: 'ok',
      data: subscriptionView(created, todayInCairo(), this.graceDays),
    };
  }

  async updateTrial(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
    endsAtValue: string,
  ): Promise<BillingOutcome<SubscriptionView>> {
    if (!UUID.test(subscriptionId))
      return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    const endsAt = parseDateOnly(endsAtValue);
    if (!endsAt) return { outcome: 'INVALID_DATE' };
    const found = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        kind: true,
        status: true,
        startsAt: true,
        endsAt: true,
        restaurant: { select: { id: true, name: true } },
      },
    });
    if (!found) return { outcome: 'SUBSCRIPTION_NOT_FOUND' };
    if (found.kind !== 'TRIAL') return { outcome: 'NOT_A_TRIAL' };
    if (found.status === 'CANCELLED')
      return { outcome: 'SUBSCRIPTION_CANCELLED' };
    if (endsAt <= found.startsAt) return { outcome: 'INVALID_DATE' };

    let row: SubscriptionRow | 'OVERLAP';
    try {
      row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${found.restaurant.id}::uuid FOR UPDATE`;
        const clash = await tx.subscription.findFirst({
          where: {
            restaurantId: found.restaurant.id,
            id: { not: found.id },
            status: 'ACTIVE',
            startsAt: { lt: endsAt },
            endsAt: { gt: found.startsAt },
          },
          select: { id: true },
        });
        if (clash) return 'OVERLAP' as const;
        return tx.subscription.update({
          where: { id: found.id },
          data: { endsAt },
          include: subscriptionInclude,
        });
      });
    } catch (error) {
      if (isOverlapViolation(error)) return { outcome: 'OVERLAP' };
      throw error;
    }
    if (row === 'OVERLAP') return { outcome: 'OVERLAP' };

    await this.audit.record({
      admin,
      action: 'trial.updated',
      restaurant: found.restaurant,
      details: {
        subscriptionId: found.id,
        from: formatDateOnly(found.endsAt),
        to: formatDateOnly(endsAt),
      },
    });
    await this.sync.syncRestaurant(found.restaurant.id);
    return {
      outcome: 'ok',
      data: subscriptionView(row, todayInCairo(), this.graceDays),
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
    if (found.kind === 'TRIAL') return { outcome: 'TRIAL_PAYMENT_NOT_ALLOWED' };
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
    const assets = row.issuedAssets;
    return {
      outcome: 'ok',
      data: {
        number: row.number,
        issuedAt: row.issuedAt.toISOString(),
        subscriptionId,
        terms: row.terms as unknown as ContractTerms,
        isDraft: row.isDraft,
        documentText: row.documentText,
        documentLocale: row.documentLocale,
        revision: row.revision,
        assets: (assets ?? { seal: null, signature: null }) as {
          seal: string | null;
          signature: string | null;
        },
      },
    };
  }

  async saveSigningAsset(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
    revision: number,
    kind: 'seal' | 'signature',
    bytes: Buffer,
    mime: string,
  ): Promise<void> {
    if (!UUID.test(subscriptionId)) throw new NotFoundException();
    const row = await this.prisma.contract.findUnique({
      where: { subscriptionId },
      select: { id: true, revision: true, isDraft: true, issuedAssets: true },
    });
    if (!row) throw new NotFoundException();
    if (!row.isDraft || row.revision !== revision)
      throw new ConflictException(
        'Contract changed or was issued. Reload and try again.',
      );
    const existing = (row.issuedAssets ?? { seal: null, signature: null }) as {
      seal: string | null;
      signature: string | null;
    };
    const assets = {
      ...existing,
      [kind]: `data:${mime};base64,${bytes.toString('base64')}`,
    };
    const result = await this.prisma.contract.updateMany({
      where: { id: row.id, isDraft: true, revision },
      data: { issuedAssets: assets, revision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Contract changed or was issued. Reload and try again.',
      );
    await this.audit.record({
      admin,
      action: 'contract.signing_asset_updated',
      details: { subscriptionId, kind },
    });
  }

  async reopenContract(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
  ): Promise<void> {
    if (!UUID.test(subscriptionId)) throw new NotFoundException();
    const row = await this.prisma.contract.findUnique({
      where: { subscriptionId },
      include: {
        subscription: {
          select: {
            restaurant: {
              select: {
                ownerContact: { select: { fullName: true, phone: true } },
                slugs: {
                  where: { isCurrent: true },
                  select: { slug: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException();
    if (row.isDraft) return;
    if (row.documentText !== null) {
      throw new ConflictException('Issued contracts cannot be reopened.');
    }
    const terms = row.terms as unknown as ContractTerms;
    const slug = row.subscription.restaurant.slugs[0]?.slug;
    const menuUrl = slug
      ? restaurantMenuUrl(
          slug,
          this.config.get('CORS_ORIGIN', { infer: true }),
          this.config.get('RESTAURANT_BASE_DOMAIN', { infer: true }),
        )
      : null;
    const nextTerms = {
      ...terms,
      restaurant: {
        ...terms.restaurant,
        ownerContact:
          terms.restaurant.ownerContact ??
          row.subscription.restaurant.ownerContact,
        menuUrl: terms.restaurant.menuUrl ?? menuUrl,
      },
    };
    const result = await this.prisma.contract.updateMany({
      where: { id: row.id, isDraft: false, revision: row.revision },
      data: {
        isDraft: true,
        terms: nextTerms as unknown as Prisma.InputJsonObject,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new ConflictException('Contract changed. Reload and try again.');
    await this.audit.record({
      admin,
      action: 'contract.reopened',
      details: { subscriptionId },
    });
  }

  async saveContractDraft(
    admin: PlatformAdminPrincipal,
    subscriptionId: string,
    revision: number,
    locale: string,
    text: string,
    issue: boolean,
  ): Promise<void> {
    if (!UUID.test(subscriptionId)) throw new NotFoundException();
    if (!text.trim())
      throw new BadRequestException('Contract text is required.');
    const result = await this.prisma.contract.updateMany({
      where: { subscriptionId, isDraft: true, revision },
      data: {
        documentText: text,
        documentLocale: locale,
        revision: { increment: 1 },
        ...(issue
          ? {
              isDraft: false,
              issuedAt: new Date(),
            }
          : {}),
      },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Contract changed or was issued. Reload and try again.',
      );
    await this.audit.record({
      admin,
      action: issue ? 'contract.issued' : 'contract.draft_saved',
      details: { subscriptionId },
    });
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
        kind: true,
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
          ownerContact: { select: { fullName: true, phone: true } },
          slugs: {
            where: { isCurrent: true },
            select: { slug: true },
            take: 1,
          },
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
        ownerContact: restaurant.ownerContact,
        menuUrl: restaurant.slugs[0]
          ? restaurantMenuUrl(
              restaurant.slugs[0].slug,
              this.config.get('CORS_ORIGIN', { infer: true }),
              this.config.get('RESTAURANT_BASE_DOMAIN', { infer: true }),
            )
          : null,
      },
      pkg: {
        id: pkg.id,
        name: pkg.name,
        features: CUSTOMER_FEATURE_KEYS.filter((key) =>
          pkg.features.some((f) => f.feature === key),
        ),
      },
      startsAt,
      endsAt,
      breakdown,
    };
  }
}
