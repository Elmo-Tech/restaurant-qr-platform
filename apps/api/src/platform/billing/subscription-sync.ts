import { addDays } from './subscription-dates';

/**
 * What a Restaurant's own record should change to match its subscriptions today (DEC-049). Pure: the
 * service applies the result. A Restaurant that never had a subscription is never touched; a
 * Restaurant is suspended only after its last subscription ended AND the grace period passed; only a
 * Restaurant that the platform itself suspended (the mark) is reactivated automatically.
 */
export interface SyncRestaurant {
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  packageId: string | null;
  /** Set when the platform suspended it because the subscription ended. */
  subscriptionSuspendedAt: Date | null;
  /** When the team reactivated it by hand: a lapse whose suspension date is not after this is left alone. */
  subscriptionOverrideAt: Date | null;
}

export interface SyncSubscription {
  status: 'ACTIVE' | 'CANCELLED';
  kind: 'PAID' | 'TRIAL';
  packageId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SyncDecision {
  /** The Package the Restaurant should be on now. */
  setPackageId?: string;
  suspend?: boolean;
  reactivate?: boolean;
}

export function decideSync(input: {
  today: Date;
  graceDays: number;
  restaurant: SyncRestaurant;
  subscriptions: readonly SyncSubscription[];
}): SyncDecision {
  const { today, graceDays, restaurant } = input;
  const live = input.subscriptions.filter((sub) => sub.status === 'ACTIVE');
  const decision: SyncDecision = {};
  if (live.length === 0) return decision;

  const current = live.find(
    (sub) =>
      sub.startsAt.getTime() <= today.getTime() &&
      today.getTime() < sub.endsAt.getTime(),
  );

  if (current) {
    if (restaurant.packageId !== current.packageId) {
      decision.setPackageId = current.packageId;
    }
    if (
      restaurant.status === 'SUSPENDED' &&
      restaurant.subscriptionSuspendedAt !== null
    ) {
      decision.reactivate = true;
    }
    return decision;
  }

  const ended = live.filter((sub) => sub.endsAt.getTime() <= today.getTime());
  if (ended.length === 0) return decision; // only future subscriptions so far

  const suspensionDates = ended.map((sub) =>
    addDays(sub.endsAt, sub.kind === 'TRIAL' ? 0 : graceDays),
  );
  const suspendOn = suspensionDates.reduce((latest, date) =>
    date.getTime() > latest.getTime() ? date : latest,
  );
  const overridden =
    restaurant.subscriptionOverrideAt !== null &&
    restaurant.subscriptionOverrideAt.getTime() >= suspendOn.getTime();
  if (
    restaurant.status === 'ACTIVE' &&
    today.getTime() >= suspendOn.getTime() &&
    !overridden
  ) {
    decision.suspend = true;
  }
  return decision;
}
