import { platformFetch } from "./client";

/** Mirrors the Backend's billing responses (`apps/api/src/platform/billing`, DEC-049). Money is always a string. */
export type BillingCurrency = "EGP" | "USD";
export type BillingPeriod = "MONTHLY" | "YEARLY";
export type DiscountType = "PERCENT" | "AMOUNT";
export type SubscriptionPhase = "CANCELLED" | "UPCOMING" | "ACTIVE" | "GRACE" | "EXPIRED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "INSTAPAY", "MOBILE_WALLET", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PriceBreakdown {
  currencyCode: BillingCurrency;
  listPrice: string;
  offer: { label: string | null; percent: string; amount: string } | null;
  discount: { type: DiscountType; value: string; amount: string } | null;
  finalPrice: string;
}

export interface SubscriptionPreview extends PriceBreakdown {
  packageId: string;
  packageName: string;
  period: BillingPeriod;
  startsAt: string;
  endsAt: string;
}

export interface PaymentEntry {
  id: string;
  amount: string;
  method: PaymentMethod;
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

export interface Subscription extends PriceBreakdown {
  id: string;
  packageId: string;
  packageName: string;
  kind: "PAID" | "TRIAL";
  period: BillingPeriod | null;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "CANCELLED";
  phase: SubscriptionPhase;
  daysLeft: number;
  graceDaysLeft: number;
  paid: string;
  balance: string;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdByEmail: string;
  createdAt: string;
  cancelledAt: string | null;
  contractNumber: string | null;
  payments: PaymentEntry[];
}

export interface RestaurantBilling {
  restaurant: { id: string; name: string; status: string; countryCode: string; billingCurrency: BillingCurrency };
  graceDays: number;
  trial: { enabled: boolean; defaultDays: number; defaultPackageId: string | null };
  /** The subscription that matters now (running, else in grace, else next, else latest). */
  currentId: string | null;
  subscriptions: Subscription[];
}

export interface SubscriptionInput {
  packageId: string;
  period: BillingPeriod;
  /** YYYY-MM-DD; omitted = today, or the day the running subscription ends. */
  startsAt?: string;
  discount?: { type: DiscountType; value: string };
  notes?: string;
}

export interface TrialInput {
  packageId: string;
  startsAt?: string;
  durationDays: number;
  notes?: string;
}

export interface PaymentInput {
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  notes?: string;
}

export interface ContractData {
  number: string;
  issuedAt: string;
  subscriptionId: string;
  terms: {
    number: string;
    restaurant: { name: string; countryCode: string; ownerEmails: string[] };
    package: { name: string; features: string[] };
    period: BillingPeriod;
    startsAt: string;
    endsAt: string;
    pricing: PriceBreakdown;
    graceDays: number;
    notes: string | null;
    issuedBy: string;
  };
}

const data = async <T>(promise: Promise<{ data: T }>): Promise<T> => (await promise).data;
const enc = encodeURIComponent;

export const getBilling = (restaurantId: string) =>
  data(platformFetch<{ data: RestaurantBilling }>(`/restaurants/${enc(restaurantId)}/billing`));

export const setBillingCountry = (restaurantId: string, countryCode: string) =>
  data(
    platformFetch<{ data: { countryCode: string; billingCurrency: BillingCurrency } }>(
      `/restaurants/${enc(restaurantId)}/country`,
      { method: "PUT", body: { countryCode } },
    ),
  );

export const previewSubscription = (restaurantId: string, input: SubscriptionInput) =>
  data(
    platformFetch<{ data: SubscriptionPreview }>(`/restaurants/${enc(restaurantId)}/subscriptions/preview`, {
      method: "POST",
      body: input,
    }),
  );

export const createSubscription = (restaurantId: string, input: SubscriptionInput) =>
  data(
    platformFetch<{ data: Subscription }>(`/restaurants/${enc(restaurantId)}/subscriptions`, {
      method: "POST",
      body: input,
    }),
  );

export const createTrial = (restaurantId: string, input: TrialInput) =>
  data(
    platformFetch<{ data: Subscription }>(`/restaurants/${enc(restaurantId)}/trials`, {
      method: "POST",
      body: input,
    }),
  );

export const updateTrial = (subscriptionId: string, endsAt: string) =>
  data(
    platformFetch<{ data: Subscription }>(`/subscriptions/${enc(subscriptionId)}/trial`, {
      method: "PUT",
      body: { endsAt },
    }),
  );

export const cancelSubscription = (subscriptionId: string) =>
  data(platformFetch<{ data: Subscription }>(`/subscriptions/${enc(subscriptionId)}/cancel`, { method: "POST" }));

export const recordPayment = (subscriptionId: string, input: PaymentInput) =>
  data(
    platformFetch<{ data: Subscription }>(`/subscriptions/${enc(subscriptionId)}/payments`, {
      method: "POST",
      body: input,
    }),
  );

export const voidPayment = (subscriptionId: string, paymentId: string, reason: string) =>
  data(
    platformFetch<{ data: Subscription }>(
      `/subscriptions/${enc(subscriptionId)}/payments/${enc(paymentId)}/void`,
      { method: "POST", body: { reason } },
    ),
  );

export const getContract = (subscriptionId: string) =>
  data(platformFetch<{ data: ContractData }>(`/subscriptions/${enc(subscriptionId)}/contract`));
