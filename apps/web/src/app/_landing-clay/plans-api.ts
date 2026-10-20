import { SERVER_API_BASE_URL } from '../../lib/api/config';
import type { PlanFeature } from './copy';

/** Mirrors `GET /public/landing/plans` (apps/api/src/public/public-landing.service.ts, DEC-053). */
export interface LandingPrice {
  currencyCode: 'EGP' | 'USD';
  period: 'MONTHLY' | 'YEARLY';
  /** After the package offer. */
  amount: string;
  /** Before the offer. */
  listAmount: string;
}

export interface LandingPlan {
  id: string;
  name: string;
  description: string | null;
  features: PlanFeature[];
  designs: { standard: number; premium: number };
  prices: LandingPrice[];
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
}

export interface LandingPlans {
  trialDays: number;
  plans: LandingPlan[];
}

/**
 * The packages and their real prices for the public landing page. Cached for a minute (the team changes
 * prices rarely, and the page must stay fast); `null` when the Backend cannot be reached, so the page
 * renders an honest fallback instead of failing.
 */
export async function getLandingPlans(): Promise<LandingPlans | null> {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/public/landing/plans`, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    const body = (await response.json()) as { data: LandingPlans };
    return body.data;
  } catch {
    return null;
  }
}
