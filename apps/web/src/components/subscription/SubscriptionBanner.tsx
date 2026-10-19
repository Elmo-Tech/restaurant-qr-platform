'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { ENDING_SOON_DAYS, getMySubscription, type PlanSubscription } from '../../lib/subscription/api';
import { Alert } from '../ui/Alert';

/**
 * A heads-up on the dashboard (DEC-050): the subscription ends in a week or less, or it has ended and the
 * service is about to pause. Silent in every other case, and silent if the subscription cannot be read
 * (the dashboard must never break because of it).
 */
export function SubscriptionBanner({ restaurantId }: { restaurantId: string }) {
  const { t } = useStaffI18n();
  const [subscription, setSubscription] = useState<PlanSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySubscription(restaurantId)
      .then((loaded) => {
        if (!cancelled) setSubscription(loaded.subscription);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (!subscription) return null;
  const ending = subscription.phase === 'ACTIVE' && subscription.daysLeft <= ENDING_SOON_DAYS;
  const inGrace = subscription.phase === 'GRACE';
  if (!ending && !inGrace) return null;

  const text = inGrace
    ? t('subscription.banner.grace', { count: subscription.graceDaysLeft })
    : subscription.daysLeft <= 1
      ? t('subscription.banner.endingToday')
      : t('subscription.banner.ending', { count: subscription.daysLeft });

  return (
    <Alert variant="warning" className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <span className="font-medium">{text}</span>
      <Link
        href={`/staff/restaurants/${restaurantId}/subscription`}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {t('subscription.banner.action')}
      </Link>
    </Alert>
  );
}
