'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as tablesApi from '../../../../../lib/tables/api';
import type { TableRow } from '../../../../../lib/tables/types';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { IconPencil, IconPlus, IconQr } from '../../../../../components/staff/icons';
import { GenericQrCard } from './GenericQrCard';
import { QrPreviewDialog } from './QrPreviewDialog';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import type { SessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import type { TableBoardRow } from '../../../../../lib/table-sessions/types';
import { minutesBetween, useNow } from '../../../../../lib/table-sessions/use-now';
import { OpenSessionDialog } from './SessionActionDialogs';
import {
  LifecycleBadge,
  Money,
  OrderingBadge,
  PaymentStatusBadge,
  useDurationLabel,
} from './SessionBadges';
import { SessionDrawer } from './SessionDrawer';
import { UnpaidBillsPanel } from './UnpaidBillsPanel';

export interface TablesWorkspaceProps {
  restaurantId: string;
  restaurantName: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me` (Section 5) -- never re-fetched or narrowed again here. */
  branches: AuthContextBranch[];
  /** `tables.manage`, Branch-scoped (Section 5/6) -- Table management is authorized per-assigned-Branch on the Backend, unlike Menu's Restaurant-wide `allBranches` requirement. */
  canManage: boolean;
  /** FT-9: `tables.manage` AND full Restaurant branch scope -- the Restaurant-wide Generic QR is not Branch-scoped. */
  canManageGenericQr: boolean;
  webOrigin: string;
  /** Table Sessions: UX-only capabilities derived from the Membership permissions (the Backend enforces). */
  sessionCaps: SessionCapabilities;
}

interface TableFormState {
  tableNumber: string;
}

const EMPTY_FORM: TableFormState = { tableNumber: '' };

/**
 * FT-4: the Staff Tables & QR workspace. Owns Branch selection and Table
 * list state; the Create/Edit dialog and the QR panel are the only two
 * pieces of transient UI state. `branches` arrives as a prop already
 * resolved server-side (Section 5) -- there is no Branch List fetch here.
 *
 * Each Table's QR status is enriched client-side via `getTableDetail`
 * (Section 17's documented tradeoff: `listTables` deliberately performs no
 * QR query at all -- a settled, tested Backend contract -- so this reuses
 * the existing per-Table Detail read instead of changing that contract).
 * `tablesRequestRef` guards against a stale response landing after the
 * Staff member has already switched Branch again.
 */
export function TablesWorkspace({
  restaurantId,
  restaurantName,
  branches,
  canManage,
  canManageGenericQr,
  webOrigin,
  sessionCaps,
}: TablesWorkspaceProps) {
  const { t } = useStaffI18n();
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    branches[0]?.id ?? null,
  );
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);

  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TableFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [qrTarget, setQrTarget] = useState<TableRow | null>(null);

  // Table Sessions: ONE workspace. The board (availability, live session, old unpaid bills)
  // is read from the Backend per Branch; sessions are viewed in a panel, never on a second
  // disconnected screen.
  const [view, setView] = useState<'tables' | 'unpaid'>('tables');
  const [board, setBoard] = useState<TableBoardRow[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [drawerSessionId, setDrawerSessionId] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<TableRow | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [unpaidTable, setUnpaidTable] = useState<{ id: string; tableNumber: string } | null>(null);
  const [unpaidRefreshKey, setUnpaidRefreshKey] = useState(0);
  const boardRequestRef = useRef(0);

  const tablesRequestRef = useRef(0);
  const tableNumberRef = useRef<HTMLInputElement>(null);

  const loadTables = useCallback(
    async (branchId: string) => {
      const requestId = ++tablesRequestRef.current;
      setTables(null);
      setTablesError(null);
      try {
        const list = await tablesApi.listTables(restaurantId, branchId);
        const enriched = await Promise.all(
          list.map(async (row) => {
            try {
              const detail = await tablesApi.getTableDetail(restaurantId, branchId, row.id);
              return { ...row, qr: detail.qr };
            } catch {
              // A per-row QR lookup failing must never blank out the whole
              // list -- the row still renders, just without a known QR
              // status (treated as "no active QR" until a retry succeeds).
              return { ...row, qr: null };
            }
          }),
        );
        if (tablesRequestRef.current !== requestId) return;
        setTables(enriched);
      } catch (error) {
        if (tablesRequestRef.current !== requestId) return;
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setTablesError(describeError(error));
      }
    },
    [restaurantId],
  );

  const loadBoard = useCallback(
    async (branchId: string, options: { silent?: boolean } = {}) => {
      if (!sessionCaps.canView) return;
      const requestId = ++boardRequestRef.current;
      if (!options.silent) {
        setBoard(null);
      }
      setBoardError(null);
      try {
        const rows = await sessionsApi.getBoard(restaurantId, branchId);
        if (boardRequestRef.current !== requestId) return;
        setBoard(rows);
      } catch (error) {
        if (boardRequestRef.current !== requestId) return;
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setBoardError(describeError(error));
      }
    },
    [restaurantId, sessionCaps.canView],
  );

  useEffect(() => {
    // `queueMicrotask` here is purely to satisfy eslint-plugin-react-hooks'
    // `set-state-in-effect` rule (same established pattern as
    // `MenuWorkspace`'s own mount/selection effects) -- it has nothing to
    // do with the fetch itself, which still starts essentially immediately.
    if (selectedBranchId) {
      queueMicrotask(() => {
        void loadTables(selectedBranchId);
        void loadBoard(selectedBranchId);
      });
    }
  }, [selectedBranchId, loadTables, loadBoard]);

  // A live floor: refresh the board quietly every 30 s while the page is visible.
  useEffect(() => {
    if (!sessionCaps.canView || !selectedBranchId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadBoard(selectedBranchId, { silent: true });
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [sessionCaps.canView, selectedBranchId, loadBoard]);

  function handleSessionChanged() {
    if (selectedBranchId) {
      void loadBoard(selectedBranchId, { silent: true });
    }
    setUnpaidRefreshKey((key) => key + 1);
  }

  async function handleOpenSession() {
    if (!openTarget || isOpening) return;
    setIsOpening(true);
    setOpenError(null);
    try {
      const opened = await sessionsApi.openSession(restaurantId, openTarget.id);
      setOpenTarget(null);
      handleSessionChanged();
      setDrawerSessionId(opened.id);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setOpenError(describeError(error));
      // e.g. someone else just opened it: show the real state.
      handleSessionChanged();
    } finally {
      setIsOpening(false);
    }
  }

  const boardByTable = new Map((board ?? []).map((row) => [row.table.id, row]));
  const showTables = view === 'tables';

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(table: TableRow) {
    setMode('edit');
    setEditingId(table.id);
    setForm({ tableNumber: table.tableNumber });
    setFormError(null);
  }

  function cancelForm() {
    setMode('idle');
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !selectedBranchId) return;

    const tableNumber = form.tableNumber.trim();
    if (tableNumber === '') {
      setFormError(t('tables.numberRequired'));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      if (mode === 'create') {
        const created = await tablesApi.createTable(restaurantId, selectedBranchId, {
          tableNumber,
        });
        // Section 8: the new Table's QR is already known from the Create
        // response itself -- inserted immediately, never a full refetch
        // the User has to wait on to see confirmation.
        setTables((prev) => {
          const next = [
            ...(prev ?? []),
            { id: created.table.id, tableNumber: created.table.tableNumber, status: created.table.status, qr: created.qr },
          ];
          next.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber));
          return next;
        });
      } else if (mode === 'edit' && editingId) {
        const updated = await tablesApi.updateTable(restaurantId, selectedBranchId, editingId, {
          tableNumber,
        });
        setTables((prev) =>
          (prev ?? []).map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
        );
      }
      setMode('idle');
      setEditingId(null);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setFormError(describeError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

  const dialog = (
    <Dialog
      open={mode !== 'idle'}
      title={mode === 'create' ? t('tables.new') : t('tables.edit')}
      subtitle={selectedBranch?.name}
      isSubmitting={isSubmitting}
      submitLabel={
        isSubmitting
          ? t('common.saving')
          : mode === 'create'
            ? t('tables.create')
            : t('tables.saveChanges')
      }
      onSubmit={handleSubmit}
      onClose={cancelForm}
      initialFocusRef={tableNumberRef}
    >
      <div className="flex flex-col gap-4">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <FormField label={t('tables.numberLabel')} htmlFor="table-number">
          <Input
            id="table-number"
            ref={tableNumberRef}
            required
            value={form.tableNumber}
            onChange={(event) => setForm({ tableNumber: event.target.value })}
            disabled={isSubmitting}
            placeholder={t('tables.numberPlaceholder')}
            dir="auto"
          />
        </FormField>
      </div>
    </Dialog>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('tables.title')}
        description={t('tables.subtitle')}
        actions={
          canManage && selectedBranchId ? (
            <Button onClick={startCreate}>
              <IconPlus className="me-1.5 h-4 w-4" /> {t('tables.new')}
            </Button>
          ) : undefined
        }
      />

      <GenericQrCard
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        canManage={canManageGenericQr}
        webOrigin={webOrigin}
      />

      {branches.length === 0 ? (
        <Alert variant="error">
          {t('guard.noBranch')}
        </Alert>
      ) : (
        <>
          {branches.length > 1 && showTables ? (
            <div className="max-w-xs">
              <FormField label={t('tables.branch')} htmlFor="branch-select">
                <Select
                  id="branch-select"
                  value={selectedBranchId ?? ''}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          ) : null}

          {sessionCaps.canView ? (
            <div role="group" aria-label={t('tables.title')} className="flex flex-wrap items-center gap-2">
              {(['tables', 'unpaid'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    view === option
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border bg-secondary text-secondary-foreground hover:bg-muted'
                  }`}
                >
                  {t(`sessions.view.${option}` as const)}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectedBranchId && handleSessionChanged()}
              >
                {t('sessions.refresh')}
              </Button>
            </div>
          ) : null}

          {sessionCaps.canView && boardError && showTables ? (
            <Alert variant="error">{boardError}</Alert>
          ) : null}

          {sessionCaps.canView && view === 'unpaid' ? (
            <UnpaidBillsPanel
              restaurantId={restaurantId}
              branches={branches}
              initialBranchId={selectedBranchId}
              tableFilter={unpaidTable}
              refreshKey={unpaidRefreshKey}
              onClearTableFilter={() => setUnpaidTable(null)}
              onOpenSession={setDrawerSessionId}
            />
          ) : null}

          {showTables && tablesError ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{tablesError}</span>
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() => selectedBranchId && void loadTables(selectedBranchId)}
                >
                  {t('common.retry')}
                </Button>
              </div>
            </Alert>
          ) : null}

          {showTables && tables === null && !tablesError ? (
            <LoadingState label={t('tables.loading')} />
          ) : null}

          {showTables && tables !== null && tables.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm font-medium text-foreground">{t('tables.empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('tables.empty.hint')}</p>
              {canManage ? (
                <Button className="mt-2" onClick={startCreate}>
                  <IconPlus className="me-1.5 h-4 w-4" /> {t('tables.new')}
                </Button>
              ) : null}
            </Card>
          ) : null}

          {showTables && tables !== null && tables.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  branchName={selectedBranch?.name ?? null}
                  canManage={canManage}
                  onEdit={() => startEdit(table)}
                  onViewQr={() => setQrTarget(table)}
                  board={sessionCaps.canView ? (boardByTable.get(table.id) ?? null) : null}
                  sessionCaps={sessionCaps}
                  onOpenSession={() => {
                    setOpenError(null);
                    setOpenTarget(table);
                  }}
                  onViewSession={setDrawerSessionId}
                  onViewUnpaid={() => {
                    setUnpaidTable({ id: table.id, tableNumber: table.tableNumber });
                    setView('unpaid');
                  }}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      {dialog}

      {openTarget ? (
        <OpenSessionDialog
          tableNumber={openTarget.tableNumber}
          isSubmitting={isOpening}
          error={openError}
          onConfirm={() => void handleOpenSession()}
          onClose={() => {
            if (!isOpening) setOpenTarget(null);
          }}
        />
      ) : null}

      {drawerSessionId ? (
        <SessionDrawer
          key={drawerSessionId}
          restaurantId={restaurantId}
          sessionId={drawerSessionId}
          caps={sessionCaps}
          onClose={() => setDrawerSessionId(null)}
          onChanged={handleSessionChanged}
        />
      ) : null}

      {qrTarget && qrTarget.qr ? (
        <QrPreviewDialog
          target={{
            restaurantName,
            branchName: selectedBranch?.name ?? null,
            tableNumber: qrTarget.tableNumber,
            publicCode: qrTarget.qr.publicCode,
          }}
          guestUrl={`${webOrigin}/q/${qrTarget.qr.publicCode}`}
          onClose={() => setQrTarget(null)}
        />
      ) : null}
    </div>
  );
}

