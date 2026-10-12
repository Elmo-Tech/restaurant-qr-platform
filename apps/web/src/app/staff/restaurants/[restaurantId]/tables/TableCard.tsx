'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { ActionMenu, type ActionMenuItem } from '../../../../../components/ui/ActionMenu';
import { IconQr } from '../../../../../components/staff/icons';
import { TableGlyph } from '../../../../../components/staff/TableGlyph';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { TableRow } from '../../../../../lib/tables/types';
import type { SessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import type { TableBoardRow } from '../../../../../lib/table-sessions/types';
import { minutesBetween } from '../../../../../lib/table-sessions/use-now';
import { cn } from '../../../../../lib/utils';
import { Money, OrderingBadge, useDurationLabel } from './SessionBadges';
import type { SessionDrawerIntent } from './SessionDrawer';

/**
 * The one operational state a table card shows. It is derived ONLY from data
 * the Backend already returned (the table's own status and the board row);
 * nothing is recalculated. `null` means the sessions board is not available to
 * this member (or still loading), so the card shows configuration only.
 *
 *  - `pending`   an open session with at least one order awaiting acceptance
 *  - `occupied`  an open session, nothing awaiting acceptance
 *  - `closed`    no open session and ordering closed by staff (must be opened manually)
 *  - `available` no open session, guests can order (the first order opens one)
 *  - `inactive`  the table (or its ordering) is unavailable
 */
export type TableViewState = 'pending' | 'occupied' | 'closed' | 'available' | 'inactive';

export function tableViewState(table: TableRow, board: TableBoardRow | null): TableViewState | null {
  if (!board) return null;
  if (table.status !== 'ACTIVE' || board.ordering === 'UNAVAILABLE') return 'inactive';
  if (board.openSession) {
    return board.openSession.pendingOrderCount > 0 ? 'pending' : 'occupied';
  }
  return board.ordering === 'CLOSED_BY_STAFF' ? 'closed' : 'available';
}

const TONE: Record<TableViewState | 'plain', { accent: string; medallion: string }> = {
  pending: { accent: 'border-s-warning', medallion: 'bg-warning-soft text-warning' },
  occupied: { accent: 'border-s-info', medallion: 'bg-info-soft text-info' },
  closed: { accent: 'border-s-destructive', medallion: 'bg-destructive-soft text-destructive' },
  available: { accent: 'border-s-success', medallion: 'bg-success-soft text-success' },
  inactive: { accent: 'border-s-muted-foreground/40', medallion: 'bg-muted text-muted-foreground' },
  plain: { accent: 'border-s-primary', medallion: 'bg-accent text-accent-foreground' },
};

export interface TableCardProps {
  table: TableRow;
  /** `loading`: not asked yet; `error`: the lookup failed; `known`: `table.qr` is the answer (null = none). */
  qrState: 'loading' | 'error' | 'known';
  /** Asks the workspace for this table's QR status once the card is on screen. */
  onNeedQr: (tableId: string) => void;
  canManage: boolean;
  /** Sessions board row for this table (null when sessions are not viewable or still loading). */
  board: TableBoardRow | null;
  sessionCaps: SessionCapabilities;
  /** Shared minute clock owned by the workspace, so 50 cards do not run 50 timers. */
  now: number;
  onEdit: () => void;
  onViewQr: () => void;
  onOpenSession: () => void;
  onViewSession: (sessionId: string, intent?: SessionDrawerIntent) => void;
  onViewHistory: () => void;
}

/**
 * A compact, scannable table card. Top to bottom:
 *  1. identity -- the table illustration, the number and the ordering
 *     availability (the two things staff look for), plus a quiet QR indicator
 *     (configuration, deliberately neutral so it never competes with state);
 *  2. the live session -- accepted total, order count, age, and orders awaiting
 *     acceptance in their own warning colour so they can never be mistaken for
 *     billed ones;
 *  3. one primary action, with everything else in an accessible menu.
 * Every action and permission check that existed before is still here.
 */
export function TableCard({
  table,
  qrState,
  onNeedQr,
  canManage,
  board,
  sessionCaps,
  now,
  onEdit,
  onViewQr,
  onOpenSession,
  onViewSession,
  onViewHistory,
}: TableCardProps) {
  const { t, tp } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const qrKnown = qrState === 'known';
  const hasActiveQr = qrKnown && table.qr !== null && table.qr.status === 'ACTIVE';
  // While the status is not known the QR action stays available (it looks it up on click).
  const qrMayExist = hasActiveQr || !qrKnown;
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (qrState !== 'loading') return;
    const element = articleRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      onNeedQr(table.id);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onNeedQr(table.id);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [qrState, table.id, onNeedQr]);
  const open = board?.openSession ?? null;
  const state = tableViewState(table, board);
  const tone = TONE[state ?? 'plain'];
  const title = t('tables.card.title', { number: table.tableNumber });
  const qrLabel =
    qrState === 'loading'
      ? t('tables.card.qrChecking')
      : qrState === 'error'
        ? t('tables.card.qrUnavailable')
        : hasActiveQr
          ? t('tables.card.activeQr')
          : t('tables.card.noActiveQr');

  // ---- frequent actions, always visible ----------------------------------------
  // Enabling / disabling table ordering IS opening / closing the session: the
  // ordering lock follows the session (TABLE_SESSION_SPEC amendment v3), so the
  // two staff actions are the same buttons. Closing keeps its KEEP / REJECT
  // dialog (it runs through the drawer's existing close flow).
  const canViewSession = board !== null && open !== null;
  const canCloseSession = canViewSession && sessionCaps.canClose;
  const canOpenSession =
    board !== null && open === null && board.ordering !== 'UNAVAILABLE' && sessionCaps.canOpen;

  // ---- less frequent actions, in the menu (same conditions as before) --------
  const items: ActionMenuItem[] = [];
  if (board && open) {
    items.push({
      key: 'summary',
      label: t('sessions.action.summary'),
      onSelect: () => onViewSession(open.id, 'summary'),
    });
  }
  if (board) {
    items.push({
      key: 'history',
      label: t('sessions.action.history'),
      onSelect: onViewHistory,
    });
  }
  // While the QR status is not known yet the action stays available (it looks it up on click).
  if (qrMayExist) {
    items.push({ key: 'qr', label: t('tables.card.viewQr'), onSelect: onViewQr });
  }
  if (canManage) {
    items.push({
      key: 'edit',
      label: t('tables.edit'),
      onSelect: onEdit,
    });
  }

  return (
    <article
      ref={articleRef}
      aria-label={title}
      className={cn(
        'flex flex-col rounded-xl border border-s-4 border-border bg-card shadow-sm transition-shadow hover:shadow-md',
        tone.accent,
        state === 'inactive' && 'bg-muted/30',
      )}
    >
      {/* identity */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl',
            tone.medallion,
          )}
        >
          <TableGlyph className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              dir="auto"
              className="min-w-0 truncate text-start text-lg font-semibold leading-tight text-foreground"
            >
              {title}
            </h3>
            <span
              role="img"
              aria-label={qrLabel}
              title={qrLabel}
              className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                !qrKnown
                  ? cn('bg-muted text-muted-foreground/60', qrState === 'loading' && 'animate-pulse')
                  : hasActiveQr
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-warning-soft text-warning',
              )}
            >
              <IconQr className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {board ? (
              <OrderingBadge state={board.ordering} />
            ) : table.status !== 'ACTIVE' ? (
              <Badge variant="neutral" dot>
                {t('common.inactive')}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {/* live session */}
      {board ? (
        open ? (
          <div className="mx-4 mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-info">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-info" />
                {t('sessions.status.OPEN')}
              </span>
              <span className="text-muted-foreground">
                <span className="sr-only">{t('sessions.detail.duration')}: </span>
                <bdi dir="auto">{durationLabel(minutesBetween(open.openedAt, now))}</bdi>
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  {t('sessions.card.acceptedTotal')}
                </p>
                <p className="truncate text-xl font-bold leading-tight text-foreground">
                  <Money amount={open.totals.acceptedTotal} currency={open.currencyCode} />
                </p>
              </div>
              <p className="flex-shrink-0 pb-0.5 text-xs font-medium text-foreground">
                {tp('sessions.card.orders', open.orderCount)}
              </p>
            </div>
            {open.pendingOrderCount > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                {tp('sessions.card.pending', open.pendingOrderCount)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mx-4 mb-4 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            {board.ordering === 'CLOSED_BY_STAFF'
              ? t('sessions.availabilityHint.CLOSED_BY_STAFF')
              : t('sessions.noOpenSession')}
          </p>
        )
      ) : null}

      {/* actions: the frequent ones are buttons, the rest live in the menu */}
      <div className="mt-auto flex items-center gap-2 border-t border-border p-3">
        {open && canViewSession ? (
          <>
            <Button className="min-w-0 flex-1 px-2" onClick={() => onViewSession(open.id)}>
              <span className="truncate">{t('sessions.action.view')}</span>
            </Button>
            {canCloseSession ? (
              <Button
                variant="secondary"
                className="min-w-0 flex-1 px-2"
                title={t('tables.card.closeHint')}
                onClick={() => onViewSession(open.id, 'close')}
              >
                <span className="truncate">{t('sessions.action.close')}</span>
              </Button>
            ) : null}
          </>
        ) : canOpenSession ? (
          <Button
            className="min-w-0 flex-1 px-2"
            title={t('tables.card.openHint')}
            onClick={onOpenSession}
          >
            <span className="truncate">{t('sessions.action.open')}</span>
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        <ActionMenu label={t('tables.card.moreAria', { number: table.tableNumber })} items={items} />
      </div>
    </article>
  );
}
