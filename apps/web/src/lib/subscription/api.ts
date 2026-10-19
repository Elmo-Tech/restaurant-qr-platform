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
  | 'TABLE_ORDERING';

export interface PlanSubscription {
  phase: SubscriptionPhase;
  packageName: string;
  period: 'MONTHLY' | 'YEARLY';
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

export interface UpgradeOption {
  id: string;
  name: string;
  description: string | null;
  features: PlanFeatureKey[];
  /** What it would add to what the restaurant has now. */
  adds: PlanFeatureKey[];
  priceMonthly: string | null;
  priceYearly: string | null;
  /** An offer that is on today. */
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
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
  features: { key: PlanFeatureKey; included: boolean }[];
  subscription: PlanSubscription | null;
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
