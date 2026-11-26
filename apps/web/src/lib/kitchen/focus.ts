import type { KitchenStatus, KitchenTicket } from './types.ts';

/**
 * Kitchen K3: the pure rules behind One Ticket Focus on a phone. No React, no
 * network. The focused ticket is remembered by its stable id, never by its
 * position, so polling and re-sorting (K2 time priority) cannot move the focus
 * to a different ticket. When the focused ticket leaves its stage (another
 * employee moved, finished or cancelled it) the focus falls back to its
 * neighbour, and the neighbour's action stays held until the person has seen
 * the change -- a ticket that changes under a finger must never receive the
 * tap meant for the one that was there a moment ago.
 *
 * Nothing here changes a status or sends a request. The status route, its
 * `expectedStatus` guard and every K1 recovery rule stay exactly as they were.
 */

export const KITCHEN_STAGES: readonly KitchenStatus[] = ['ACCEPTED', 'PREPARING', 'READY'];

/**
 * After the board moves the focus by itself on the person's OWN action (the
 * ticket they just finished is gone, the next one slides in), the new ticket's
 * action stays disabled this long. It absorbs the second half of a double tap.
 */
export const FOCUS_SETTLE_MS = 800;

/** Tickets of one branch, each stage already in K2 time-priority order. */
export type StageTickets = Readonly<Record<KitchenStatus, readonly KitchenTicket[]>>;

export type FocusGuard =
  | { kind: 'none' }
  /** The person's own action moved the focus: a short pause on the new ticket's action. */
  | { kind: 'settling'; ticketId: string; until: number }
  /** Someone else's change moved the focus: the new ticket's action waits for an explicit "Continue". */
  | { kind: 'confirm'; ticketId: string; generation: number };

export interface KitchenFocus {
  stage: KitchenStatus;
  /** The focused ticket's id in `stage`, or null when the stage is empty or nothing is chosen yet. */
  ticketId: string | null;
  /** The focused ticket's display identity, kept so a ticket that left can still be named. */
  label: string | null;
  /** The ids of `stage` as of the last reconcile: the neighbour lookup when the focused ticket leaves. */
  order: readonly string[];
  /** The last focused ticket of each stage, so switching tabs and back returns to the same ticket. */
  memory: Readonly<Partial<Record<KitchenStatus, string>>>;
  guard: FocusGuard;
  /** Monotonic identity of the latest departure, even when there is no neighbour. */
  generation: number;
}

/** Feedback about a focused ticket that left its stage. `own` is the person's own action (announced, not shown). */
export type FocusNotice =
  | { kind: 'moved'; ticketId: string; label: string; to: KitchenStatus; own: boolean; generation: number }
  | { kind: 'removed'; ticketId: string; label: string; own: false; generation: number };

export interface FocusOptions {
  labelOf: (ticket: KitchenTicket) => string;
}

export function initialKitchenFocus(stage: KitchenStatus = 'ACCEPTED', generation = 0): KitchenFocus {
  return { stage, ticketId: null, label: null, order: [], memory: {}, guard: { kind: 'none' }, generation };
}

function idsOf(tickets: readonly KitchenTicket[]): string[] {
  return tickets.map((ticket) => ticket.id);
}

function focusOn(
  prev: KitchenFocus,
  stage: KitchenStatus,
  ticket: KitchenTicket | null,
  byStage: StageTickets,
  options: FocusOptions,
  guard: FocusGuard,
): KitchenFocus {
  const memory = ticket ? { ...prev.memory, [stage]: ticket.id } : prev.memory;
  return {
    stage,
    ticketId: ticket?.id ?? null,
    label: ticket ? options.labelOf(ticket) : null,
    order: idsOf(byStage[stage]),
    memory,
    guard,
    generation: prev.generation,
  };
}

/**
 * The ticket to show when `leftId` is gone: the next one in the old order that
 * is still in the stage (the one that waited just a little less), else the
 * closest one before it.
 */
function neighbour(
  oldOrder: readonly string[],
  leftId: string,
  stageTickets: readonly KitchenTicket[],
): KitchenTicket | null {
  const present = new Map(stageTickets.map((ticket) => [ticket.id, ticket]));
  const at = oldOrder.indexOf(leftId);
  if (at === -1) return stageTickets[0] ?? null;
  for (let index = at + 1; index < oldOrder.length; index += 1) {
    const candidate = present.get(oldOrder[index]);
    if (candidate) return candidate;
  }
  for (let index = at - 1; index >= 0; index -= 1) {
    const candidate = present.get(oldOrder[index]);
    if (candidate) return candidate;
  }
  return stageTickets[0] ?? null;
}

/**
 * Applies a fresh read to the focus. `ownMoves` maps a ticket id to the status
 * the person's own (not refused) request was moving it to; it is how the board
 * tells "I finished this ticket" from "someone else changed it".
 */
