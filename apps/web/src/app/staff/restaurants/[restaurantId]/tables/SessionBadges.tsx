'use client';

import type { ReactNode } from 'react';
import { Badge } from '../../../../../components/ui/Badge';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type {
  SessionPaymentStatus,
  TableOrderingState,
} from '../../../../../lib/table-sessions/types';

/**
 * Presentation helpers shared by the board card, the session drawer, the unpaid
 * bills view and the bill dialog. Everything here only DISPLAYS values the
 * Backend already derived (payment status, balances, availability); nothing is
 * recalculated in the browser.
 */

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

export function paymentTone(status: SessionPaymentStatus): BadgeTone {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'UNPAID':
    case 'PARTIALLY_PAID':
      return 'warning';
    case 'OVERPAID':
      return 'destructive';
    case 'NO_CHARGE':
      return 'neutral';
  }
}

export function PaymentStatusBadge({ status }: { status: SessionPaymentStatus }) {
  const { t } = useStaffI18n();
  return (
    <Badge variant={paymentTone(status)} dot>
      {t(`sessions.payment.${status}` as const)}
    </Badge>
  );
}

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

/** Formats whole minutes as a short, localized duration ("45 min", "2 h 5 min", "1 d 3 h"). */
export function useDurationLabel(): (minutes: number) => string {
  const { t } = useStaffI18n();
  return (minutes: number) => {
    if (minutes < 60) {
      return t('sessions.duration.minutes', { minutes });
    }
    if (minutes < 60 * 24) {
      return t('sessions.duration.hoursMinutes', {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60,
      });
    }
    return t('sessions.duration.daysHours', {
      days: Math.floor(minutes / (60 * 24)),
      hours: Math.floor((minutes % (60 * 24)) / 60),
    });
  };
}
