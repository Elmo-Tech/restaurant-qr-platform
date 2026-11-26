'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import * as kitchenApi from '../../../../../lib/kitchen/api';
import {
  KITCHEN_ACTION_TIMEOUT_MS,
  KITCHEN_READ_TIMEOUT_MS,
  appendBoardNotices,
  classifyKitchenActionError,
  detectArrivals,
  nextKitchenStatus,
  pruneCardNotices,
  resolvePendingChecks,
  type BoardNotice,
  type CardNotice,
  type PendingCheck,
} from '../../../../../lib/kitchen/board-state';
import { canUpdateKitchen } from '../../../../../lib/kitchen/capabilities';
import {
  acknowledgeKitchenFocus,
  initialKitchenFocus,
  kitchenActionHold,
  reconcileKitchenFocus,
  selectKitchenStage,
  selectKitchenTicket,
  settleKitchenFocus,
  stepKitchenFocus,
  type KitchenFocus,
  type StageTickets,
} from '../../../../../lib/kitchen/focus';
import { sortKitchenTickets } from '../../../../../lib/kitchen/ticket-view';
import type { KitchenStatus, KitchenTicket } from '../../../../../lib/kitchen/types';
import * as ordersApi from '../../../../../lib/orders/api';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { ReadErrorAlert } from '../../../../../components/staff/ReadErrorAlert';
import { IconSound } from '../../../../../components/staff/icons';
import { KitchenFocusView, type FocusNoticeView } from './KitchenFocusView';
import { KitchenTicketCard, kitchenTicketLabel, type KitchenCardNotice } from './KitchenTicketCard';
import { useKitchenSound } from './useKitchenSound';

const POLL_INTERVAL_MS = 5_000;
const CLOCK_INTERVAL_MS = 20_000;
const COLUMNS: readonly KitchenStatus[] = ['ACCEPTED', 'PREPARING', 'READY'];
const COLUMN_LABEL_KEY = {
  ACCEPTED: 'kitchen.col.new',
  PREPARING: 'kitchen.col.preparing',
  READY: 'kitchen.col.ready',
} as const satisfies Record<KitchenStatus, MessageKey>;
/** Tailwind's `lg` (64rem): from here the three columns fit side by side; below it the board is tabs + one ticket. */
const DESKTOP_QUERY = '(min-width: 64rem)';

function subscribeToLayout(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** True on a phone or small tablet (tabs + One Ticket Focus); false when the three columns fit. */
function useIsPhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribeToLayout,
    () => !window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Each stage in K2 time-priority order. The Backend lists by creation time, which differs for an order that waited as PENDING. */
function groupByStage(list: readonly KitchenTicket[]): Record<KitchenStatus, KitchenTicket[]> {
  const groups: Record<KitchenStatus, KitchenTicket[]> = { ACCEPTED: [], PREPARING: [], READY: [] };
  for (const ticket of sortKitchenTickets(list)) groups[ticket.status].push(ticket);
  return groups;
}

/**
 * Why a read is requested. `reconcile` must observe the server AFTER a status
 * change settled, so it never reuses a read that was already in flight.
 */
type ReadReason = 'initial' | 'poll' | 'visible' | 'manual' | 'reconcile';
/** `stale`: the result belonged to a previous branch session (or unmounted board) and was discarded. */
type ReadResult = 'ok' | 'failed' | 'stale';

/** The data of ONE branch session. Tagged with its branch so another branch's data can never render. */
interface BoardData {
  branchId: string | null;
  tickets: KitchenTicket[] | null;
  loadedAt: Date | null;
  /** Localized reason of the latest failed read; cleared by the next successful one. */
  error: string | null;
}

/** One polite announcement at a time: recovery after a failed read, or a ticket that left during reconciliation. */
interface Announcement {
  key: MessageKey;
  params?: Record<string, string>;
}

const EMPTY_BOARD: BoardData = { branchId: null, tickets: null, loadedAt: null, error: null };
const NO_BUSY: ReadonlySet<string> = new Set();

export interface KitchenBoardProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  permissions: string[];
}

