import { ApiError } from '../api/errors.ts';
import type { KitchenStatus, KitchenTicket } from './types.ts';

/**
 * Kitchen K1: the pure rules behind the Kitchen Board's loading, conflict and
 * recovery states. No React, no network: the board owns timing and requests,
 * these functions only decide what a result means. The Backend
 * (`PATCH .../orders/{id}/status`) stays the only authority on transitions.
 */

/**
 * The kitchen's only forward steps. READY has no kitchen step: serving is a
 * separate front-of-house transition (`orders.markServed`) and never happens
 * from this board.
 */
export function nextKitchenStatus(status: KitchenStatus): 'PREPARING' | 'READY' | null {
  if (status === 'ACCEPTED') return 'PREPARING';
  if (status === 'PREPARING') return 'READY';
  return null;
}

/**
 * What a failed status change means for the board:
 * - `unauthenticated`: the session ended -- use the existing login recovery.
 * - `conflict`: the server state differs from what the board showed (someone
 *   else moved, cancelled or closed it). Nothing was applied by this request.
 * - `denied`: this account may not make the change. Nothing was applied.
 * - `rejected`: any other definite refusal (4xx). Nothing was applied.
 * - `unknown`: no reliable answer -- a network failure, a client-side timeout
 *   or abort, a `408 Request Timeout` (a proxy may have forwarded the request
 *   before giving up), or a gateway / server error. The change may or may not
 *   have been saved, so the board must re-read the truth before another
 *   attempt is allowed.
 */
export type KitchenActionFailure = 'unauthenticated' | 'conflict' | 'denied' | 'rejected' | 'unknown';

/** Client-side bounds on a request; reaching one means "no answer", never "refused". */
export const KITCHEN_READ_TIMEOUT_MS = 10_000;
export const KITCHEN_ACTION_TIMEOUT_MS = 15_000;

const HTTP_REQUEST_TIMEOUT = 408;

export function classifyKitchenActionError(error: unknown): KitchenActionFailure {
  // Includes `AbortSignal.timeout()`'s TimeoutError and any other abort or network failure.
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.status === 401 || error.code === 'UNAUTHENTICATED') return 'unauthenticated';
  if (error.status === HTTP_REQUEST_TIMEOUT) return 'unknown';
  if (error.status === 409 || error.code === 'ORDER_NOT_FOUND') return 'conflict';
  if (error.status === 403) return 'denied';
  if (error.status >= 400 && error.status < 500) return 'rejected';
  return 'unknown';
}

/**
 * A ticket whose shown state is known to be out of date (or whose last action
 * has an unknown outcome). Its action stays blocked until a read that STARTED
 * after `afterRead` succeeds -- an older in-flight read cannot vouch for it.
 */
export interface PendingCheck {
  ticketId: string;
  /** The ticket's display identity, kept so a disappearing ticket can still be named. */
  label: string;
  from: KitchenStatus;
  to: KitchenStatus;
  /** `saved`: the server confirmed it; `conflict`: the server refused (state changed); `unknown`: no answer. */
  kind: 'saved' | 'conflict' | 'unknown';
  afterRead: number;
}

/** Feedback attached to one ticket. It lasts while the ticket stays in `status`. */
export type CardNotice =
  | { kind: 'confirmed' | 'notApplied' | 'changedElsewhere' | 'denied'; status: KitchenStatus }
  | { kind: 'failed'; status: KitchenStatus; message: string | null };

/** Feedback for a ticket that left the board while its action was being checked. */
export interface BoardNotice {
  id: string;
  ticketId: string;
  label: string;
}

export interface PendingResolution {
  pending: Record<string, PendingCheck>;
  cardNotices: Record<string, CardNotice>;
  boardNotices: BoardNotice[];
}

/** Settles every pending check that `tickets` (from read number `readSeq`) can answer authoritatively. */
export function resolvePendingChecks(
  pending: Readonly<Record<string, PendingCheck>>,
  tickets: readonly KitchenTicket[],
  readSeq: number,
): PendingResolution {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const result: PendingResolution = { pending: {}, cardNotices: {}, boardNotices: [] };
  for (const check of Object.values(pending)) {
    if (readSeq <= check.afterRead) {
      result.pending[check.ticketId] = check;
      continue;
    }
    const ticket = byId.get(check.ticketId);
    if (!ticket) {
      result.boardNotices.push({ id: `${check.ticketId}:${readSeq}`, ticketId: check.ticketId, label: check.label });
      continue;
    }
    if (ticket.status === check.to) {
      if (check.kind === 'unknown') result.cardNotices[ticket.id] = { kind: 'confirmed', status: ticket.status };
      else if (check.kind === 'conflict') result.cardNotices[ticket.id] = { kind: 'changedElsewhere', status: ticket.status };
      // `saved` and now visibly moved: the new column is the confirmation.
      continue;
    }
    if (ticket.status === check.from && check.kind === 'unknown') {
      result.cardNotices[ticket.id] = { kind: 'notApplied', status: ticket.status };
      continue;
    }
    result.cardNotices[ticket.id] = { kind: 'changedElsewhere', status: ticket.status };
  }
  return result;
}

/** Drops notices whose ticket left the board or moved on: they described a state that no longer exists. */
export function pruneCardNotices(
  notices: Readonly<Record<string, CardNotice>>,
  tickets: readonly KitchenTicket[],
): Record<string, CardNotice> {
  const statusById = new Map(tickets.map((ticket) => [ticket.id, ticket.status]));
  const kept: Record<string, CardNotice> = {};
  for (const [ticketId, notice] of Object.entries(notices)) {
    if (statusById.get(ticketId) === notice.status) kept[ticketId] = notice;
  }
  return kept;
}

export const BOARD_NOTICE_LIMIT = 5;

/** Newest last; one notice per ticket; at most `BOARD_NOTICE_LIMIT` kept. */
export function appendBoardNotices(existing: readonly BoardNotice[], added: readonly BoardNotice[]): BoardNotice[] {
  const addedIds = new Set(added.map((notice) => notice.ticketId));
  return [...existing.filter((notice) => !addedIds.has(notice.ticketId)), ...added].slice(-BOARD_NOTICE_LIMIT);
}

/**
 * New-ticket detection for the chime. `seen` is every ticket id this branch
 * session has already shown (`null` before its first successful read, which
 * seeds it silently). Only a never-seen ACCEPTED ticket counts as an arrival,
 * so a repeated poll, a reconciliation read or a ticket that briefly drops out
 * of a response never chimes twice.
 */
export function detectArrivals(
  seen: ReadonlySet<string> | null,
  tickets: readonly KitchenTicket[],
): { seen: Set<string>; arrived: string[] } {
  const next = new Set(seen ?? []);
  const arrived: string[] = [];
  for (const ticket of tickets) {
    if (seen !== null && !seen.has(ticket.id) && ticket.status === 'ACCEPTED') arrived.push(ticket.id);
    next.add(ticket.id);
  }
  return { seen: next, arrived };
}
