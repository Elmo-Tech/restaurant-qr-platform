'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import { minutesBetween } from '../../../../../lib/table-sessions/use-now';
import type { TableBoardRow } from '../../../../../lib/table-sessions/types';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { IconTable } from '../../../../../components/staff/icons';
import { Money, useDurationLabel } from '../tables/SessionBadges';

const MAX_TABLES = 6;

/** Pending orders first, then the longest-open session. */
export function sortActiveRows(rows: TableBoardRow[]): TableBoardRow[] {
  return rows
    .filter((row) => row.openSession !== null)
    .sort((a, b) => {
      const sa = a.openSession!;
      const sb = b.openSession!;
      const pendingDelta = (sb.pendingOrderCount > 0 ? 1 : 0) - (sa.pendingOrderCount > 0 ? 1 : 0);
      if (pendingDelta !== 0) return pendingDelta;
      return new Date(sa.openedAt).getTime() - new Date(sb.openedAt).getTime();
    });
}

/**
 * The tables with a live session right now, most urgent first, as rows that
 * read like the Latest orders list beside them: a table with an order waiting
 * for acceptance is amber, an open session is blue. Each row opens that
 * session directly in the Tables workspace. Money is shown only to roles that
 * handle the bill.
 */
export function LiveTables({
  rows,
  loading,
  now,
  tablesHref,
  showMoney,
  branches,
}: {
  /** Active rows from `sortActiveRows`. */
  rows: TableBoardRow[];
  loading: boolean;
  now: number;
  tablesHref: string;
  showMoney: boolean;
  branches: AuthContextBranch[];
}) {
  const { t, tp, locale } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const showBranch = branches.length > 1;
  const visible = rows.slice(0, MAX_TABLES);

  return (
    <section aria-labelledby="ops-tables-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ops-tables-title" className="text-base font-semibold text-foreground">
          {t('ops.tables.title')}
          {rows.length > 0 ? (
            <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {rows.length}
            </span>
          ) : null}
        </h2>
        <Link
          href={tablesHref}
          className="rounded-md px-2 py-1 text-sm font-semibold text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('ops.tables.viewAll')}
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="h-[60px] animate-pulse rounded-xl border border-border bg-muted/50" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon={<IconTable />}
          title={t('ops.tables.empty')}
          description={t('ops.tables.emptyHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => {
            const session = row.openSession!;
            const pending = session.pendingOrderCount > 0;
            const branch = branches.find((candidate) => candidate.id === row.branch.id);
            return (
              <li key={session.id}>
                <Link
                  href={`${tablesHref}?session=${encodeURIComponent(session.id)}`}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-4 py-3 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    pending
                      ? 'border-warning/50 bg-warning-soft/40 hover:border-warning'
                      : 'border-border bg-card hover:border-primary'
                  }`}
                >
                  <span className="min-w-0 flex-1 basis-32">
                    <span className="block truncate text-base font-bold text-foreground" dir="auto">
                      {t('orders.card.table', { number: row.table.tableNumber })}
                    </span>
                    {showBranch ? (
                      <span className="block truncate text-sm text-muted-foreground">
                        {branch ? localizedName(branch, locale) : row.branch.name}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      pending ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${pending ? 'bg-warning' : 'bg-info'}`}
                    />
                    {pending
                      ? tp('sessions.card.pending', session.pendingOrderCount)
                      : t('sessions.status.OPEN')}
                  </span>
                  <span className="flex-shrink-0 text-sm text-muted-foreground" dir="auto">
                    {durationLabel(minutesBetween(session.openedAt, now))}
                    <span aria-hidden="true"> · </span>
                    {tp('sessions.card.orders', session.orderCount)}
                  </span>
                  {showMoney && session.orderCount > 0 ? (
                    <span className="flex-shrink-0 text-end text-sm font-bold text-foreground">
                      <Money amount={session.totals.acceptedTotal} currency={session.currencyCode} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
