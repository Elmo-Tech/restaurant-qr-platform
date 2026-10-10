import { apiFetch } from '../api/client';
import type {
  SessionDetail,
  SessionListItem,
  SessionSummaryDocument,
  TableBoardRow,
} from './types';

/**
 * Thin Table Session request layer, mirroring `lib/tables/api.ts`: each function
 * calls exactly one documented Backend route through the existing `apiFetch`
 * transport (browser `fetch`, so the non-spoofable `Origin` the CSRF guard
 * checks is always present).
 */
function base(restaurantId: string): string {
  return `/restaurants/${restaurantId}/table-sessions`;
}

function query(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] =>
      entry[1] !== undefined && entry[1] !== '',
  );
  if (entries.length === 0) return '';
  return `?${entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')}`;
}

export async function getBoard(
  restaurantId: string,
  branchId: string | undefined,
): Promise<TableBoardRow[]> {
  const body = await apiFetch<{ data: TableBoardRow[] }>(
    `${base(restaurantId)}/board${query({ branchId })}`,
  );
  return body.data;
}

export interface ListSessionsParams {
  branchId?: string;
  tableId?: string;
  status?: 'OPEN' | 'CLOSED';
  limit?: number;
}

export async function listSessions(
  restaurantId: string,
  params: ListSessionsParams,
): Promise<SessionListItem[]> {
  const body = await apiFetch<{ data: SessionListItem[] }>(
    `${base(restaurantId)}${query({ ...params })}`,
  );
  return body.data;
}

export async function getSession(
  restaurantId: string,
  sessionId: string,
): Promise<SessionDetail> {
  const body = await apiFetch<{ data: SessionDetail }>(
    `${base(restaurantId)}/${encodeURIComponent(sessionId)}`,
  );
  return body.data;
}

export async function openSession(
  restaurantId: string,
  tableId: string,
): Promise<SessionDetail> {
  const body = await apiFetch<{ data: SessionDetail }>(base(restaurantId), {
    method: 'POST',
    body: { tableId },
  });
  return body.data;
}

export async function closeSession(
  restaurantId: string,
  sessionId: string,
  input: { pendingOrders?: 'KEEP' | 'REJECT' },
): Promise<SessionDetail> {
  const body = await apiFetch<{ data: SessionDetail }>(
    `${base(restaurantId)}/${encodeURIComponent(sessionId)}/close`,
    { method: 'POST', body: input },
  );
  return body.data;
}

/** The printable table order summary (the route keeps its stable `/bill` path). */
export async function getBill(
  restaurantId: string,
  sessionId: string,
): Promise<SessionSummaryDocument> {
  const body = await apiFetch<{ data: SessionSummaryDocument }>(
    `${base(restaurantId)}/${encodeURIComponent(sessionId)}/bill`,
  );
  return body.data;
}

/** Audit only: the staff member pressed Print. Never blocks printing if it fails. */
export async function recordBillPrinted(
  restaurantId: string,
  sessionId: string,
): Promise<void> {
  await apiFetch(
    `${base(restaurantId)}/${encodeURIComponent(sessionId)}/bill/printed`,
    { method: 'POST', body: {} },
  );
}
