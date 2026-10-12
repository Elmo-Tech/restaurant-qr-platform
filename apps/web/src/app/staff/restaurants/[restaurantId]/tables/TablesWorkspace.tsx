'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import * as tablesApi from '../../../../../lib/tables/api';
import type { TableQr, TableRow } from '../../../../../lib/tables/types';
import { resolveAssetUrl } from '../../../../../lib/media/asset-url';
import type { QrStyle } from '../../../../../lib/qr/style';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { IconPlus, IconSearch, IconTable } from '../../../../../components/staff/icons';
import { QrPreviewDialog } from './QrPreviewDialog';
import * as sessionsApi from '../../../../../lib/table-sessions/api';
import type { SessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import type { TableBoardRow } from '../../../../../lib/table-sessions/types';
import { useNow } from '../../../../../lib/table-sessions/use-now';
import { OpenSessionDialog } from './SessionActionDialogs';
import { SessionDrawer, type SessionDrawerIntent } from './SessionDrawer';
import { SessionHistoryPanel } from './SessionHistoryPanel';
import { TableCard, tableViewState, type TableViewState } from './TableCard';

export interface TablesWorkspaceProps {
  restaurantId: string;
  restaurantName: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me` (Section 5) -- never re-fetched or narrowed again here. */
  branches: AuthContextBranch[];
  /** `tables.manage`, Branch-scoped (Section 5/6) -- Table management is authorized per-assigned-Branch on the Backend, unlike Menu's Restaurant-wide `allBranches` requirement. */
  canManage: boolean;
  webOrigin: string;
  /** Table Sessions: UX-only capabilities derived from the Membership permissions (the Backend enforces). */
  sessionCaps: SessionCapabilities;
  /** The Membership's permission keys: the session panel offers only the order actions they allow (UX only). */
  permissions: string[];
  /** The Restaurant's saved QR appearance, applied to the table QR panel. */
  qrStyle: QrStyle;
  /** Restaurant logo path (drawn in the QR center when the style asks for it). */
  logoAssetPath: string | null;
}

interface TableFormState {
  tableNumber: string;
}

const EMPTY_FORM: TableFormState = { tableNumber: '' };

/** Status filter chips. Counts and matching use only the board data already loaded. */
type TableFilter = 'all' | 'open' | 'pending' | 'closed' | 'idle';
const FILTERS: readonly TableFilter[] = ['all', 'open', 'pending', 'closed', 'idle'];

/** Operational filters over the board data already loaded. They describe the session, so they also hold for a table that was deactivated while a session was still open. */
function matchesFilter(
  entry: { state: TableViewState | null; board: TableBoardRow | null },
  filter: TableFilter,
): boolean {
  const board = entry.board;
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return board?.openSession != null;
    case 'pending':
      return (board?.openSession?.pendingOrderCount ?? 0) > 0;
    case 'closed':
      return board?.ordering === 'CLOSED_BY_STAFF';
    case 'idle':
      return board !== null && board.openSession === null;
  }
}

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
  webOrigin,
  sessionCaps,
  permissions,
  qrStyle,
  logoAssetPath,
}: TablesWorkspaceProps) {
  const { t, locale } = useStaffI18n();
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

  // Table Sessions: ONE workspace. The board (availability and the live session) is read
  // from the Backend per Branch; sessions are viewed in a panel, never on a second
  // disconnected screen. Past sessions stay reachable through the history view.
  const [view, setView] = useState<'tables' | 'past'>('tables');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableFilter>('all');
  const [board, setBoard] = useState<TableBoardRow[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<{
    id: string;
    intent?: SessionDrawerIntent;
  } | null>(null);
  const [openTarget, setOpenTarget] = useState<TableRow | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [pastTable, setPastTable] = useState<{ id: string; tableNumber: string } | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const boardRequestRef = useRef(0);

  const tablesRequestRef = useRef(0);

  // Lazy per-card QR status: `undefined` = not asked yet, `'error'` = the lookup failed
  // (shown as "unavailable", never as "no active QR"), `null` = confirmed none.
  const [qrByTable, setQrByTable] = useState<Record<string, TableQr | null | 'error'>>({});
  const [qrError, setQrError] = useState<string | null>(null);
  const qrQueueRef = useRef<string[]>([]);
  const qrSeenRef = useRef<Set<string>>(new Set());
  const qrActiveRef = useRef(0);
  const qrGenerationRef = useRef(0);
  const selectedBranchRef = useRef<string | null>(null);
  const tableNumberRef = useRef<HTMLInputElement>(null);

  const loadTables = useCallback(
    async (branchId: string) => {
      const requestId = ++tablesRequestRef.current;
      setTables(null);
      setTablesError(null);
      try {
        const list = await tablesApi.listTables(restaurantId, branchId);
        if (tablesRequestRef.current !== requestId) return;
        // The list carries no QR information (a settled Backend contract). A
        // card asks for its own QR status when it scrolls into view -- never
        // one request per table up front, which for 50 tables is 50 requests
        // on every load and trips the rate limit.
        qrGenerationRef.current += 1;
        qrQueueRef.current = [];
        qrSeenRef.current = new Set();
        setQrByTable({});
        setTables(list.map((row) => ({ ...row, qr: null })));
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

  const pumpQr = useCallback(() => {
    // At most 4 lookups in flight; each finished one starts the next queued one.
    function pump() {
      const branchId = selectedBranchRef.current;
      if (!branchId) return;
      while (qrActiveRef.current < 4 && qrQueueRef.current.length > 0) {
        const tableId = qrQueueRef.current.shift() as string;
        const generation = qrGenerationRef.current;
        qrActiveRef.current += 1;
        tablesApi
          .getTableDetail(restaurantId, branchId, tableId)
          .then((detail) => {
            if (qrGenerationRef.current !== generation) return;
            setQrByTable((prev) => ({ ...prev, [tableId]: detail.qr }));
          })
          .catch((error: unknown) => {
            if (qrGenerationRef.current !== generation) return;
            if (isUnauthenticatedError(error)) {
              redirectToLogin();
              return;
            }
            setQrByTable((prev) => ({ ...prev, [tableId]: 'error' }));
          })
          .finally(() => {
            qrActiveRef.current -= 1;
            pump();
          });
      }
    }
    pump();
  }, [restaurantId]);

  const requestQr = useCallback(
    (tableId: string) => {
      if (qrSeenRef.current.has(tableId)) return;
      qrSeenRef.current.add(tableId);
      qrQueueRef.current.push(tableId);
      pumpQr();
    },
    [pumpQr],
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
    selectedBranchRef.current = selectedBranchId;
  }, [selectedBranchId]);

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
    setHistoryRefreshKey((key) => key + 1);
  }

  async function handleOpenSession() {
    if (!openTarget || isOpening) return;
    setIsOpening(true);
    setOpenError(null);
    try {
      const opened = await sessionsApi.openSession(restaurantId, openTarget.id);
      setOpenTarget(null);
      handleSessionChanged();
      setDrawerTarget({ id: opened.id });
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

  async function handleViewQr(table: TableRow) {
    let qr = qrByTable[table.id];
    if ((qr === undefined || qr === 'error') && selectedBranchId) {
      setQrError(null);
      try {
        const detail = await tablesApi.getTableDetail(restaurantId, selectedBranchId, table.id);
        qr = detail.qr;
        setQrByTable((prev) => ({ ...prev, [table.id]: detail.qr }));
      } catch (error) {
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setQrByTable((prev) => ({ ...prev, [table.id]: 'error' }));
        setQrError(describeError(error));
        return;
      }
    }
    if (qr && qr !== 'error') {
      setQrTarget({ ...table, qr });
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
        setQrByTable((prev) => ({ ...prev, [created.table.id]: created.qr }));
        qrSeenRef.current.add(created.table.id);
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
  const selectedBranchName = selectedBranch ? localizedName(selectedBranch, locale) : null;

  // ---- search + status filter, over data that is already loaded -------------
  const now = useNow();
  const entries = (tables ?? []).map((table) => {
    const board = sessionCaps.canView ? (boardByTable.get(table.id) ?? null) : null;
    return { table, board, state: tableViewState(table, board) };
  });
  const query = search.trim().toLowerCase();
  const searched = entries.filter(
    (entry) => query === '' || entry.table.tableNumber.toLowerCase().includes(query),
  );
  const visibleEntries = searched.filter((entry) => matchesFilter(entry, statusFilter));
  const showFilters =
    sessionCaps.canView && board !== null && tables !== null && tables.length > 0;
  const filterOptions: ChipOption<TableFilter>[] = FILTERS.map((value) => ({
    value,
    label: t(`tables.filter.${value}` as const),
    count: searched.filter((entry) => matchesFilter(entry, value)).length,
  }));

  const dialog = (
    <Dialog
      open={mode !== 'idle'}
      title={mode === 'create' ? t('tables.new') : t('tables.edit')}
      subtitle={selectedBranchName ?? undefined}
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
    <div className="flex min-w-0 max-w-full flex-col gap-5">
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

      {branches.length === 0 ? (
        <Alert variant="error">
          {t('guard.noBranch')}
        </Alert>
      ) : (
        <>
          {/* one toolbar: view, branch, search, refresh */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            {sessionCaps.canView ? (
              <ChipGroup
                variant="segmented"
                ariaLabel={t('tables.title')}
                value={view}
                onChange={setView}
                options={[
                  { value: 'tables', label: t('sessions.view.tables') },
                  { value: 'past', label: t('sessions.view.past') },
                ]}
              />
            ) : null}

            {branches.length > 1 && showTables ? (
              <Select
                aria-label={t('tables.branch')}
                className="w-full sm:w-52"
                value={selectedBranchId ?? ''}
                onChange={(event) => {
                  setSelectedBranchId(event.target.value);
                  setStatusFilter('all');
                }}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {localizedName(branch, locale)}
                  </option>
                ))}
              </Select>
            ) : null}

            {showTables ? (
              <div role="search" className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label={t('tables.search.label')}
                  placeholder={t('tables.search.placeholder')}
                  className="ps-9"
                  dir="auto"
                />
              </div>
            ) : null}

            {sessionCaps.canView ? (
              <Button
                variant="ghost"
                className="ms-auto"
                onClick={() => selectedBranchId && handleSessionChanged()}
              >
                {t('sessions.refresh')}
              </Button>
            ) : null}
          </div>

          {showTables && showFilters ? (
            <ChipGroup
              ariaLabel={t('tables.filter.aria')}
              options={filterOptions}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          ) : null}

          {sessionCaps.canView && boardError && showTables ? (
            <Alert variant="error">{boardError}</Alert>
          ) : null}

          {showTables && qrError ? <Alert variant="error">{qrError}</Alert> : null}

          {sessionCaps.canView && view === 'past' ? (
            <SessionHistoryPanel
              restaurantId={restaurantId}
              branches={branches}
              initialBranchId={selectedBranchId}
              tableFilter={pastTable}
              refreshKey={historyRefreshKey}
              onClearTableFilter={() => setPastTable(null)}
              onOpenSession={(id) => setDrawerTarget({ id })}
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
            <EmptyState
              compact
              icon={<IconTable className="h-6 w-6" />}
              title={t('tables.empty.title')}
              description={t('tables.empty.hint')}
              action={
                canManage ? (
                  <Button onClick={startCreate}>
                    <IconPlus className="me-1.5 h-4 w-4" /> {t('tables.new')}
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {showTables && tables !== null && tables.length > 0 && visibleEntries.length === 0 ? (
            <EmptyState
              compact
              icon={<IconSearch className="h-6 w-6" />}
              title={t('tables.filter.noMatch.title')}
              description={t('tables.filter.noMatch.hint')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  {t('tables.filter.clear')}
                </Button>
              }
            />
          ) : null}

          {showTables && visibleEntries.length > 0 ? (
            <div className="@container min-w-0">
            <div className="grid grid-cols-1 gap-4 @[41rem]:grid-cols-2 @[58rem]:grid-cols-3">
              {visibleEntries.map(({ table: listed, board }) => {
                const qrEntry = qrByTable[listed.id];
                const table: TableRow = {
                  ...listed,
                  qr: qrEntry && qrEntry !== 'error' ? qrEntry : null,
                };
                const qrState =
                  qrEntry === undefined ? 'loading' : qrEntry === 'error' ? 'error' : 'known';
                return (
                <TableCard
                  key={table.id}
                  table={table}
                  qrState={qrState}
                  onNeedQr={requestQr}
                  canManage={canManage}
                  onEdit={() => startEdit(table)}
                  onViewQr={() => void handleViewQr(table)}
                  board={board}
                  sessionCaps={sessionCaps}
                  now={now}
                  onOpenSession={() => {
                    setOpenError(null);
                    setOpenTarget(table);
                  }}
                  onViewSession={(id, intent) => setDrawerTarget({ id, intent })}
                  onViewHistory={() => {
                    setPastTable({ id: table.id, tableNumber: table.tableNumber });
                    setView('past');
                  }}
                />
                );
              })}
            </div>
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

      {drawerTarget ? (
        <SessionDrawer
          key={`${drawerTarget.id}:${drawerTarget.intent ?? ''}`}
          restaurantId={restaurantId}
          sessionId={drawerTarget.id}
          caps={sessionCaps}
          permissions={permissions}
          intent={drawerTarget.intent}
          onClose={() => setDrawerTarget(null)}
          onChanged={handleSessionChanged}
        />
      ) : null}

      {qrTarget && qrTarget.qr ? (
        <QrPreviewDialog
          target={{
            restaurantName,
            branchName: selectedBranchName,
            tableNumber: qrTarget.tableNumber,
            publicCode: qrTarget.qr.publicCode,
          }}
          guestUrl={`${webOrigin}/q/${qrTarget.qr.publicCode}`}
          qrStyle={qrStyle}
          logoUrl={resolveAssetUrl(logoAssetPath)}
          onClose={() => setQrTarget(null)}
        />
      ) : null}
    </div>
  );
}
