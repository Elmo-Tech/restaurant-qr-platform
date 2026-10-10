'use client';

import type { ReactNode } from 'react';
import { Badge } from '../../../../../components/ui/Badge';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { TableOrderingState } from '../../../../../lib/table-sessions/types';

/**
 * Presentation helpers shared by the board card, the session drawer, the
 * session history view and the order summary dialog. Everything here only
 * DISPLAYS values the Backend already derived (availability, order totals);
 * nothing is recalculated in the browser.
 */

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

export function OrderingBadge({ state }: { state: TableOrderingState }) {
  const { t } = useStaffI18n();
  const tone: BadgeTone =
    state === 'AVAILABLE' ? 'success' : state === 'CLOSED_BY_STAFF' ? 'destructive' : 'neutral';
  return (
    <Badge variant={tone} dot>
      {t(`sessions.availability.${state}` as const)}
    </Badge>
  );
}

export function LifecycleBadge({ status }: { status: 'OPEN' | 'CLOSED' }) {
  const { t } = useStaffI18n();
  return (
    <Badge variant={status === 'OPEN' ? 'info' : 'neutral'} dot>
      {t(`sessions.status.${status}` as const)}
    </Badge>
  );
}

/** A money string with its currency, direction-isolated so Arabic text can never reorder the digits. */
export function Money({
  amount,
  currency,
  className,
}: {
  amount: string;
  currency: string;
  className?: string;
}): ReactNode {
  return (
    <bdi dir="ltr" className={`whitespace-nowrap ${className ?? ''}`}>
      {amount} {currency}
    </bdi>
  );
}

/**
 * Formats whole minutes as a localized, plural-aware duration. English stays compact
 * ("45 min", "2 h 5 min", "1 d 3 h"); Arabic uses full words with the proper dual and
 * plural forms ("دقيقتان"، "ساعتان و5 دقائق"). Render the result with `dir="auto"`, never
 * forced LTR, so Arabic keeps its natural reading order.
 */
export function useDurationLabel(): (minutes: number) => string {
  const { t, tp } = useStaffI18n();
  return (minutes: number) => {
    if (minutes < 60) {
      return tp('sessions.duration.minutes', minutes);
    }
    if (minutes < 60 * 24) {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest === 0
        ? tp('sessions.duration.hours', hours)
        : t('sessions.duration.join', {
            first: tp('sessions.duration.hours', hours),
            second: tp('sessions.duration.minutes', rest),
          });
    }
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    return hours === 0
      ? tp('sessions.duration.days', days)
      : t('sessions.duration.join', {
          first: tp('sessions.duration.days', days),
          second: tp('sessions.duration.hours', hours),
        });
  };
}