/**
 * Kitchen View V1 (VERSION_ROADMAP, STAFF_DASHBOARD_UX_SPEC #99-#119): one
 * Branch at a time, three columns -- New, Preparing, Ready -- the ticket that
 * has waited longest in its column first. It polls every few seconds (and the moment the tab becomes visible
 * again), chimes when a new ticket arrives (opt-in), and moves a ticket
 * forward with one big button through the existing, Backend-checked status
 * route. Below the large breakpoint the columns become tabs.
 *
 * Kitchen K1 (states and recovery): reads never overlap -- polling, the
 * visible-tab refetch and Refresh join the read in flight, and a
 * reconciliation after a status change queues exactly one fresh read behind
 * it. Every read and action belongs to a branch session; switching branches
 * (or unmounting) discards whatever the previous session still had in flight.
 * A status change with an unknown outcome blocks that ticket until a read
 * started after it succeeds.
 *
 * Kitchen K2 (ticket readability and time priority): presentation and sort
 * order only -- see `lib/kitchen/ticket-view` and `KitchenTicketCard`.
 *
 * Kitchen K3 (mobile tabs and One Ticket Focus): below the large breakpoint
 * the columns become three tabs with counts and exactly one ticket in full.
 * The focus is held by the ticket's stable id (`lib/kitchen/focus`), so
 * polling and re-sorting never change which ticket is shown, an action is
 * only ever delivered to the ticket currently in focus, and a ticket moved or
 * removed by someone else is explained before its neighbour's action unlocks.
 * Desktop columns, reads, locks and recovery are unchanged.
 */