export function reconcileKitchenFocus(
  prev: KitchenFocus,
  byStage: StageTickets,
  context: { ownMoves: ReadonlyMap<string, KitchenStatus>; now: number } & FocusOptions,
): { focus: KitchenFocus; notice: FocusNotice | null } {
  const stageTickets = byStage[prev.stage];

  if (prev.ticketId !== null && stageTickets.some((ticket) => ticket.id === prev.ticketId)) {
    // Still where it was: only its position may have changed. The focus (and its guard) stay as they are.
    return { focus: { ...prev, order: idsOf(stageTickets) }, notice: null };
  }

  if (prev.ticketId === null) {
    // Nothing chosen yet (first read, or a stage that was empty): pin the longest-waiting ticket by id,
    // so later re-sorting cannot change which ticket is focused.
    return { focus: focusOn(prev, prev.stage, stageTickets[0] ?? null, byStage, context, { kind: 'none' }), notice: null };
  }

  const leftId = prev.ticketId;
  const label = prev.label ?? leftId;
  const movedTo = KITCHEN_STAGES.map((stage) => byStage[stage].find((ticket) => ticket.id === leftId)?.status ?? null).find(
    (status) => status !== null,
  );
  const next = neighbour(prev.order, leftId, stageTickets);
  // READY has no action to protect: its tickets just wait for service, so a ticket leaving it is routine.
  const actionable = prev.stage !== 'READY';
  const own = movedTo !== undefined && context.ownMoves.get(leftId) === movedTo;

  const generation = actionable ? prev.generation + 1 : prev.generation;
  let guard: FocusGuard = { kind: 'none' };
  if (next && actionable) {
    guard = own ? { kind: 'settling', ticketId: next.id, until: context.now + FOCUS_SETTLE_MS } : { kind: 'confirm', ticketId: next.id, generation };
  }

  let notice: FocusNotice | null = null;
  if (actionable) {
    notice =
      movedTo !== undefined
        ? { kind: 'moved', ticketId: leftId, label, to: movedTo, own, generation }
        : { kind: 'removed', ticketId: leftId, label, own: false, generation };
  }
  return { focus: { ...focusOn(prev, prev.stage, next, byStage, context, guard), generation }, notice };
}

/** The person chose a tab: back to the ticket they last had there if it is still there, else the longest-waiting one. */
export function selectKitchenStage(
  prev: KitchenFocus,
  stage: KitchenStatus,
  byStage: StageTickets,
  options: FocusOptions,
): KitchenFocus {
  const remembered = prev.memory[stage];
  const ticket = byStage[stage].find((candidate) => candidate.id === remembered) ?? byStage[stage][0] ?? null;
  return focusOn(prev, stage, ticket, byStage, options, { kind: 'none' });
}

/** The person chose a ticket (from the list, "Previous / Next" or "Show it"). An unknown id changes nothing. */
export function selectKitchenTicket(
  prev: KitchenFocus,
  stage: KitchenStatus,
  ticketId: string,
  byStage: StageTickets,
  options: FocusOptions,
): KitchenFocus {
  const ticket = byStage[stage].find((candidate) => candidate.id === ticketId);
  if (!ticket) return prev;
  return focusOn(prev, stage, ticket, byStage, options, { kind: 'none' });
}

/** One step through the stage's current order (-1 earlier / longer waiting, +1 later). Stops at either end. */
export function stepKitchenFocus(
  prev: KitchenFocus,
  delta: -1 | 1,
  byStage: StageTickets,
  options: FocusOptions,
): KitchenFocus {
  const tickets = byStage[prev.stage];
  const at = tickets.findIndex((ticket) => ticket.id === prev.ticketId);
  const target = tickets[at + delta];
  if (at === -1 || !target) return prev;
  return focusOn(prev, prev.stage, target, byStage, options, { kind: 'none' });
}

/** "Continue": the person has seen the change, so the focused ticket's action is released. */
export function acknowledgeKitchenFocus(prev: KitchenFocus, expected: { ticketId: string; generation: number }): KitchenFocus {
  return prev.guard.kind === 'confirm' && prev.ticketId === expected.ticketId &&
    prev.guard.ticketId === expected.ticketId && prev.guard.generation === expected.generation &&
    prev.generation === expected.generation
    ? { ...prev, guard: { kind: 'none' } }
    : prev;
}

/** Releases a `settling` guard whose pause is over. */
export function settleKitchenFocus(prev: KitchenFocus, now: number): KitchenFocus {
  return prev.guard.kind === 'settling' && now >= prev.guard.until ? { ...prev, guard: { kind: 'none' } } : prev;
}

/**
 * Whether a tap on the action of `ticketId` may start a status change. Checked
 * against the CURRENT focus at tap time, not the one the screen was drawn
 * from: if a poll moved the focus after the screen was painted, a tap that
 * still lands on the old ticket's button is refused instead of being delivered.
 * `null` means allowed.
 */
export type ActionHold = 'not-focused' | 'settling' | 'confirm';

export function kitchenActionHold(focus: KitchenFocus, ticketId: string, now: number): ActionHold | null {
  if (focus.ticketId !== ticketId) return 'not-focused';
  const { guard } = focus;
  if (guard.kind === 'none' || guard.ticketId !== ticketId) return null;
  if (guard.kind === 'confirm') return 'confirm';
  return now >= guard.until ? null : 'settling';
}

/** 1-based position of the focused ticket within its stage, for "2 of 5". */
export function kitchenFocusPosition(focus: KitchenFocus, byStage: StageTickets): { position: number; total: number } | null {
  const tickets = byStage[focus.stage];
  const at = tickets.findIndex((ticket) => ticket.id === focus.ticketId);
  return at === -1 ? null : { position: at + 1, total: tickets.length };
}