function TableCard({
  table,
  branchName,
  canManage,
  onEdit,
  onViewQr,
  board,
  sessionCaps,
  onOpenSession,
  onViewSession,
  onViewUnpaid,
}: {
  table: TableRow;
  branchName: string | null;
  canManage: boolean;
  onEdit: () => void;
  onViewQr: () => void;
  /** Table Sessions board row for this table (null when sessions are not viewable or still loading). */
  board: TableBoardRow | null;
  sessionCaps: SessionCapabilities;
  onOpenSession: () => void;
  onViewSession: (sessionId: string) => void;
  onViewUnpaid: () => void;
}) {
  const { t, tp } = useStaffI18n();
  const now = useNow();
  const durationLabel = useDurationLabel();
  const hasActiveQr = table.qr !== null && table.qr.status === 'ACTIVE';
  const open = board?.openSession ?? null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p dir="auto" className="truncate text-start text-base font-semibold text-foreground">
            {t('tables.card.title', { number: table.tableNumber })}
          </p>
          {branchName ? (
            <p dir="auto" className="text-start text-xs text-muted-foreground">
              {branchName}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('tables.card.editAria', { number: table.tableNumber })}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <IconPencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={table.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {table.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
        </Badge>
        <Badge variant={hasActiveQr ? 'primary' : 'neutral'}>
          {hasActiveQr ? t('tables.card.activeQr') : t('tables.card.noActiveQr')}
        </Badge>
      </div>

      {board ? (
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <OrderingBadge state={board.ordering} />
            {open ? (
              <>
                <LifecycleBadge status={open.status} />
                <PaymentStatusBadge status={open.bill.paymentStatus} />
              </>
            ) : null}
          </div>

          {open ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">{t('sessions.card.runningBill')}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  <Money amount={open.bill.eligibleTotal} currency={open.currencyCode} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('sessions.detail.duration')}</dt>
                <dd className="text-sm font-medium text-foreground">
                  <bdi dir="ltr">{durationLabel(minutesBetween(open.openedAt, now))}</bdi>
                </dd>
              </div>
              <div>
                <dt className="sr-only">{t('sessions.detail.rounds')}</dt>
                <dd className="text-foreground">{tp('sessions.card.orders', open.orderCount)}</dd>
              </div>
              {open.pendingOrderCount > 0 ? (
                <div>
                  <dd className="font-medium text-warning">
                    {tp('sessions.card.pending', open.pendingOrderCount)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : board.ordering === 'CLOSED_BY_STAFF' ? (
            <p className="text-xs text-muted-foreground">
              {t('sessions.availabilityHint.CLOSED_BY_STAFF')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('sessions.noOpenSession')}</p>
          )}

          {board.outstanding ? (
            <button
              type="button"
              onClick={onViewUnpaid}
              className="rounded-md bg-warning-soft px-2.5 py-1.5 text-start text-xs font-medium text-warning hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tp('sessions.card.oldUnpaid', board.outstanding.sessionCount, {
                amount: `${board.outstanding.balance} ${board.outstanding.currencyCode}`,
              })}
            </button>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {open ? (
              <Button variant="secondary" size="sm" onClick={() => onViewSession(open.id)}>
                {t('sessions.action.view')}
              </Button>
            ) : null}
            {!open && board.ordering !== 'UNAVAILABLE' && sessionCaps.canOpen ? (
              <Button size="sm" onClick={onOpenSession}>
                {t('sessions.action.open')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasActiveQr ? (
        <Button variant="secondary" className="mt-1 justify-center" onClick={onViewQr}>
          <IconQr className="me-1.5 h-4 w-4" /> {t('tables.card.viewQr')}
        </Button>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{t('tables.card.noQrHint')}</p>
      )}
    </Card>
  );
}
