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
import { LifecycleBadge, Money, PaymentStatusBadge } from './SessionBadges';

/**
 * CLOSED sessions that still owe money, kept visible after closure (design v3,
 * section 8). The list comes from the Backend's exact payment filter, so it is
 * never silently truncated. Settling happens in the session panel, without
 * reopening anything; these balances are never merged into a new session.
 */
export function UnpaidBillsPanel({
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
  const [branchChoice, setBranchChoice] = useState<string>(initialBranchId ?? 'all');
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
        status: 'CLOSED',
        payment: 'OUTSTANDING',
        branchId: branchChoice === 'all' ? undefined : branchChoice,
        tableId: tableFilterId,
        limit: 200,
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
  }, [restaurantId, branchChoice, tableFilterId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load, refreshKey]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="unpaid-title">
      <div>
        <h2 id="unpaid-title" className="text-base font-semibold text-foreground">
          {t('sessions.unpaid.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('sessions.unpaid.hint')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {branches.length > 1 ? (
          <div className="min-w-[200px] max-w-xs">
            <FormField label={t('tables.branch')} htmlFor="unpaid-branch">
              <Select
                id="unpaid-branch"
                value={branchChoice}
                onChange={(event) => {
                  setRows(null);
                  setBranchChoice(event.target.value);
                }}
              >
                <option value="all">{t('sessions.unpaid.allBranches')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        ) : null}
        {tableFilter ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {t('sessions.unpaid.filteredTable', { number: tableFilter.tableNumber })}
            </span>
            <Button variant="ghost" size="sm" onClick={onClearTableFilter}>
              {t('sessions.unpaid.clearFilter')}
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

      {rows === null && !error ? <LoadingState label={t('sessions.unpaid.loading')} /> : null}

      {rows !== null && rows.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          {t('sessions.unpaid.empty')}
        </Card>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t('sessions.unpaid.table', { number: row.table.tableNumber })}
                    {branches.length > 1 ? (
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        <bdi dir="auto">{row.branch.name}</bdi>
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.closedAt
                      ? t('sessions.unpaid.closedAt', { time: formatDateTime(row.closedAt) })
                      : null}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <LifecycleBadge status={row.status} />
                    <PaymentStatusBadge status={row.bill.paymentStatus} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground">{t('sessions.bill.balance')}</p>
                    <p className="text-lg font-semibold text-foreground">
                      <Money amount={row.bill.balance} currency={row.currencyCode} />
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => onOpenSession(row.id)}>
                    {t('sessions.action.view')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
