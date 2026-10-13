'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import { formatElapsedAge } from '../../../../../lib/orders/order-views';

/** "Just now", "14 min", "1h 08m": a live duration since an ISO instant, in the Staff language. */
export function useAgeLabel(now: number): (isoDate: string) => string {
  const { t } = useStaffI18n();
  return (isoDate: string) =>
    formatElapsedAge(
      isoDate,
      {
        t,
        tMinutes: (count) => t('orders.time.minutes', { count }),
        tHoursMinutes: (hours, minutes) =>
          t('orders.time.hoursMinutes', { hours, minutes: String(minutes).padStart(2, '0') }),
      },
      new Date(now),
    );
}