export function KitchenBoard({ restaurantId, branches, permissions }: KitchenBoardProps) {
  const { t, locale, formatTime } = useStaffI18n();
  const canUpdate = canUpdateKitchen(permissions);
  const sound = useKitchenSound();
  const playChime = sound.play;
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === 'ACTIVE'),
    [branches],
  );
  const initialBranchId = activeBranches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(initialBranchId);
  const [board, setBoard] = useState<BoardData>(EMPTY_BOARD);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(NO_BUSY);
  const [pending, setPending] = useState<Record<string, PendingCheck>>({});
  const [cardNotices, setCardNotices] = useState<Record<string, CardNotice>>({});
  const [boardNotices, setBoardNotices] = useState<BoardNotice[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [now, setNow] = useState<number>(0);
  const [focus, setFocus] = useState<KitchenFocus>(() => initialKitchenFocus());
  const [focusNotice, setFocusNotice] = useState<FocusNoticeView | null>(null);
  const isPhone = useIsPhoneLayout();

  /** Bumped on every branch switch and on unmount: any older read or action result is discarded. */
  const generationRef = useRef(0);
  const branchRef = useRef<string | null>(initialBranchId);
  /** Every read gets a number; a pending check needs a read numbered after it. */
  const readSeqRef = useRef(0);
  const inFlightRef = useRef<{ seq: number; promise: Promise<ReadResult> } | null>(null);
  const queuedRef = useRef<Promise<ReadResult> | null>(null);
  /** Synchronous per-ticket action locks: a second tap in the same frame never sends twice. */
  const locksRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Record<string, PendingCheck>>({});
  const seenRef = useRef<Set<string> | null>(null);
  const refreshLockRef = useRef(false);
  const staleRef = useRef(false);
  /** The focus the board is acting on RIGHT NOW (the state below may still be one render behind it). */
  const focusRef = useRef<KitchenFocus>(focus);
  /** The latest read grouped by stage; focus choices are validated against it, not against an older render. */
  const stagesRef = useRef<StageTickets>({ ACCEPTED: [], PREPARING: [], READY: [] });
  const labelRef = useRef<(ticket: KitchenTicket) => string>(() => '');
  const columnTextRef = useRef<(status: KitchenStatus) => string>(() => '');
  useEffect(() => {
    labelRef.current = (ticket) => kitchenTicketLabel(ticket, t);
    columnTextRef.current = (status) => t(COLUMN_LABEL_KEY[status]);
  }, [t]);

  // The ticket timers share one clock owned here, so they all tick together.
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const commitFocus = useCallback((next: KitchenFocus) => {
    focusRef.current = next;
    setFocus(next);
  }, []);

  /** Ends the current branch session: nothing still in flight may touch the next one. */
  const invalidateSession = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
    queuedRef.current = null;
    locksRef.current = new Set();
    pendingRef.current = {};
    seenRef.current = null;
    refreshLockRef.current = false;
    staleRef.current = false;
  }, []);

  useEffect(() => () => invalidateSession(), [invalidateSession]);

  const runRead = useCallback(
    (generation: number, branch: string): Promise<ReadResult> => {
      const seq = ++readSeqRef.current;
      const promise = (async (): Promise<ReadResult> => {
        try {
          // Bounded: a hung read would otherwise hold the single in-flight slot and stop every later poll.
          const list = await kitchenApi.listKitchenTickets(restaurantId, branch, {
            signal: AbortSignal.timeout(KITCHEN_READ_TIMEOUT_MS),
          });
          if (generationRef.current !== generation) return 'stale';

          const arrivals = detectArrivals(seenRef.current, list);
          seenRef.current = arrivals.seen;
          if (arrivals.arrived.length > 0) playChime();

          // Which tickets the person's own (not refused) requests were moving, before those checks settle.
          const ownMoves = new Map<string, KitchenStatus>();
          for (const check of Object.values(pendingRef.current)) {
            if (check.kind !== 'conflict') ownMoves.set(check.ticketId, check.to);
          }
          const resolution = resolvePendingChecks(pendingRef.current, list, seq);
          pendingRef.current = resolution.pending;
          setPending(resolution.pending);
          setCardNotices((current) => ({ ...pruneCardNotices(current, list), ...resolution.cardNotices }));
          const lastLeft = resolution.boardNotices.at(-1);
          if (lastLeft) {
            setBoardNotices((current) => appendBoardNotices(current, resolution.boardNotices));
            setAnnouncement({ key: 'kitchen.boardNotice.left', params: { label: lastLeft.label } });
          }
          // One Ticket Focus: keep the same ticket (by id) in focus; if it left its stage, say why.
          const stages = groupByStage(list);
          stagesRef.current = stages;
          const reconciled = reconcileKitchenFocus(focusRef.current, stages, {
            ownMoves,
            now: Date.now(),
            labelOf: (ticket) => labelRef.current(ticket),
          });
          commitFocus(reconciled.focus);
          const left = reconciled.notice;
          if (left) {
            const covered = resolution.boardNotices.some((entry) => entry.ticketId === left.ticketId);
            if (!left.own) setFocusNotice({ notice: left, covered });
            if (!covered) {
              setAnnouncement(
                left.kind === 'moved'
                  ? {
                      key: left.own ? 'kitchen.focus.announce.moved' : 'kitchen.focus.moved',
                      params: { label: left.label, column: columnTextRef.current(left.to) },
                    }
                  : { key: 'kitchen.focus.removed', params: { label: left.label } },
              );
            }
          }
          setBoard({ branchId: branch, tickets: list, loadedAt: new Date(), error: null });
          setNow(Date.now());
          if (staleRef.current) {
            staleRef.current = false;
            setAnnouncement({ key: 'kitchen.announce.recovered' });
          }
          return 'ok';
        } catch (error) {
          if (generationRef.current !== generation) return 'stale';
          if (isUnauthenticatedError(error)) {
            redirectToLogin();
            return 'failed';
          }
          // The last loaded board stays on screen, labelled as out of date.
          staleRef.current = true;
          setAnnouncement(null);
          setBoard((current) => ({ ...current, branchId: branch, error: describeError(error) }));
          return 'failed';
        } finally {
          if (inFlightRef.current?.seq === seq) inFlightRef.current = null;
        }
      })();
      inFlightRef.current = { seq, promise };
      return promise;
    },
    [restaurantId, playChime, commitFocus],
  );

  /** The single entry point for reads: at most one in flight, plus at most one fresh read queued behind it. */
  const requestRead = useCallback(
    (reason: ReadReason): Promise<ReadResult> => {
      const branch = branchRef.current;
      if (branch === null) return Promise.resolve('stale');
      const generation = generationRef.current;
      if (queuedRef.current) return queuedRef.current;
      const inFlight = inFlightRef.current;
      if (!inFlight) return runRead(generation, branch);
      if (reason !== 'reconcile') return inFlight.promise;
      const queued: Promise<ReadResult> = inFlight.promise.then(() => {
        if (queuedRef.current === queued) queuedRef.current = null;
        if (generationRef.current !== generation) return 'stale';
        return runRead(generation, branch);
      });
      queuedRef.current = queued;
      return queued;
    },
    [runRead],
  );

  // First load of a branch session, the polling loop and "tab visible again".
  useEffect(() => {
    if (branchId === null) return;
    void requestRead('initial');
    const timer = window.setInterval(() => void requestRead('poll'), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requestRead('visible');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [branchId, requestRead]);

  /** Refresh, Retry and "Check again": read-only, never a status change, and never two at once. */
  const refreshNow = useCallback(
    (reason: 'manual' | 'reconcile') => {
      if (refreshLockRef.current) return;
      refreshLockRef.current = true;
      setRefreshing(true);
      const generation = generationRef.current;
      void requestRead(reason).finally(() => {
        if (generationRef.current !== generation) return;
        refreshLockRef.current = false;
        setRefreshing(false);
      });
    },
    [requestRead],
  );

  function selectBranch(next: string) {
    if (next === branchRef.current) return;
    invalidateSession();
    branchRef.current = next;
    // One batched update: the previous branch's tickets, errors, time and notices never render with the new one.
    setBranchId(next);
    setBoard(EMPTY_BOARD);
    setRefreshing(false);
    setBusyIds(NO_BUSY);
    setPending({});
    setCardNotices({});
    setBoardNotices([]);
    setAnnouncement(null);
    // The new branch starts with no focus: the first read of that branch pins its own ticket.
    stagesRef.current = { ACCEPTED: [], PREPARING: [], READY: [] };
    commitFocus(initialKitchenFocus(focusRef.current.stage));
    setFocusNotice(null);
  }

  const focusOptions = { labelOf: (ticket: KitchenTicket) => labelRef.current(ticket) };
  function chooseStage(stage: KitchenStatus) {
    commitFocus(selectKitchenStage(focusRef.current, stage, stagesRef.current, focusOptions));
    setFocusNotice(null);
  }
  function chooseTicket(ticketId: string, stage: KitchenStatus = focusRef.current.stage) {
    commitFocus(selectKitchenTicket(focusRef.current, stage, ticketId, stagesRef.current, focusOptions));
    setFocusNotice(null);
  }
  function stepFocus(delta: -1 | 1) {
    commitFocus(stepKitchenFocus(focusRef.current, delta, stagesRef.current, focusOptions));
    setFocusNotice(null);
  }

  // A pause after the board moved the focus on by itself ends by itself.
  const settlingUntil = focus.guard.kind === 'settling' ? focus.guard.until : null;
  useEffect(() => {
    if (settlingUntil === null) return;
    const timer = window.setTimeout(
      () => commitFocus(settleKitchenFocus(focusRef.current, Date.now())),
      Math.max(0, settlingUntil - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [settlingUntil, commitFocus]);

  const advance = useCallback(
    async (ticket: KitchenTicket, label: string) => {
      const to = nextKitchenStatus(ticket.status);
      if (to === null) return;
      const locks = locksRef.current;
      if (locks.has(ticket.id) || pendingRef.current[ticket.id]) return;
      locks.add(ticket.id);
      const generation = generationRef.current;
      const isCurrent = () => generationRef.current === generation;
      setBusyIds((current) => new Set(current).add(ticket.id));
      setCardNotices((current) => {
        const rest = { ...current };
        delete rest[ticket.id];
        return rest;
      });

      try {
        let kind: PendingCheck['kind'];
        try {
          // A timed-out request may still have been applied: it is classified `unknown` and reconciled.
          await ordersApi.updateOrderStatus(
            restaurantId,
            ticket.id,
            { expectedStatus: ticket.status, status: to },
            { signal: AbortSignal.timeout(KITCHEN_ACTION_TIMEOUT_MS) },
          );
          kind = 'saved';
        } catch (error) {
          const failure = classifyKitchenActionError(error);
          if (failure === 'unauthenticated') {
            redirectToLogin();
            return;
          }
          if (!isCurrent()) return;
          if (failure === 'denied' || failure === 'rejected') {
            // Definitely not applied: the shown state is still right, so the ticket stays actionable.
            const notice: CardNotice =
              failure === 'denied'
                ? { kind: 'denied', status: ticket.status }
                : { kind: 'failed', status: ticket.status, message: describeError(error) };
            setCardNotices((current) => ({ ...current, [ticket.id]: notice }));
            return;
          }
          kind = failure; // 'conflict' | 'unknown'
        }
        if (!isCurrent()) return;

        // Blocked until a read that starts after this point answers for the ticket.
        pendingRef.current = {
          ...pendingRef.current,
          [ticket.id]: {
            ticketId: ticket.id,
            label,
            from: ticket.status,
            to,
            kind,
            afterRead: readSeqRef.current,
          },
        };
        setPending(pendingRef.current);
        await requestRead('reconcile');
      } finally {
        locks.delete(ticket.id);
        if (isCurrent()) {
          setBusyIds((current) => {
            const next = new Set(current);
            next.delete(ticket.id);
            return next;
          });
        }
      }
    },
    [restaurantId, requestRead],
  );

  const tickets = board.branchId === branchId ? board.tickets : null;
  const readError = board.branchId === branchId ? board.error : null;
  const loadedAt = board.branchId === branchId ? board.loadedAt : null;

  const byColumn = useMemo(() => {
    // Longest waiting in its current stage first (K2).
    return groupByStage(tickets ?? []);
  }, [tickets]);

  const columnLabel: Record<KitchenStatus, string> = {
    ACCEPTED: t('kitchen.col.new'),
    PREPARING: t('kitchen.col.preparing'),
    READY: t('kitchen.col.ready'),
  };
  const emptyLabel: Record<KitchenStatus, string> = {
    ACCEPTED: t('kitchen.empty.new'),
    PREPARING: t('kitchen.empty.preparing'),
    READY: t('kitchen.empty.ready'),
  };
  const columnAccent: Record<KitchenStatus, string> = {
    ACCEPTED: 'bg-info',
    PREPARING: 'bg-warning',
    READY: 'bg-success',
  };
  const stageTabs = COLUMNS.map((status) => ({ stage: status, label: columnLabel[status], count: byColumn[status].length }));
  const branchOptions: ChipOption<string>[] = activeBranches.map((branch) => ({
    value: branch.id,
    label: localizedName(branch, locale),
  }));

  function cardNoticeView(notice: CardNotice | undefined): KitchenCardNotice | null {
    if (!notice) return null;
    switch (notice.kind) {
      case 'denied':
        return { tone: 'error', text: t('kitchen.notice.denied') };
      case 'failed':
        return { tone: 'error', text: notice.message || t('kitchen.actionFailed') };
      case 'confirmed':
        return { tone: 'info', text: t('kitchen.notice.confirmed', { column: columnLabel[notice.status] }) };
      case 'notApplied':
        return { tone: 'info', text: t('kitchen.notice.notApplied') };
      case 'changedElsewhere':
        return { tone: 'info', text: t('kitchen.notice.changedElsewhere', { column: columnLabel[notice.status] }) };
    }
  }

  const pendingText: Record<PendingCheck['kind'], string> = {
    saved: t('kitchen.pending.saved'),
    unknown: t('kitchen.pending.unknown'),
    conflict: t('kitchen.pending.conflict'),
  };

  /**
   * A tap on an action is delivered only to the ticket the board has in focus at that moment (phone layout):
   * if a poll moved the focus after the screen was painted, a tap that still lands on the old button is refused.
   * The status route's `expectedStatus` guard and the K1 locks sit behind this, unchanged.
   */
  function guardedAdvance(target: KitchenTicket) {
    if (isPhone && kitchenActionHold(focusRef.current, target.id, Date.now()) !== null) return;
    void advance(target, kitchenTicketLabel(target, t));
  }

  function renderCard(ticket: KitchenTicket, extra: { held: boolean; stickyAction: boolean } = { held: false, stickyAction: false }) {
    const check = pending[ticket.id];
    const busy = busyIds.has(ticket.id);
    return (
      <KitchenTicketCard
        key={ticket.id}
        ticket={ticket}
        now={now}
        canUpdate={canUpdate}
        busy={busy}
        notice={cardNoticeView(cardNotices[ticket.id])}
        pending={check && !busy ? pendingText[check.kind] : null}
        checking={refreshing}
        held={extra.held}
        stickyAction={extra.stickyAction}
        onAdvance={guardedAdvance}
        onCheckAgain={() => refreshNow('reconcile')}
      />
    );
  }

  if (activeBranches.length === 0) {
    return <Alert variant="info">{t('kitchen.noBranches')}</Alert>;
  }

  const loadedTime = loadedAt ? formatTime(loadedAt) : null;
  const isStale = readError !== null && tickets !== null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('kitchen.title')}
        description={isPhone ? undefined : t('kitchen.subtitle')}
        actions={
          <>
            {/*
              Not a live region: it changes on every poll (recovery is announced
              once, below). Hidden when nothing has loaded yet and the read
              failed: the error alert already says so.
            */}
            {loadedTime === null && readError ? null : (
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  readError ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${readError ? 'bg-warning' : 'animate-pulse bg-success motion-reduce:animate-none'}`}
                />
                {loadedTime === null
                  ? t('kitchen.connecting')
                  : readError
                    ? t('kitchen.notUpToDate', { time: loadedTime })
                    : t('kitchen.updatedAt', { time: loadedTime })}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              aria-pressed={sound.preference}
              onClick={sound.toggle}
              className="min-h-11 aria-pressed:border-primary aria-pressed:text-primary"
            >
              <IconSound muted={!sound.preference} />
              {t('kitchen.sound.label')}
            </Button>
            {sound.preference && sound.audio === 'blocked' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={sound.enable}
                className="min-h-11 border-warning text-warning"
              >
                {t('kitchen.sound.enable')}
              </Button>
            ) : null}
            {sound.preference && sound.audio === 'unsupported' ? (
              <span className="text-xs font-medium text-muted-foreground">{t('kitchen.sound.unsupported')}</span>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={refreshing}
              aria-busy={refreshing || undefined}
              onClick={() => refreshNow('manual')}
              className="min-h-11"
            >
              {refreshing ? t('kitchen.refreshing') : t('kitchen.refresh')}
            </Button>
          </>
        }
      />

      <p className="sr-only" aria-live="polite">
        {announcement ? t(announcement.key, announcement.params) : ''}
      </p>

      {activeBranches.length > 1 ? (
        <ChipGroup
          ariaLabel={t('kitchen.branch')}
          options={branchOptions}
          value={branchId ?? ''}
          onChange={selectBranch}
          size="lg"
        />
      ) : null}

      {!canUpdate ? <Alert variant="info">{t('kitchen.readOnly')}</Alert> : null}

      {readError ? (
        <ReadErrorAlert
          title={
            isStale && loadedTime
              ? t('kitchen.refreshFailedTitle', { time: loadedTime })
              : t('kitchen.loadFailedTitle')
          }
          detail={readError}
          isRetrying={refreshing}
          onRetry={() => refreshNow('manual')}
        />
      ) : null}

      {/* Announced through the live region above; these stay until dismissed or the branch changes. */}
      <ul className="flex flex-col gap-2 empty:hidden">
        {boardNotices.map((notice) => (
          <li
            key={notice.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info bg-info-soft px-4 py-2.5"
          >
            <p dir="auto" className="min-w-0 flex-1 text-sm font-medium text-foreground">
              {t('kitchen.boardNotice.left', { label: notice.label })}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setBoardNotices((current) => current.filter((item) => item.id !== notice.id))}
            >
              {t('kitchen.dismiss')}
            </Button>
          </li>
        ))}
      </ul>

      {tickets === null ? (
        readError ? null : (
          <LoadingState label={t('kitchen.loading')} />
        )
      ) : (
        isPhone ? (
          <KitchenFocusView
            tabs={stageTabs}
            focus={focus}
            tickets={byColumn[focus.stage]}
            emptyLabel={emptyLabel[focus.stage]}
            now={now}
            notice={focusNotice}
            renderCard={renderCard}
            onSelectStage={chooseStage}
            onSelectTicket={(ticketId) => chooseTicket(ticketId)}
            onStep={stepFocus}
            onAcknowledge={() => {
              commitFocus(acknowledgeKitchenFocus(focusRef.current));
              setFocusNotice(null);
            }}
            onShowMoved={(ticketId, stage) => chooseTicket(ticketId, stage)}
            onDismissNotice={() => setFocusNotice(null)}
          />
        ) : (
          <div className="grid grid-cols-3 items-start gap-5">
            {COLUMNS.map((status) => (
              <section key={status} aria-label={columnLabel[status]} className="flex min-w-0 flex-col gap-3">
                <h2 className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5">
                  <span className="flex items-center gap-2 text-base font-bold text-foreground">
                    <span aria-hidden="true" className={`size-3 rounded-full ${columnAccent[status]}`} />
                    {columnLabel[status]}
                  </span>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-bold tabular-nums text-foreground">
                    {byColumn[status].length}
                  </span>
                </h2>
                {byColumn[status].length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                    {emptyLabel[status]}
                  </p>
                ) : (
                  byColumn[status].map((ticket) => renderCard(ticket))
                )}
              </section>
            ))}
          </div>
        )
      )}
    </div>
  );
}
