'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { FormField } from '../../../../../components/ui/FormField';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { Select } from '../../../../../components/ui/Select';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import type { SessionListItem } from '../../../../../lib/table-sessions/types';
import { minutesBetween, useNow } from '../../../../../lib/table-sessions/use-now';
import { LifecycleBadge, Money, useDurationLabel } from './SessionBadges';

type StatusChoice = 'all' | 'OPEN' | 'CLOSED';

/**
 * Past and current sessions, newest first, so a closed session stays reachable
 * after a new one is opened. Each row is one independent session with its own
 * orders and order total; nothing is ever merged across sessions. The list is
 * the Backend's own session list (Tenant- and Branch-scoped there); this panel
 * only filters by Branch, status and table.
 */
export function SessionHistoryPanel({
  restaurantId,
  branches,
  initialBranchId,
  tableFilter,
  refreshKey,
  onClearTableFilter,
  onOpenSession,
}: {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  initialBranchId: string | null;
  tableFilter: { id: string; tableNumber: string } | null;
  /** Bumped by the parent whenever a session changed. */
  refreshKey: number;
  onClearTableFilter: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { t, formatDateTime } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const now = useNow();
  const [branchChoice, setBranchChoice] = useState<string>(initialBranchId ?? 'all');
  const [statusChoice, setStatusChoice] = useState<StatusChoice>('all');
  const [rows, setRows] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  // A primitive so the memoized loader depends on exactly what it reads.
  const tableFilterId = tableFilter?.id;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setError(null);
    try {
      const list = await sessionsApi.listSessions(restaurantId, {
        status: statusChoice === 'all' ? undefined : statusChoice,
        branchId: branchChoice === 'all' ? undefined : branchChoice,
        tableId: tableFilterId,
        limit: 100,
      });
      if (requestRef.current !== requestId) return;
      setRows(list);
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    }
  }, [restaurantId, branchChoice, statusChoice, tableFilterId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load, refreshKey]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="session-history-panel-title">
      <div>
        <h2 id="session-history-panel-title" className="text-base font-semibold text-foreground">
          {t('sessions.past.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('sessions.past.hint')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {branches.length > 1 ? (
          <div className="min-w-[200px] max-w-xs">
            <FormField label={t('tables.branch')} htmlFor="past-branch">
              <Select
                id="past-branch"
                value={branchChoice}
                onChange={(event) => {
                  setRows(null);
                  setBranchChoice(event.target.value);
                }}
              >
                <option value="all">{t('sessions.past.allBranches')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        ) : null}
        <div className="min-w-[160px] max-w-xs">
          <FormField label={t('sessions.past.status')} htmlFor="past-status">
            <Select
              id="past-status"
              value={statusChoice}
              onChange={(event) => {
                setRows(null);
                setStatusChoice(event.target.value as StatusChoice);
              }}
            >
              <option value="all">{t('sessions.past.statusAll')}</option>
              <option value="OPEN">{t('sessions.status.OPEN')}</option>
              <option value="CLOSED">{t('sessions.status.CLOSED')}</option>
            </Select>
          </FormField>
        </div>
        {tableFilter ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {t('sessions.past.filteredTable', { number: tableFilter.tableNumber })}
            </span>
            <Button variant="ghost" size="sm" onClick={onClearTableFilter}>
              {t('sessions.past.clearFilter')}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {rows === null && !error ? <LoadingState label={t('sessions.past.loading')} /> : null}

      {rows !== null && rows.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          {t('sessions.past.empty')}
        </Card>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const endMs = row.closedAt ? new Date(row.closedAt).getTime() : now;
            return (
              <li key={row.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {t('sessions.past.table', { number: row.table.tableNumber })}
                      {branches.length > 1 ? (
                        <span className="ms-2 text-xs font-normal text-muted-foreground">
                          <bdi dir="auto">{row.branch.name}</bdi>
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('sessions.past.opened', { time: formatDateTime(row.openedAt) })}
                      {row.closedAt
                        ? ` · ${t('sessions.past.closedAt', { time: formatDateTime(row.closedAt) })}`
                        : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <LifecycleBadge status={row.status} />
                      <span className="text-xs text-muted-foreground">
                        <bdi dir="auto">{durationLabel(minutesBetween(row.openedAt, endMs))}</bdi>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-end">
                      <p className="text-xs text-muted-foreground">{t('sessions.summary.accepted')}</p>
                      <p className="text-lg font-semibold text-foreground">
                        <Money amount={row.totals.acceptedTotal} currency={row.currencyCode} />
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => onOpenSession(row.id)}>
                      {t('sessions.action.view')}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
