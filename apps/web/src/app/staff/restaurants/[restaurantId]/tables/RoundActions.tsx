'use client';

import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { OrderStatus } from '../../../../../lib/orders/types';
import {
  getAvailableTransitions,
  isDestructiveTransition,
  TRANSITION_LABEL_KEYS,
} from '../../../../../lib/orders/transitions';
import type { SessionRound } from '../../../../../lib/table-sessions/types';

/**
 * The order actions for one round of a session, using the SAME lifecycle
 * rules and wording as the Orders page: only the next valid statuses the
 * member's permissions allow are offered (Accept / Reject, Start preparing /
 * Cancel, Mark ready, Mark served), the forward step is the dominant button
 * and Reject / Cancel sit apart from it. Nothing here decides a transition:
 * the Backend validates every request.
 */
export function RoundActions({
  round,
  permissions,
  busy,
  disabled,
  error,
  onTransition,
}: {
  round: SessionRound;
  permissions: string[];
  /** This order's own request is in flight. */
  busy: boolean;
  /** Some order in the panel is being changed: no second request until it settles. */
  disabled: boolean;
  error: string | null;
  onTransition: (to: OrderStatus) => void;
}) {
  const { t } = useStaffI18n();
  const options = getAvailableTransitions(round.order.status, permissions, round.order.type);
  const forward = options.filter((option) => !isDestructiveTransition(option.to));
  const destructive = options.filter((option) => isDestructiveTransition(option.to));

  if (options.length === 0 && !error) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {options.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {forward.map((option) => (
            <Button
              key={option.to}
              disabled={disabled}
              aria-busy={busy}
              onClick={() => onTransition(option.to)}
            >
              {t(TRANSITION_LABEL_KEYS[option.to])}
            </Button>
          ))}
          {destructive.map((option) => (
            <Button
              key={option.to}
              variant="secondary"
              className="text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => onTransition(option.to)}
            >
              {t(TRANSITION_LABEL_KEYS[option.to])}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
