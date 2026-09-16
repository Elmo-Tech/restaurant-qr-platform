import { apiFetch } from '../api/client';
import type { CreatedTable, TableListItem, TableQr, TableStatus } from './types';

/** The Backend's `TableDetail` response shape (Section 17) -- fetched per Table to learn its current QR (see `types.ts`'s `TableRow` docstring for why). */
export interface TableDetail {
  id: string;
  tableNumber: string;
  status: TableStatus;
  qr: TableQr | null;
}

/**
 * Thin Table request layer (FT-4), mirroring `lib/menu/api.ts`'s exact
 * pattern: each function calls the one documented Backend route exactly,
 * using the existing `apiFetch` transport -- no generic repository-wide
 * SDK, no second API abstraction, no parallel Staff-specific read model
 * (Section 17).
 */
function branchTablesPath(restaurantId: string, branchId: string): string {
  return `/restaurants/${restaurantId}/branches/${branchId}/tables`;
}

export async function listTables(
  restaurantId: string,
  branchId: string,
): Promise<TableListItem[]> {
  const body = await apiFetch<{ data: TableListItem[] }>(
    branchTablesPath(restaurantId, branchId),
  );
  return body.data;
}

export async function getTableDetail(
  restaurantId: string,
  branchId: string,
  tableId: string,
): Promise<TableDetail> {
  const body = await apiFetch<{ data: TableDetail }>(
    `${branchTablesPath(restaurantId, branchId)}/${tableId}`,
  );
  return body.data;
}

export interface CreateTableInput {
  tableNumber: string;
}

export async function createTable(
  restaurantId: string,
  branchId: string,
  input: CreateTableInput,
): Promise<CreatedTable> {
  const body = await apiFetch<{ data: CreatedTable }>(
    branchTablesPath(restaurantId, branchId),
    { method: 'POST', body: input },
  );
  return body.data;
}

export interface UpdateTableInput {
  tableNumber?: string;
}

export async function updateTable(
  restaurantId: string,
  branchId: string,
  tableId: string,
  input: UpdateTableInput,
): Promise<TableListItem> {
  const body = await apiFetch<{ data: TableListItem }>(
    `${branchTablesPath(restaurantId, branchId)}/${tableId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}
