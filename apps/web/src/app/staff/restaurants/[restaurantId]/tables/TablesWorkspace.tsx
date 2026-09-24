'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import * as tablesApi from '../../../../../lib/tables/api';
import type { TableRow } from '../../../../../lib/tables/types';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { IconPencil, IconPlus, IconQr } from '../../../../../components/staff/icons';
import { GenericQrCard } from './GenericQrCard';
import { QrPreviewDialog } from './QrPreviewDialog';

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
}: TablesWorkspaceProps) {
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

  useEffect(() => {
    // `queueMicrotask` here is purely to satisfy eslint-plugin-react-hooks'
    // `set-state-in-effect` rule (same established pattern as
    // `MenuWorkspace`'s own mount/selection effects) -- it has nothing to
    // do with the fetch itself, which still starts essentially immediately.
    if (selectedBranchId) {
      queueMicrotask(() => {
        void loadTables(selectedBranchId);
      });
    }
  }, [selectedBranchId, loadTables]);

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
      setFormError('Table number is required.');
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
      title={mode === 'create' ? 'New Table' : 'Edit Table'}
      subtitle={selectedBranch?.name}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Table' : 'Save changes'}
      onSubmit={handleSubmit}
      onClose={cancelForm}
      initialFocusRef={tableNumberRef}
    >
      <div className="flex flex-col gap-4">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <FormField label="Table number" htmlFor="table-number">
          <Input
            id="table-number"
            ref={tableNumberRef}
            required
            value={form.tableNumber}
            onChange={(event) => setForm({ tableNumber: event.target.value })}
            disabled={isSubmitting}
            placeholder="e.g. 12, A1, VIP-2"
          />
        </FormField>
      </div>
    </Dialog>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1D1A18]">Tables & QR</h1>
          <p className="mt-1 text-sm text-[#655D56]">
            Manage restaurant tables and guest QR codes.
          </p>
        </div>
        {canManage && selectedBranchId ? (
          <Button onClick={startCreate}>
            <IconPlus className="mr-1.5 h-4 w-4" /> New Table
          </Button>
        ) : null}
      </div>

      <GenericQrCard
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        canManage={canManageGenericQr}
        webOrigin={webOrigin}
      />

      {branches.length === 0 ? (
        <Alert variant="error">
          No Branch is available for your account yet. Ask an Owner to assign you to a Branch.
        </Alert>
      ) : (
        <>
          {branches.length > 1 ? (
            <div className="max-w-xs">
              <FormField label="Branch" htmlFor="branch-select">
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

          {tablesError ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{tablesError}</span>
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() => selectedBranchId && void loadTables(selectedBranchId)}
                >
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}

          {tables === null && !tablesError ? <LoadingState label="Loading Tables…" /> : null}

          {tables !== null && tables.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm font-medium text-[#302C29]">No tables yet</p>
              <p className="text-sm text-[#655D56]">
                Create your first table to generate a guest QR code.
              </p>
              {canManage ? (
                <Button className="mt-2" onClick={startCreate}>
                  <IconPlus className="mr-1.5 h-4 w-4" /> New Table
                </Button>
              ) : null}
            </Card>
          ) : null}

          {tables !== null && tables.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  branchName={selectedBranch?.name ?? null}
                  canManage={canManage}
                  onEdit={() => startEdit(table)}
                  onViewQr={() => setQrTarget(table)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      {dialog}

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
}: {
  table: TableRow;
  branchName: string | null;
  canManage: boolean;
  onEdit: () => void;
  onViewQr: () => void;
}) {
  const hasActiveQr = table.qr !== null && table.qr.status === 'ACTIVE';

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#1D1A18]">
            Table {table.tableNumber}
          </p>
          {branchName ? <p className="text-xs text-[#655D56]">{branchName}</p> : null}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit Table ${table.tableNumber}`}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#AFA397] hover:bg-[#F8F5F1] hover:text-[#7A5138]"
          >
            <IconPencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            table.status === 'ACTIVE'
              ? 'bg-[#EAF3EA] text-[#2E7D32]'
              : 'bg-[#F1ECE6] text-[#8A8177]'
          }`}
        >
          {table.status === 'ACTIVE' ? 'Active' : 'Inactive'}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            hasActiveQr ? 'bg-[#F1ECE6] text-[#7A5138]' : 'bg-[#F1ECE6] text-[#AFA397]'
          }`}
        >
          {hasActiveQr ? 'Active QR' : 'No active QR'}
        </span>
      </div>

      {hasActiveQr ? (
        <Button variant="secondary" className="mt-1 justify-center" onClick={onViewQr}>
          <IconQr className="mr-1.5 h-4 w-4" /> View QR
        </Button>
      ) : (
        <p className="mt-1 text-xs text-[#AFA397]">
          No active QR for this Table yet.
        </p>
      )}
    </Card>
  );
}
