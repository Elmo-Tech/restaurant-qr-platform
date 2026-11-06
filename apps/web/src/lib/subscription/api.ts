import { apiFetch } from '../api/client';

/** "My subscription" (DEC-050): Staff request layer for `/restaurants/{id}/subscription`. Money values are strings. */

export type SubscriptionPhase = 'CANCELLED' | 'UPCOMING' | 'ACTIVE' | 'GRACE' | 'EXPIRED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';
export type PlanFeatureKey =
  | 'WHATSAPP_ORDERING'
  | 'ORDER_TRACKING'
  | 'SMART_SUGGESTIONS'
  | 'MENU_TEMPLATES'
  | 'DASHBOARD_ORDERING'
  | 'TABLE_ORDERING'
  | 'KITCHEN'
  | 'OFFERS';

export interface PlanSubscription {
  kind: 'PAID' | 'TRIAL';
  phase: SubscriptionPhase;
  packageName: string;
  period: 'MONTHLY' | 'YEARLY' | null;
  /** YYYY-MM-DD */
  startsAt: string;
  endsAt: string;
  daysLeft: number;
  graceDaysLeft: number;
  currencyCode: string;
  finalPrice: string;
  paid: string;
  balance: string;
  paymentStatus: PaymentStatus;
}

/** Catalogue list prices and the eligible current offer, not the agreed subscription snapshot. */
export interface CataloguePricing {
  priceMonthly: string | null;
  priceYearly: string | null;
  discountedMonthly: string | null;
  discountedYearly: string | null;
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
}

export interface UpgradeOption extends CataloguePricing {
  id: string;
  name: string;
  description: string | null;
  features: PlanFeatureKey[];
  /** What it would add to what the restaurant has now. */
  adds: PlanFeatureKey[];
  /** How many Guest menu templates it gives (Classic counts, DEC-051). */
  templateCount: number;
  /** The same, split by tier (DEC-052). */
  templateStandard: number;
  templatePremium: number;
}

export interface OpenRequest {
  id: string;
  kind: 'UPGRADE' | 'RENEWAL';
  packageName: string | null;
  message: string | null;
  status: 'NEW' | 'CONTACTED';
  createdAt: string;
}

export interface MySubscription {
  billingCurrency: 'EGP' | 'USD';
  graceDays: number;
  package: { id: string; name: string } | null;
  /** Public catalogue pricing of current package; actual agreed price stays in subscription.finalPrice. */
  currentPricing: CataloguePricing | null;
  features: { key: PlanFeatureKey; included: boolean }[];
  /** The Guest menu templates the restaurant may use now, out of all of them (DEC-051). */
  templates: {
    current: number;
    total: number;
    currentStandard: number;
    currentPremium: number;
    totalStandard: number;
    totalPremium: number;
  };
  subscription: PlanSubscription | null;
  /** All ACTIVE catalogue packages other than the current, including lower tiers. */
  comparisonPlans?: UpgradeOption[];
  /** Only eligible upgrade targets; never used to hide plans in comparisons. */
  upgrades: UpgradeOption[];
  openRequest: OpenRequest | null;
}

const base = (restaurantId: string): string => `/restaurants/${restaurantId}/subscription`;

export async function getMySubscription(restaurantId: string): Promise<MySubscription> {
  const body = await apiFetch<{ data: MySubscription }>(base(restaurantId));
  return body.data;
}

export async function sendSubscriptionRequest(
  restaurantId: string,
  input: { kind: 'UPGRADE' | 'RENEWAL'; packageId?: string; message?: string },
): Promise<OpenRequest> {
  const body = await apiFetch<{ data: OpenRequest }>(`${base(restaurantId)}/requests`, {
    method: 'POST',
    body: input,
  });
  return body.data;
}

/** The banner's rule: say something when a running subscription has 7 days or fewer, or while it is in its grace period. */
export const ENDING_SOON_DAYS = 7;
